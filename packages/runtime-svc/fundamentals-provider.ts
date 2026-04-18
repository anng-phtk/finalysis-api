import { getCIK } from "../sec-client/ticker-svc.js";
import { ensureCompanyFacts, ensureCompanyFactsIndex } from "../sec-client/fact-svc.js";
import type { FetchOptions } from "../utils/types.js";
import { extractFacts } from "../facts-svc/fact-extractor.js";
import { REPORTED_METRICS, CALCULATED_METRICS, type ReportedMetricKey, type CalculatedMetricKey } from "../utils/types.js";
import fs from 'node:fs';
import { type ColumnarGrid } from "../utils/types.js";

export interface FundamentalsOptions {
    ticker: string;
    periods: 3 | 5 | 'all';
    formType: '10-K' | '10-Q' | 'both';
    refresh: boolean | false;
}

export const fundamentalsProvider = async (opts: FundamentalsOptions) => {
    const cik = await getCIK(opts.ticker);
    if (!cik || !cik.length) throw new Error(`No SEC identifier (CIK) found for ${opts.ticker}`);

    const options: FetchOptions = { force: opts.refresh || false };

    // 1. Data Access (Network/Cache)
    const indexFile = await ensureCompanyFactsIndex(cik, options);
    const factFile = await ensureCompanyFacts(cik, options);

    // 2. Data Engineering (Deduplication / Stream)
    const processedFile = await extractFacts(opts.ticker, indexFile, factFile, options);

    // 3. Financial Engineering (Pivoting / Math)
    const columnarData = await FinancialGridProvider(processedFile, opts.formType);

    // 4. Send it back to the Controller!
    return columnarData;
}



export async function FinancialGridProvider(processedFile: string, formType: string): Promise<ColumnarGrid> {

    // STEP 1: Load the Pristine Data
    const rawData = JSON.parse(fs.readFileSync(processedFile, 'utf-8'));

    // STEP 2: Pass 1 - Build Timeline & Fast Lookup
    const uniqueDates = new Set<string>();
    const fastLookup: Record<string, number> = {};
    const formLookup: Map<string, string> = new Map<string, string>();
    
    
    for (const fact of Object.values<any>(rawData)) {

        if (fact.form.startsWith(formType) || formType === 'both') {
            uniqueDates.add(fact.reportDate);
            fastLookup[`${fact.metric}:${fact.reportDate}`] = fact.value;
            formLookup.set(fact.reportDate, fact.form);
        }
    }
    

    // Lock the master timeline descending
    const reportedPeriods = Array.from(uniqueDates).sort((a, b) => Date.parse(b) - Date.parse(a));

   
    const grid: ColumnarGrid = {
        reportedPeriods
    };

    // STEP 3: Pass 2 - Pivot Reported Metrics
    const metricKeys = Object.keys(REPORTED_METRICS) as ReportedMetricKey[];

    for (const key of metricKeys) {
        grid['FORM_TYPE'] = reportedPeriods.map(date => {
            const lookupKey = `${date}`;
            return formLookup.get(lookupKey) ?? null;
        });
    }
    for (const key of metricKeys) {
        grid[key] = reportedPeriods.map(date => {
            const lookupKey = `${key}:${date}`;
            return fastLookup[lookupKey] ?? null;
        });
    }

    // STEP 4: Compute Calculated Metrics
    const calcKeys = Object.keys(CALCULATED_METRICS) as CalculatedMetricKey[];

    for (const calcKey of calcKeys) {
        const config = CALCULATED_METRICS[calcKey];

        grid[calcKey] = reportedPeriods.map((_, index) => {
            const deps = config.deps.map(dep => grid[dep]?.[index] as number | null);
            const prevDeps = config.deps.map(dep => grid[dep]?.[index + 1] as number | null);

            const val0 = deps[0];
            const val1 = deps[1];

            switch (calcKey) {
                case "FREE_CASH_FLOW": return (val0 != null && val1 != null) ? val0 - val1 : null;
                case "OPERATING_MARGIN":
                case "NET_MARGIN": return val1 ? val0! / val1 : null;
                case "TOTAL_DEBT": return (val0 != null && val1 != null) ? val0 + val1 : null;
                case "ROE":
                case "DEBT_TO_EQUITY": return val1 ? val0! / val1 : null;
                case "FCF_TO_CAPEX": return (val0 != null && val1) ? val0 / Math.abs(val1) : null;
                case "YOY_REVENUE_GROWTH":
                case "YOY_NET_INCOME_GROWTH":
                case "YOY_FCF_GROWTH":
                    return (val0 != null && prevDeps[0]) ? (val0 - prevDeps[0]) / Math.abs(prevDeps[0]) : null;
                case "ROIC": {
                    // deps[0] = OP_INCOME, deps[1] = TAX
                    const nopat = (val0 != null && val1 != null) ? val0 - val1 : null;
                    // deps[2] = TOTAL_EQUITY, deps[3] = TOTAL_DEBT
                    const investedCap = (deps[2] != null) ? deps[2] + (deps[3] || 0) : null;
                    return (nopat != null && investedCap) ? nopat / investedCap : null;
                }

                // --- RESTORED: CAGRs ---
                case "REVENUE_CAGR_3Y":
                case "NET_INC_CAGR_3Y": {
                    // Because index 0 is the NEWEST date, index + 3 looks exactly 3 years into the past
                    const old3Y = grid[config.deps[0]!]?.[index + 3] as number | null;
                    if (val0 != null && old3Y != null && old3Y > 0 && val0 > 0) {
                        return Math.pow(val0 / old3Y, 1 / 3) - 1;
                    }
                    return null;
                }

                case "REVENUE_CAGR_5Y":
                case "NET_INC_CAGR_5Y": {
                    // Look 5 years into the past
                    const old5Y = grid[config.deps[0]!]?.[index + 5] as number | null;
                    if (val0 != null && old5Y != null && old5Y > 0 && val0 > 0) {
                        return Math.pow(val0 / old5Y, 1 / 5) - 1;
                    }
                    return null;
                }

                default:
                    console.warn(`[Math Engine]: Calculation not implemented for ${calcKey}`);
                    return null;
            }
        });
    }


    console.log(`here's a fully prepared grid \n-----------------------\n`, grid);
    return grid;
}

await fundamentalsProvider({
    ticker: 'AAPL',
    formType: '10-K',
    periods: 'all',
    refresh: true
} as FundamentalsOptions);