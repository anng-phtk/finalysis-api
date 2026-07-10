import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

// ==================== TYPES ====================

export interface ItemLink {
    item: string;
    title: string;
    href: string;
    id: string;
}

export interface ManifestEntry {
    item: string;
    title: string;
    fileName: string;
    anchorId: string;
    nodeCount: number;
}

export interface ExploderOptions {
    outputRoot?: string;
    userAgent?: string;
    maxRetries?: number;
    keepStyles?: boolean;
    customCss?: string;
    dryRun?: boolean;
    onProgress?: (item: string, index: number, total: number) => void;
}

export interface ExploderResult {
    manifest: ManifestEntry[];
    outputRoot: string;
    dryRun: boolean;
}

// ==================== ERROR ====================

export class SecExploderError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly context?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'SecExploderError';
    }
}

// ==================== MAIN CLASS ====================

export class SecFilingExploder {
    private static readonly ITEM_PATTERN = /\b(?:Item|ITEM)\s*(\d+(?:\.[0-9A-Z]+)?(?:[A-Z](?![a-z]))?)/;
    
    private static readonly DEFAULT_CSS = `
body {
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 900px;
    margin: 12px auto;
    padding: 0 24px;
    line-height: 1.65;
    font-size: 18px;
    color: #111;
}
h1 { font-size: 30px; margin: 0 0 32px; border-bottom: 2px solid #222; padding-bottom: 12px; }
h2 { font-size: 24px; margin-top: 36px; margin-bottom: 18px; }
h3 { font-size: 20px; margin-top: 28px; margin-bottom: 12px; }
div, p { margin: 0.8rem 0; }
table { border-collapse: collapse; width: 100%; margin: 24px 0; font-size: 15px; }
td, th { border: 1px solid #ccc; padding: 6px 8px; vertical-align: top; }
a { color: #0645ad; }
`;

    private readonly url: string;
    private readonly outputRoot: string;
    private readonly options: Required<Pick<ExploderOptions, 'userAgent' | 'maxRetries' | 'keepStyles' | 'dryRun'>> & ExploderOptions;
    private readonly css: string;
    private document: Document | null = null;
    private serializer: XMLSerializer | null = null;

    constructor(url: string, options: ExploderOptions = {}) {
        // Validate URL
        if (!url || typeof url !== 'string') {
            throw new SecExploderError('INVALID_URL', 'A valid URL string must be provided');
        }
        try {
            new URL(url);
        } catch {
            throw new SecExploderError('INVALID_URL', `Invalid URL format: ${url}`);
        }

        this.url = this.stripUrlFragment(url);
        this.options = {
            userAgent: 'SecFilingExploder contact@example.com',
            maxRetries: 3,
            keepStyles: false,
            dryRun: false,
            ...options,
        };
        this.css = options.customCss || SecFilingExploder.DEFAULT_CSS;
        this.outputRoot = options.outputRoot ?? this.defaultOutputRoot();
    }

    public async explode(): Promise<ExploderResult> {
        // Initialize serializer
        const tempDom = new JSDOM();
        this.serializer = new tempDom.window.XMLSerializer();

        const html = await this.fetchWithRetry();
        const dom = new JSDOM(html);
        this.document = dom.window.document;

        this.removeSecNoise();
        this.cleanAttributes();
        this.removePageBreakNoise();
        this.promoteLikelyHeadings();

        const itemLinks = this.findTocItemLinks();
        if (itemLinks.length === 0) {
            throw new SecExploderError('NO_TOC_FOUND', 'No Table of Contents item anchors found', { url: this.url });
        }

        const manifest: ManifestEntry[] = [];

        if (!this.options.dryRun) {
            fs.mkdirSync(this.outputRoot, { recursive: true });
        }

        for (let i = 0; i < itemLinks.length; i++) {
            const current = itemLinks[i];
            if (!current) continue;
            const next = itemLinks[i + 1];

            this.options.onProgress?.(current.item, i, itemLinks.length);

            const sectionNodes = this.extractSectionNodes(current, next);
            if (sectionNodes.length === 0) {
                console.warn(`Skipping ${current.item}: no content found`);
                continue;
            }

            const fileName = this.makeItemFileName(current);
            const entry: ManifestEntry = {
                item: current.item,
                title: current.title,
                fileName,
                anchorId: current.id,
                nodeCount: sectionNodes.length,
            };
            manifest.push(entry);

            if (this.options.dryRun) {
                console.log(`  Would write: ${fileName}`);
                continue;
            }

            const outputPath = path.join(this.outputRoot, fileName);
            const sectionHtml = this.buildSectionHtml(current, sectionNodes);
            fs.writeFileSync(outputPath, sectionHtml, 'utf-8');
            console.log(`Wrote ${fileName}`);
        }

        if (manifest.length > 0 && !this.options.dryRun) {
            this.writeManifest(manifest);
        }

        console.log(`\nExploded filing into: ${this.outputRoot} (${manifest.length} sections)`);
        return { manifest, outputRoot: this.outputRoot, dryRun: this.options.dryRun };
    }

    // ==================== FETCHING ====================

    private async fetchWithRetry(): Promise<string> {
        for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
            try {
                const response = await fetch(this.url, {
                    headers: {
                        'User-Agent': this.options.userAgent,
                        Accept: 'text/html',
                    },
                });

                if (response.status === 429) {
                    const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
                    console.warn(`Rate limited. Waiting ${retryAfter}s...`);
                    await this.sleep(retryAfter * 1000);
                    continue;
                }

                if (!response.ok) {
                    throw new Error(`${response.status} ${response.statusText}`);
                }

                return response.text();
            } catch (error) {
                if (attempt === this.options.maxRetries) throw error;
                const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
                await this.sleep(delay);
            }
        }
        throw new SecExploderError('FETCH_FAILED', 'Max retries exceeded');
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ==================== TOC FINDING ====================

    private findTocItemLinks(): ItemLink[] {
        if (!this.document) throw new Error('Document not initialized');
        
        const itemLinks: ItemLink[] = [];
        const seenItems = new Set<string>();

        // Approach 1: Table rows
        const rows = Array.from(this.document.querySelectorAll('tr'));
        for (const row of rows) {
            const rowText = this.normalizeWhitespace(row.textContent ?? '');
            const match = rowText.match(SecFilingExploder.ITEM_PATTERN);
            if (!match?.[1]) continue;

            const item = match[1].toUpperCase();
            if (seenItems.has(item)) continue;

            const links = Array.from(row.querySelectorAll('a[href^="#"]'));
            const targetLink = links.find(link => {
                const linkText = link.textContent?.trim() || '';
                return !/^\d+$/.test(linkText) && linkText.length > 0;
            });

            if (targetLink) {
                const href = targetLink.getAttribute('href') ?? '';
                const id = href.replace(/^#/, '');
                if (!id) continue;

                const titleText = targetLink.textContent?.trim() || '';
                const title = this.extractTitleFromTocRow(rowText, titleText);

                itemLinks.push({ item, title, href, id });
                seenItems.add(item);
            }
        }

        // Approach 2: Fallback to individual links
        if (itemLinks.length === 0) {
            const links = Array.from(this.document.querySelectorAll('a[href^="#"]'));
            for (const link of links) {
                const text = this.normalizeWhitespace(link.textContent ?? '');
                const href = link.getAttribute('href') ?? '';

                const match = text.match(/^Item\s+(\d+[A-Z]?\.?\d*)/i);
                if (!match?.[1]) continue;

                const id = href.replace(/^#/, '');
                if (!id) continue;

                const item = match[1].toUpperCase().replace(/\./g, '');
                if (seenItems.has(item)) continue;

                const row = link.closest('tr');
                const rowText = this.normalizeWhitespace(row?.textContent ?? text);
                const title = this.extractTitleFromTocRow(rowText, text);

                itemLinks.push({ item, title, href, id });
                seenItems.add(item);
            }
        }

        return itemLinks;
    }

    private extractTitleFromTocRow(rowText: string, itemText: string): string {
        if (!/^\s*Item\s+\d/i.test(itemText)) {
            return itemText.trim();
        }

        let title = rowText
            .replace(itemText, '')
            .replace(/\b\d+\b$/, '')
            .replace(/\s+/g, ' ')
            .trim();

        return title || itemText;
    }

    // ==================== SECTION EXTRACTION ====================

    private extractSectionNodes(current: ItemLink, next?: ItemLink): Node[] {
        if (!this.document) return [];

        const start = this.findAnchorTarget(current.id);
        const end = next ? this.findAnchorTarget(next.id) : null;

        if (!start) {
            console.warn(`Anchor not found for ${current.item}: ${current.id}`);
            return [];
        }

        const startBlock = this.nearestTopLevelBlock(start);
        const endBlock = end ? this.nearestTopLevelBlock(end) : null;

        if (!startBlock) return [];

        const nodes: Node[] = [];
        let cursor: ChildNode | null = startBlock;

        while (cursor) {
            if (endBlock && cursor === endBlock) break;
            nodes.push(cursor.cloneNode(true));
            cursor = cursor.nextSibling;
        }

        return nodes;
    }

    private findAnchorTarget(id: string): Element | null {
        if (!this.document) return null;
        
        const win = this.document.defaultView;
        const escaped = win?.CSS?.escape?.(id) ?? id;
        
        return (
            this.document.getElementById(id) ??
            this.document.querySelector(`[name="${escaped}"]`) ??
            this.document.querySelector(`a[name="${escaped}"]`)
        );
    }

    private nearestTopLevelBlock(element: Element): ChildNode | null {
        let current: Element | null = element;
        while (current?.parentElement && current.parentElement.tagName.toLowerCase() !== 'body') {
            current = current.parentElement;
        }
        return current;
    }

    // ==================== CLEANING ====================

    private removeSecNoise(): void {
        if (!this.document) return;

        const noisySelectors = [
            'script', 'style', 'noscript', 'meta', 'link',
            'ix\\:header', 'ix\\:hidden', 'ix\\:references', 'ix\\:resources',
            'xbrli\\:context', 'xbrli\\:unit', 'xbrli\\:measure', 'xbrldi\\:explicitMember',
        ];
        this.document.querySelectorAll(noisySelectors.join(',')).forEach(el => el.remove());

        if (!this.options.keepStyles) {
            this.document.querySelectorAll('style').forEach(el => el.remove());
        }

        // Collect namespaced elements, then process
        const toUnwrap: Element[] = [];
        const toRemove: Element[] = [];

        this.document.querySelectorAll('*').forEach(el => {
            const tagName = el.tagName.toLowerCase();
            if (!tagName.includes(':') && !tagName.startsWith('ix-')) return;

            const shouldRemove = /^(xbrl|.*context|.*unit|.*measure|.*header|.*resources)$/i.test(tagName);
            (shouldRemove ? toRemove : toUnwrap).push(el);
        });

        toRemove.forEach(el => el.remove());

        for (const el of toUnwrap) {
            const parent = el.parentNode;
            if (!parent) continue;
            while (el.firstChild) {
                parent.insertBefore(el.firstChild, el);
            }
            el.remove();
        }
    }

    private cleanAttributes(): void {
        if (!this.document) return;

        const keepAttrs = new Set(['href', 'rowspan', 'colspan', 'id', 'name']);
        this.document.querySelectorAll('*').forEach(el => {
            for (const attr of Array.from(el.attributes)) {
                if (!keepAttrs.has(attr.name.toLowerCase())) {
                    el.removeAttribute(attr.name);
                }
            }
        });
    }

    private removePageBreakNoise(): void {
        if (!this.document) return;

        // Remove [Page X] + hr pattern
        const hrs = Array.from(this.document.querySelectorAll('hr'));
        const toRemove: Element[] = [];

        for (const hr of hrs) {
            let hasPageIndicator = false;
            const elementsInGroup: Element[] = [hr];

            // Look backwards
            let prev = hr.previousElementSibling;
            for (let i = 0; i < 3 && prev; i++) {
                const text = prev.textContent?.trim() || '';
                const isPageIndicator = /^\d+$/.test(text) ||
                    /page\s+\d+$/i.test(text) ||
                    (/\|\s*\d+$/.test(text) && text.length < 60);

                if (isPageIndicator) {
                    hasPageIndicator = true;
                    elementsInGroup.push(prev);
                    break;
                }
                if (!text && !prev.hasAttribute('id') && !prev.hasAttribute('name')) {
                    elementsInGroup.push(prev);
                }
                prev = prev.previousElementSibling;
            }

            // Look forwards for TOC link
            let next = hr.nextElementSibling;
            for (let i = 0; i < 3 && next; i++) {
                const text = next.textContent?.trim() || '';
                if (text.toLowerCase().includes('table of contents')) {
                    elementsInGroup.push(next);
                    break;
                }
                if (!text && !next.hasAttribute('id') && !next.hasAttribute('name')) {
                    elementsInGroup.push(next);
                }
                next = next.nextElementSibling;
            }

            if (hasPageIndicator) {
                toRemove.push(...elementsInGroup);
            }
        }

        toRemove.forEach(el => el.remove());

        // Remove standalone TOC links
        this.document.querySelectorAll('a').forEach(el => {
            const text = el.textContent?.trim() || '';
            if (text.toLowerCase() !== 'table of contents') return;

            let current: Element = el;
            while (current.parentElement && current.parentElement.tagName.toLowerCase() !== 'body') {
                const parent = current.parentElement;
                if ((parent.textContent?.trim() || '').toLowerCase() === 'table of contents') {
                    current = parent;
                } else {
                    break;
                }
            }
            current.remove();
        });
    }

    private promoteLikelyHeadings(): void {
        if (!this.document) return;

        this.document.querySelectorAll('div, p').forEach(el => {
            if (el.closest('table')) return;

            const text = this.normalizeWhitespace(el.textContent ?? '');
            if (!text || text.length > 140) return;

            const isItemHeading = /^item\s+\d+/i.test(text);
            const isPartHeading = /^part\s+[ivx]+$/i.test(text);
            const isSubheading = this.isLikelySubheading(text);

            if (!isItemHeading && !isPartHeading && !isSubheading) return;

            const tag = (isItemHeading || isPartHeading) ? 'h2' : 'h3';
            const heading = this.document!.createElement(tag);
            heading.textContent = text;
            el.replaceWith(heading);
        });
    }

    private isLikelySubheading(text: string): boolean {
        const patterns = [
            /^overview$/i,
            /^our\s+\w+$/i,
            /^\w+\s+and\s+\w+$/i,
            /^\w+\s+development$/i,
            /^competition$/i,
            /^intellectual\s+property$/i,
            /^employees/i,
            /^risk\s+factors?$/i,
            /^general$/i,
            /^summary$/i,
            /^executive\s+overview$/i,
            /^business\s+overview$/i,
            /^financial\s+overview$/i,
        ];
        return patterns.some(p => p.test(text));
    }

    // ==================== OUTPUT ====================

    private buildSectionHtml(item: ItemLink, nodes: Node[]): string {
        const body = nodes.map(n => this.nodeToHtml(n)).join('\n');

        return [
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            '<meta charset="utf-8">',
            `<title>${this.escapeHtml(item.item)} - ${this.escapeHtml(item.title)}</title>`,
            '<style>', this.css, '</style>',
            '</head>',
            '<body>',
            `<h1>Item ${this.escapeHtml(item.item)} — ${this.escapeHtml(item.title)}</h1>`,
            body,
            '</body>',
            '</html>',
        ].join('\n');
    }

    private nodeToHtml(node: Node): string {
        return this.serializer!.serializeToString(node);
    }

    private writeManifest(manifest: ManifestEntry[]): void {
        const jsonPath = path.join(this.outputRoot, 'manifest.json');
        fs.writeFileSync(jsonPath, JSON.stringify(manifest, null, 2), 'utf-8');

        const txtPath = path.join(this.outputRoot, 'manifest.txt');
        const lines = manifest.map(m => `${m.item} | ${m.title} | ${m.fileName}`);
        fs.writeFileSync(txtPath, lines.join('\n'), 'utf-8');
    }

    private makeItemFileName(item: ItemLink): string {
        const titleSlug = item.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 80);
        return `item_${item.item.toLowerCase()}_${titleSlug}.html`;
    }

    // ==================== UTILITIES ====================

    private defaultOutputRoot(ticker:string = 'standalone'): string {
        const parsed = new URL(this.url);
        const baseName = path.basename(parsed.pathname, path.extname(parsed.pathname));
        return path.join(process.cwd(), 'data', 'standalone', baseName);
        /*
        const cikMatch = parsed.pathname.match(/\/data\/(\d+)\//i);
        const identifier = cikMatch?.[1] || 'UNKNOWN_CIK';
        return path.join(process.cwd(), 'data', identifier, baseName);
        */
    }

    private stripUrlFragment(url: string): string {
        return url.split('#')[0] || url;
    }

    private normalizeWhitespace(value: string): string {
        return value.replace(/\u00a0/g, ' ').replace(/[ \t\r\n]+/g, ' ').trim();
    }

    private escapeHtml(value: string): string {
        return value
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }
}

// ==================== EXECUTION ====================
/*
const src = {
    AAPL_10K: 'https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm',
    AAPL_10Q: 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000010/aapl-20241228.htm',
    GOOG_10Q: 'https://www.sec.gov/Archives/edgar/data/1652044/000165204425000010/goog-20241231.htm',
};

const parser = new SecFilingExploder(src.AAPL_10K, {
    dryRun: false,
    onProgress: (item, index, total) => {
        console.log(`Processing ${item} (${index + 1}/${total})`);
    },
});

parser
    .explode()
    .then(result => {
        if (result.dryRun) {
            console.log('Dry run complete. No files written.');
        }
        console.log('Done!');
    })
    .catch(err => {
        if (err instanceof SecExploderError) {
            console.error(`[${err.code}] ${err.message}`, err.context);
        } else {
            console.error('Error:', err);
        }
        process.exit(1);
    });

    */