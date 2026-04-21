import { buildAccessionMap, type AccessionMeta } from "../facts-svc/fact-extractor.js";
import Constants from "./constants.js";

export interface FilingUrlProviderOptions {
    ticker: string;
    cik: string;
    refresh?: boolean;
}

export const filingsCache: Map<string, Map<string, string>> = new Map();

export const getAllFilings = async (
    indexFile: string,
    opt: FilingUrlProviderOptions
): Promise<Map<string, string>> => {
    if (!opt.refresh) {
        const cached = filingsCache.get(opt.ticker);
        if (cached) return cached;
    }

    const unpaddedCIK = opt.cik.replace(/^0+(?!$)/, "");
    const accessionMap: Map<string, AccessionMeta> = await buildAccessionMap(indexFile);
    const primaryDocMap: Map<string, string> = new Map();

    accessionMap.forEach((value, key) => {
        if (value.form.startsWith('10-Q') || value.form.startsWith('10-K') || value.form.startsWith('8-K')) {
            const groupKey = `${value.reportDate}:${value.form}`;
            const unformattedAccession = key.replaceAll(/\-/g, '');
            primaryDocMap.set(
                groupKey,
                `${Constants.SEC_ARCHIVE_URL}/${unpaddedCIK}/${unformattedAccession}/${value.primaryDoc}`
            );
        }
    });

    filingsCache.set(opt.ticker, primaryDocMap);
    return primaryDocMap;
};
