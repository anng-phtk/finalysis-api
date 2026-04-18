import { ensureCompanyFacts, ensureCompanyFactsIndex } from "../sec-client/fact-svc.js";
import { getCIK } from "../sec-client/ticker-svc.js";
import { REPORTED_METRICS, type FetchOptions } from "../utils/types.js";

import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick.js';
import { streamValues } from 'stream-json/streamers/stream-values.js';
import fs, { access, read } from 'node:fs';   
import streamObject from "stream-json/streamers/stream-object.js";
import path from "node:path";

export const buildAccessionMap = async (indexPath: string) => {
    // Pure function: takes a file path, returns a Map. No network calls!
    const pipeline = chain([fs.createReadStream(indexPath), parser(), pick({ filter: 'filings.recent' }), streamValues()]);
    
    const accessionMap: Map<string, { form: string; reportDate: string, isAnnual: boolean }> = new Map();
    
    for await (const { value } of pipeline) {
        for (let i: number = 0; i < value['form'].length; i++) {
            const formType = value['form'][i];
            const reportDate = value['reportDate'][i];
            const accessionNumber = value['accessionNumber'][i]; 
            accessionMap.set(accessionNumber, { form: formType, reportDate, isAnnual: formType === '10-K' });
        }
    }
    return accessionMap;
}

export const extractFacts = async(ticker: string, indexFile: string, factsFile: string, opts: FetchOptions) => {
    // 1. Define the final output path immediately
    const processedPath = path.join(process.cwd(), 'data', 'cache', `processed-${ticker}.json`);

    // 2. THE SHORT-CIRCUIT: If it exists and we aren't forcing a refresh, bail out instantly!
    if (!opts?.force && fs.existsSync(processedPath)) {
        console.log(`[Cache Hit]: Returning existing processed facts for ${ticker}`);
        return processedPath;
    }
    // 3. Otherwise, proceed with the heavy lifting...

    const accessionMap: Map<string, { form: string; reportDate: string, isAnnual: boolean }> = await buildAccessionMap(indexFile);
    
    type ReportedMetricKey = keyof typeof REPORTED_METRICS;
    
    //REPORTED_METRICS
    const tagToMetricMap: Map<string, {metric:string, rank:number}> = new Map();
    
    for (const [metricKey, metricInfo] of Object.entries(REPORTED_METRICS)) {
        metricInfo.tags.forEach((tag, index) => {
            tagToMetricMap.set(tag, {metric: metricKey, rank: index});
        });
    }
    // 1. Build a reverse map of tag to metric key for quick lookup when processing facts
    console.log('1. Accession Map built successfully\n', '2. Tag to Metric Map built successfully');
    
    const results: Map<string, { metric: string, date: string; value: number; form: string; reportDate: string, rank:number }> = new Map();
    //Array<Record<string, { metric: string, date: string; value: number; form: string; reportDate: string }>> = []; // Final storage: { REVENUE: { "2023-12-31": 1000 } }
    console.log('Starting to process facts file:', factsFile);
    const pipeline = chain([fs.createReadStream(factsFile), parser(), pick({ filter: 'facts.us-gaap' }), streamObject()]);
    
    for await (const { key: tag, value: content } of pipeline) {
        const metricKey = tagToMetricMap.get(tag);
    
        if (!metricKey) {
            // Tag not in our mapping, skip
            continue;
        }
        const metric = metricKey.metric;
        const metricRank:number = metricKey.rank; 
    
        const targetUnit = REPORTED_METRICS[metric as ReportedMetricKey].opts.unit;
        const unitData = content.units[targetUnit]; // Assuming we want USD values, adjust if needed
        if (!unitData) {
            // No USD data for this tag, skip
            continue;
        }
    
        // Extract the value and date for this fact
        for (const fact of unitData) {
            if (!accessionMap.has(fact.accn)) {
                // Accession number not found in our map, skip
                continue;
            }
    
    
            if (fact.form !== '10-K' && fact.form !== '10-Q') {
                // We only care about 10-K and 10-Q reports, skip others
                continue;
            }
    
            // 2. The Coordinate Intersection:
            // We only care about facts whose 'end' matches the filing's 'reportDate'
    
            if (fact.end !== accessionMap.get(fact.accn)?.reportDate) continue;
    
            // check for instant metrics
            const metricType = REPORTED_METRICS[metric as ReportedMetricKey].opts.kind;
            
    
            if (metricType !== "INSTANT"  && fact.start) {
                const days = (Date.parse(fact.end) - Date.parse(fact.start)) / 86400000;
    
                // 10-Q: Must be a quarter (~90 days)
                if (fact.form === "10-Q" && (days < 70 || days > 110)) continue;
    
                // 10-K: Must be a year (~365 days)
                if (fact.form === "10-K" && days < 300) continue;
            }
    
    
            // 2. The Flow/Duration Sieve
            if (metricType === "FLOW" && fact.start) {
                const days = (Date.parse(fact.end) - Date.parse(fact.start)) / 86400000;
    
                // Quarter check (~3 months)
                if (fact.form.startsWith("10-Q") && (days < 70 || days > 110)) continue;
                
                // Annual check (~1 year)
                if (fact.form.startsWith("10-K") && days < 300) continue;
            }
    
    
            // finally, we have a metric we care about with a valid accession number, extract the value and date
            const date = fact.end;
            const value = fact.val;
            const accessionNumber = fact.accn;
            const form = fact.form; 
            const reportDate = accessionMap.get(accessionNumber)?.reportDate ||'';
    
    
            const rec = {
                metric: metric,
                date: String(date),
                value: value,
                form: form,
                reportDate: reportDate,
                rank: metricRank
            }
    
            const groupKey = `${reportDate}:${form}:${metric}` 
    
            if (!results.has(groupKey) ) {
                results.set(groupKey, rec);
            }
            else {
                if (!results.get(groupKey) || results.get(groupKey)!.rank >= metricRank) {
                    results.set(groupKey, rec);
                } 
            }
        }
    
    }
    // FIXED: Convert ES6 Map to standard object so JSON.stringify works
    const jsonOutput = Object.fromEntries(results);
    fs.writeFileSync(processedPath, JSON.stringify(jsonOutput, null, 2));

    return processedPath;
}