import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

type ItemLink = {
    item: string;
    title: string;
    href: string;
    id: string;
};

export class Sec10KExploder {
    private readonly url: string;
    private readonly outputRoot: string;

    constructor(url: string, outputRoot?: string) {
        if (!url) {
            throw new Error('Sec10KExploder: A valid URL must be provided');
        }
        this.url = this.stripUrlFragment(url);
        this.outputRoot = outputRoot ?? this.defaultOutputRoot();
    }

    public async explode(): Promise<void> {
        const html = await this.fetchHtml();
        const dom = new JSDOM(html);
        const document = dom.window.document;

        this.removeSecNoise(document);
        this.cleanAttributes(document);
        this.promoteLikelyHeadings(document);

        const itemLinks = this.findTocItemLinks(document);

        if (itemLinks.length === 0) {
            throw new Error('No TOC item anchors found.');
        }

        fs.mkdirSync(this.outputRoot, { recursive: true });

        const manifest: string[] = [];

        for (let i = 0; i < itemLinks.length; i++) {
            const current = itemLinks[i];
            if (!current) continue;
            const next = itemLinks[i + 1];

            const sectionNodes = this.extractSectionNodes(document, current, next);

            if (sectionNodes.length === 0) {
                console.warn(`Skipping ${current.item}: no content found`);
                continue;
            }

            const fileName = this.makeItemFileName(current);
            const outputPath = path.join(this.outputRoot, fileName);

            const sectionHtml = this.buildSectionHtml(current, sectionNodes);

            fs.writeFileSync(outputPath, sectionHtml, 'utf-8');

            manifest.push(`${current.item} | ${current.title} | ${fileName}`);
            console.log(`Wrote ${fileName}`);
        }

        fs.writeFileSync(
            path.join(this.outputRoot, 'manifest.txt'),
            manifest.join('\n'),
            'utf-8'
        );

        console.log(`\nExploded filing into: ${this.outputRoot}`);
    }

    private async fetchHtml(): Promise<string> {
        const response = await fetch(this.url, {
            headers: {
                'User-Agent': 'Finalysis-X parser anang@example.com',
                Accept: 'text/html',
            },
        });

        if (!response.ok) {
            throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
        }

        return response.text();
    }

    private findTocItemLinks(document: Document): ItemLink[] {
        const links = Array.from(document.querySelectorAll('a[href^="#"]'));

        const itemLinks: ItemLink[] = [];

        for (const link of links) {
            const text = this.normalizeWhitespace(link.textContent ?? '');
            const href = link.getAttribute('href') ?? '';

            const match = text.match(/^Item\s+(\d+[A-Z]?)\.?/i);
            if (!match || !match[1]) continue;

            const id = href.replace(/^#/, '');
            if (!id) continue;

            const item = match[1].toUpperCase();

            const row = link.closest('tr');
            const rowText = this.normalizeWhitespace(row?.textContent ?? text);

            const title = this.extractTitleFromTocRow(rowText, text);

            if (itemLinks.some(x => x.item === item)) continue;

            itemLinks.push({
                item,
                title,
                href,
                id,
            });
        }

        return itemLinks;
    }

    private extractTitleFromTocRow(rowText: string, itemText: string): string {
        let title = rowText
            .replace(itemText, '')
            .replace(/\b\d+\b$/, '')
            .trim();

        if (!title) title = itemText;

        return title;
    }

    private extractSectionNodes(
        document: Document,
        current: ItemLink,
        next?: ItemLink
    ): Node[] {
        const start = this.findAnchorTarget(document, current.id);
        const end = next ? this.findAnchorTarget(document, next.id) : null;

        if (!start) {
            console.warn(`Anchor target not found for ${current.item}: ${current.id}`);
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

    private findAnchorTarget(document: Document, id: string): Element | null {
        return (
            document.getElementById(id) ??
            document.querySelector(`[name="${CSS.escape(id)}"]`) ??
            document.querySelector(`a[name="${CSS.escape(id)}"]`)
        );
    }

    private nearestTopLevelBlock(element: Element): ChildNode | null {
        let current: Element | null = element;

        while (current?.parentElement && current.parentElement.tagName.toLowerCase() !== 'body') {
            current = current.parentElement;
        }

        return current;
    }

    private removeSecNoise(document: Document): void {
        document
            .querySelectorAll(
                [
                    'script',
                    'style',
                    'noscript',
                    'meta',
                    'link',
                    'ix\\:header',
                    'ix\\:hidden',
                    'ix\\:references',
                    'ix\\:resources',
                    'xbrli\\:context',
                    'xbrli\\:unit',
                    'xbrli\\:measure',
                    'xbrldi\\:explicitMember',
                ].join(',')
            )
            .forEach(el => el.remove());

        document.querySelectorAll('*').forEach(el => {
            const tagName = el.tagName.toLowerCase();
            if (tagName.includes(':') || tagName.startsWith('ix-')) {
                // If it's metadata/header type, remove it. Otherwise, unwrap it to keep contents.
                const shouldRemove = tagName.startsWith('xbrl') || 
                                     tagName.includes('context') || 
                                     tagName.includes('unit') || 
                                     tagName.includes('measure') || 
                                     tagName.includes('header') || 
                                     tagName.includes('resources');
                if (shouldRemove) {
                    el.remove();
                } else {
                    const parent = el.parentNode;
                    if (parent) {
                        while (el.firstChild) {
                            parent.insertBefore(el.firstChild, el);
                        }
                        el.remove();
                    }
                }
            }
        });
    }

    private cleanAttributes(document: Document): void {
        const keepAttrs = new Set(['href', 'rowspan', 'colspan', 'id', 'name']);

        document.querySelectorAll('*').forEach(el => {
            for (const attr of Array.from(el.attributes)) {
                if (!keepAttrs.has(attr.name.toLowerCase())) {
                    el.removeAttribute(attr.name);
                }
            }
        });
    }

    private promoteLikelyHeadings(document: Document): void {
        document.querySelectorAll('div, p').forEach(el => {
            if (el.closest('table')) return;

            const text = this.normalizeWhitespace(el.textContent ?? '');
            if (!text || text.length > 140) return;

            const isItemHeading = /^item\s+\d+[a-z]?\.?/i.test(text);
            const isPartHeading = /^part\s+[ivx]+$/i.test(text);

            const isKnownSubheading = [
                'overview',
                'our platforms',
                'gotham',
                'foundry',
                'aip',
                'apollo',
                'our customers',
                'sales and marketing',
                'customer acquisition',
                'research and development',
                'competition',
                'intellectual property',
                'employees and human capital',
            ].includes(text.toLowerCase());

            if (!isItemHeading && !isPartHeading && !isKnownSubheading) return;

            const heading = document.createElement(
                isItemHeading || isPartHeading ? 'h2' : 'h3'
            );

            heading.textContent = text;
            el.replaceWith(heading);
        });
    }

    private buildSectionHtml(item: ItemLink, nodes: Node[]): string {
        const body = nodes.map(node => this.nodeToHtml(node)).join('\n');

        return [
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            '<meta charset="utf-8">',
            `<title>${this.escapeHtml(item.item)} - ${this.escapeHtml(item.title)}</title>`,
            '<style>',
            this.readerCss(),
            '</style>',
            '</head>',
            '<body>',
            `<h1>Item ${this.escapeHtml(item.item)} — ${this.escapeHtml(item.title)}</h1>`,
            body,
            '</body>',
            '</html>',
        ].join('\n');
    }

    private nodeToHtml(node: Node): string {
        const wrapper = new JSDOM('<!DOCTYPE html><body></body>');
        const imported = wrapper.window.document.importNode(node, true);
        wrapper.window.document.body.appendChild(imported);
        return wrapper.window.document.body.innerHTML;
    }

    private readerCss(): string {
        return `
body {
  font-family: Georgia, "Times New Roman", serif;
  max-width: 900px;
  margin: 48px auto;
  padding: 0 24px;
  line-height: 1.65;
  font-size: 18px;
  color: #111;
}

h1 {
  font-family: system-ui, sans-serif;
  font-size: 30px;
  line-height: 1.25;
  margin: 0 0 32px;
  border-bottom: 2px solid #222;
  padding-bottom: 12px;
}

h2 {
  font-family: system-ui, sans-serif;
  font-size: 24px;
  margin-top: 36px;
  margin-bottom: 18px;
}

h3 {
  font-family: system-ui, sans-serif;
  font-size: 20px;
  margin-top: 28px;
  margin-bottom: 12px;
}

div, p {
  margin: 0.8rem 0;
}

span {
  line-height: inherit;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin: 24px 0;
  font-size: 15px;
}

td, th {
  border: 1px solid #ccc;
  padding: 6px 8px;
  vertical-align: top;
}

a {
  color: #0645ad;
}
`;
    }

    private makeItemFileName(item: ItemLink): string {
        const titleSlug = item.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 80);

        return `item_${item.item.toLowerCase()}_${titleSlug}.html`;
    }

    private defaultOutputRoot(): string {
        const parsed = new URL(this.url);
        const baseName = path.basename(parsed.pathname, path.extname(parsed.pathname));
        
        let ticker = 'UNKNOWN';
        const tickerMatch = baseName.match(/^([a-zA-Z]+)-/);
        if (tickerMatch && tickerMatch[1]) {
            ticker = tickerMatch[1].toUpperCase();
        } else {
            const cikMatch = this.url.match(/\/data\/(\d+)\//);
            if (cikMatch && cikMatch[1]) {
                const cik = cikMatch[1];
                const cikMap: { [key: string]: string } = {
                    '320193': 'AAPL',
                    '1321655': 'PLTR'
                };
                const mappedTicker = cikMap[cik];
                if (mappedTicker) {
                    ticker = mappedTicker;
                }
            }
        }
        
        return path.join(process.cwd(), 'data', ticker, baseName);
    }

    private stripUrlFragment(url: string): string {
        return url.split('#')[0] || url;
    }

    private normalizeWhitespace(value: string): string {
        return value
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t\r\n]+/g, ' ')
            .trim();
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


const src = {
        AAPL_8k: `https://www.sec.gov/Archives/edgar/data/320193/000032019326000011/a8-kex991q2202603282026.htm`,
        AAPL_10k: `https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm`,
        AAPL_10Q: `https://www.sec.gov/Archives/edgar/data/320193/000032019326000013/aapl-20260328.htm`
};
// ==================== EXECUTION ====================
const parser = new Sec10KExploder(
    src.AAPL_10Q
);

parser
    .explode()
    .then(() => console.log('Finalysis-X: 10-K/Q exploded successfully.'))
    .catch(err => {
        console.error('Finalysis-X: Error exploding 10-K/Q:', err?.message || err);
    });