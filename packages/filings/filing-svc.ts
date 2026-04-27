import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";

export async function getHTMLFiling(url: string) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': process.env.USER_AGENT || 'FinalysisApp contact@example.com',
            'Accept-Encoding': 'gzip, deflate',
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch HTML filing: ${response.statusText}`);
    }
    return await response.text();
}

/**
 * Extracts specific Items (1, 1A, 3, 7, 7A) from an SEC filing HTML.
 */
export function extractFilingItems(html: string) {
    const $ = cheerio.load(html);
    const requestedItemIds = ["Item 1", "Item 1A", "Item 3", "Item 7", "Item 7A"];

    // 1. Identify ALL possible Item markers to use as boundaries
    // This prevents Item 7 from bleeding into Item 8, for example.
    const allMarkers: { id: string; index: number; el: any }[] = [];
    const allElements = $('body').find('*').toArray();

    // Regex to match "ITEM 1", "ITEM 1A", "ITEM 10", etc.
    const itemRegex = /^ITEM\s+([0-9]{1,2}[A-Z]?)[.\s:]/i;

    allElements.forEach((el, idx) => {
        const $el = $(el);
        // Skip elements inside tables to avoid Table of Contents entries
        if ($el.closest('table').length > 0) return;

        const text = $el.text().replace(/\u00a0/g, ' ').trim();
        // Item headers are usually very short. If it's too long, it's likely a false positive.
        if (!text || text.length > 120) return;

        const match = text.match(itemRegex);
        if (match) {
            const itemId = `Item ${match[1]!.toUpperCase()}`;
            allMarkers.push({ id: itemId, index: idx, el });
        }
    });

    // 2. Filter markers to keep only the first valid occurrence of each unique Item ID
    allMarkers.sort((a, b) => a.index - b.index);

    const uniqueMarkers: typeof allMarkers = [];
    const seenItems = new Set<string>();

    for (const m of allMarkers) {
        if (!seenItems.has(m.id)) {
            uniqueMarkers.push(m);
            seenItems.add(m.id);
        }
    }

    const results: Record<string, { text: string; tables: string[]; confidence: number }> = {};

    // 3. Extract content for each requested Item using the identified boundaries
    for (const requestedId of requestedItemIds) {
        const markerIdx = uniqueMarkers.findIndex(m => m.id === requestedId);
        if (markerIdx === -1) continue;

        const currentMarker = uniqueMarkers[markerIdx];
        // The boundary is the very next Item marker found in the document, regardless of whether we requested it.
        const nextMarker = uniqueMarkers[markerIdx + 1];

        const startIndex = currentMarker!.index + 1;
        const endIndex = nextMarker ? nextMarker.index : allElements.length;

        const range = allElements.slice(startIndex, endIndex);

        // Filter for "top-level" elements within this range to capture content exactly once
        const topLevelElements = range.filter(el => {
            const parent = (el as any).parent;
            return !parent || !range.includes(parent);
        });

        const itemResult: { text: string; tables: string[]; confidence: number } = { text: "", tables: [], confidence: 0.95 };
        const $section = $('<div></div>');
        topLevelElements.forEach(el => {
            $section.append($(el).clone());
        });

        // Capture all tables as raw HTML
        $section.find('table').each((_, tableEl) => {
            // Only capture non-nested tables to preserve structure
            if ($(tableEl).parents('table').length === 0) {
                itemResult.tables.push($.html(tableEl));
            }
        });

        // Remove tables before extracting the clean text
        $section.find('table').remove();

        // Add newlines to preserve layout for common block/break elements
        $section.find('div, p, br').each((_, el) => {
            $(el).append('\n');
        });

        itemResult.text = $section.text()
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t]+/g, ' ')           // collapse multiple spaces/tabs
            .replace(/[ \t]*\n[ \t]*/g, '\n')  // trim horizontal whitespace around newlines
            .replace(/\n{3,}/g, '\n\n')        // collapse multiple newlines into max 2
            .trim();

        results[requestedId] = itemResult;
    }

    return results;
}


export async function testGetHTMLFiling() {
    const url = "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm";
    // const url = "https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm";
    console.log(`Fetching filing from ${url}...`);

    try {
        const html = await getHTMLFiling(url);
        console.log("Extracting items...");
        const items = extractFilingItems(html);

        const outputPath = path.join(process.cwd(), "filing_items.json");
        fs.writeFileSync(outputPath, JSON.stringify(items, null, 2));

        console.log(`Extracted items: ${Object.keys(items).join(", ")}`);
        console.log(`Results saved to: ${outputPath}`);
    } catch (error) {
        console.error("Error in testGetHTMLFiling:", error);
    }
}

/*
// Execute the test
if (require.main === module) {
    testGetHTMLFiling().then(() => console.log("Done."));
}

*/