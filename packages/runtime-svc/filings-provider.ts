import { buildAccessionMap, type AccessionMeta } from "../facts-svc/fact-extractor.js";
import { ensureCompanyFactsIndex } from "../sec-client/fact-svc.js";
import { getCIK } from "../sec-client/ticker-svc.js";
import Constants from "./constants.js";
import { type FilingHistoryResponse, type FilingUrlProviderOptions, type FilingHistoryRow } from "../filings/filings.types.js";



export const filingsCache: Map<string, FilingHistoryResponse> = new Map();

export const filingsProvider = async (
    opt: FilingUrlProviderOptions
): Promise<FilingHistoryResponse> => {
    const cacheKey = opt.ticker.toUpperCase();

    if (!opt.refresh) {
        const cached = filingsCache.get(cacheKey);
        if (cached) return cached;
    }

    const cik = await getCIK(opt.ticker);
    if (!cik) throw new Error(`Could not find CIK for ticker ${opt.ticker}`);

    const indexFile = await ensureCompanyFactsIndex(cik);
    const unpaddedCIK = cik.replace(/^0+(?!$)/, "");
    const accessionMap = await buildAccessionMap(indexFile);

    const rows: FilingHistoryRow[] = [];

    accessionMap.forEach((value, accessionNumber) => {
        if (
            value.form.startsWith("10-Q") ||
            value.form.startsWith("10-K") ||
            value.form.startsWith("8-K")
        ) {
            const unformattedAccession = accessionNumber.replaceAll("-", "");
            rows.push({
                accessionNumber,
                form: value.form,
                reportDate: value.reportDate,
                primaryDocument: value.primaryDoc,
                filingUrl: `${Constants.SEC_ARCHIVE_URL}/${unpaddedCIK}/${unformattedAccession}/${value.primaryDoc}`,
            });
        }
    });

    rows.sort((a, b) => Date.parse(b.reportDate) - Date.parse(a.reportDate));

    const response: FilingHistoryResponse = {
        ticker: cacheKey,
        rows,
    };

    filingsCache.set(cacheKey, response);
    return response;
};
