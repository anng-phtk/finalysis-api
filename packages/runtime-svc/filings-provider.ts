
import { buildAccessionMap } from "../facts-svc/fact-extractor.js";
import type { FetchOptions } from "../utils/types.js";
import { ensureCompanyFactsIndex } from "../sec-client/fact-svc.js";
import { getCIK } from "../sec-client/ticker-svc.js";
import Constants from "./constants.js";
import path from "node:path";

export interface FundamentalsOptions {
    ticker: string;
    periods: 3 | 5 | 'all';
    formType: '10-K' | '10-Q' | 'both';
    refresh: boolean | false;
}

export const filings_cache: Map<string, Map<string, string>> = new Map();

export const getAllFilings = async (indexFile: string, opt: FundamentalsOptions): Promise<Map<string, string>> => {
    // 1. check cache and return if found
    // 2. also check if forced to update
    if (!opt.refresh) {
        const cached = filings_cache.get(opt.ticker);
        if (cached) return cached;
    }

    const cik = await getCIK(opt.ticker);
    if (!cik || !cik.length) throw new Error(`No SEC identifier (CIK) found for ${opt.ticker}`);
    const fileFetchOptions: FetchOptions = { force: opt.refresh || false };

    const unpaddedCIK = cik.replace(/^0+(?!$)/, "");
    const accessionMap: Map<string, { form: string; reportDate: string, primaryDoc: string, isAnnual: boolean }> = await buildAccessionMap(indexFile);

    let primaryDocMap: Map<string, string> = new Map();

    accessionMap.forEach((value, key) => {
        if (value.form.startsWith('10-Q') || value.form.startsWith('10-K') || value.form.startsWith('8-K')) {
            const groupKey: string = `${value.reportDate}:${value.form}`;
            const unformattedAccession: string = key.replaceAll(/\-/g, '');
            // Construct the URL natively
            primaryDocMap.set(groupKey, `${Constants.SEC_ARCHIVE_URL}/${unpaddedCIK}/${unformattedAccession}/${value.primaryDoc}`);
        }
    });
    // update cache
    filings_cache.set(cik, primaryDocMap);
    return primaryDocMap;
}

/**
const indexFile = path.join(process.cwd(), 'data','cache', 'CIK0000320193.json');
console.log(await getAllFilings(indexFile, {
    ticker:'AAPL',
    formType:'10-K',
    periods:3,
    refresh:false 
}));
 */