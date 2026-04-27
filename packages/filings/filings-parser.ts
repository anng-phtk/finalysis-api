import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

/**
 * Native Node.js implementation of the SEC Filing Parser.
 * Replaces the Python-based sec_parser.py to simplify deployment and improve performance.
 */

export interface ParsedSections {
    [key: string]: string;
}

export const SEC_USER_AGENT = 'Finalysis_Terminal (your.email@example.com)';

/**
 * Fetches the raw HTML from the SEC using the required User-Agent.
 */
async function fetchFilingHtml(url: string): Promise<string> {
    const response = await fetch(url, {
        headers: {
            'User-Agent': SEC_USER_AGENT,
            'Accept-Encoding': 'gzip, deflate',
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch SEC filing: ${response.status} ${response.statusText}`);
    }

    return response.text();
}

/**
 * Serializes a <table> into a flat text format easier for LLMs to read.
 */
function serializeTable($: cheerio.CheerioAPI, table: cheerio.Cheerio<any>): string {
    const rows: string[] = [];

    $(table).find('tr').each((_, tr) => {
        const cells: string[] = [];
        $(tr).find('td, th').each((_, td) => {
            let text = $(td).text().trim();
            // Clean up whitespace
            text = text.replace(/\xA0/g, ' '); // nbsp
            text = text.replace(/\s+/g, ' ');
            if (text) {
                cells.push(text);
            }
        });

        if (cells.length > 0) {
            rows.push(`[TABLE_ROW]: ${cells.join(' | ')}`);
        }
    });

    if (rows.length === 0) return "";

    return `\n[TABLE_START]\n${rows.join('\n')}\n[TABLE_END]\n`;
}

/**
 * Converts HTML to a cleaned, Markdown-like text format.
 */
function cleanHtmlToText(html: string): string {
    const $ = cheerio.load(html);

    // Replace tables with serialized versions
    $('table').each((_, table) => {
        const serialized = serializeTable($, $(table));
        $(table).replaceWith(serialized);
    });

    // Remove scripts and styles
    $('script, style, link, meta').remove();

    // Get cleaned text
    const rawText = $('body').text() || $.text();

    // Clean up vertical whitespace
    return rawText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');
}

/**
 * Extracts key sections (Item 1, 1A, 3, 7) using regex boundaries.
 */
function extractSections(text: string): ParsedSections {
    const patterns: Record<string, RegExp> = {
        "Item 1: Business": /(Item\s+1\.\s+Business[\s\S]*?)(?=Item\s+1A\.|Item\s+2\.)/gi,
        "Item 1A: Risk Factors": /(Item\s+1A\.\s+Risk Factors[\s\S]*?)(?=Item\s+1B\.|Item\s+2\.)/gi,
        "Item 3: Legal Proceedings": /(Item\s+3\.\s+Legal Proceedings[\s\S]*?)(?=Item\s+4\.)/gi,
        "Item 7: MD&A": /(Item\s+7\.\s+Management[\s\S]*?)(?=Item\s+7[A-Z]\.|Item\s+8\.)/gi
    };

    const extracted: ParsedSections = {};

    for (const [name, pattern] of Object.entries(patterns)) {
        let bestMatch = "";
        let maxLen = -1;

        // Reset regex state for global search
        pattern.lastIndex = 0;
        let match;

        while ((match = pattern.exec(text)) !== null) {
            const content = match[1]!.trim();
            if (!content) continue;
            // Filter out small matches (like Table of Contents entries)
            if (content.length > maxLen) {
                maxLen = content.length;
                bestMatch = content;
            }
        }

        extracted[name] = (bestMatch && maxLen > 300)
            ? bestMatch
            : "Section not found or could not be isolated.";
    }

    return extracted;
}

/**
 * Main orchestration function for the JS-native parser.
 */
export async function parseFilingJs(url: string): Promise<{ content: string; sections: ParsedSections }> {
    const html = await fetchFilingHtml(url);
    const cleanedText = cleanHtmlToText(html);
    const sections = extractSections(cleanedText);

    // Format the combined content for the response
    let finalOutput = "";
    for (const [name, content] of Object.entries(sections)) {
        finalOutput += `### ${name}\n\n${content}\n\n${'='.repeat(50)}\n\n`;
    }

    return {
        content: finalOutput.trim(),
        sections,
    };
}
