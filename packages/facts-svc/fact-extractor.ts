import { ensureCompanyFacts, ensureCompanyFactsIndex, type FetchOptions } from "../sec-client/fact-svc.js";
import { getCIK } from "../sec-client/ticker-svc.js";

import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick.js';
import { streamValues } from 'stream-json/streamers/stream-values.js';
import fs, { access, read } from 'node:fs';   

export const buildAccessionMap = async (ticker:string, opts: FetchOptions) => {
    // 1. Get CIK for ticker (or throw if not found)
    const cik = await getCIK(ticker) || (() => { throw new Error(`CIK not found for ticker: ${ticker}`) })();
    // 2. Get path to company facts index JSON (downloads if not cached)
    // 2. Get latest company facts index and map to accession number
    const indexPath = await ensureCompanyFactsIndex(cik, opts);
    const factsPath = await ensureCompanyFacts(cik, opts);

    // 3. Load the latest JSON and extract the accession numbers for each report
    const pipline = chain([fs.createReadStream(indexPath), parser(), pick({ filter: 'filings.recent' }), streamValues()]);

    
    const accessionMap: Map<string, { form: string; reportDate: string }> = new Map();
    for await (const { value } of pipline) {
        console.log(`Processing filings for CIK:${cik}`, value);

        let counter = 0;
        for (const val of value['form']) {
            if (val === '10-K' || val === '10-Q') {
                accessionMap.set(value['accession'][counter], { form: val, reportDate: value['reportDate'][counter] });
            }
            counter++;
        }
    }
    
    console.log('Accession Map built successfully', accessionMap);
}
