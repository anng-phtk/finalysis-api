import { getCIK } from "../sec-client/ticker-svc.js";
import { ensureCompanyFacts, ensureCompanyFactsIndex } from "../sec-client/fact-svc.js";
import type { FetchOptions } from "../utils/types.js";
import { extractFacts } from "../facts-svc/fact-extractor.js";
import { REPORTED_METRICS, CALCULATED_METRICS, type ReportedMetricKey, type CalculatedMetricKey } from "../utils/types.js";
import fs from 'node:fs';
import { type ColumnarGrid } from "../utils/types.js";
import { getAllFilings } from "./filings-provider.js";

export interface FundamentalsOptions {
    ticker: string;
    periods: 3 | 5 | 'all';
    formType: '10-K' | '10-Q' | 'both';
    refresh: boolean | false;
    autoSave?: boolean | false;
}

import { exportGridToExcel } from "../storage/excel-svc.js";

const columnarDataCache: Map<string, ColumnarGrid> = new Map();

export const fundamentalsProvider = async (opts: FundamentalsOptions) => {
    // 1. check cache and return if found
    // 2. also check if forced to update
    if (!opts.refresh) {
        const cached = columnarDataCache.get(`${opts.ticker}:${opts.periods}:${opts.formType}`);
        if (cached) return cached;
    }

    const cik = await getCIK(opts.ticker);
    if (!cik || !cik.length) throw new Error(`No SEC identifier (CIK) found for ${opts.ticker}`);

    const options: FetchOptions = { force: opts.refresh || false };

    // 1. Data Access (Network/Cache)
    const indexFile = await ensureCompanyFactsIndex(cik, options);
    const factFile = await ensureCompanyFacts(cik, options);

    // 2. Data Engineering (Deduplication / Stream)
    const processedFile = await extractFacts(opts.ticker, indexFile, factFile, options);
    const filingsMap: Map<string, string> = await getAllFilings(indexFile, opts);
    if (!filingsMap || filingsMap.size === 0) throw new Error(`No filings found for ${opts.ticker}`);

    // 3. Financial Engineering (Pivoting / Math)
    const columnarData = await FinancialGridProvider(processedFile, filingsMap, opts.formType);

    // 4. Update cache
    columnarDataCache.set(`${opts.ticker}:${opts.periods}:${opts.formType}`, columnarData);

    if (opts.autoSave) {
        // 5. Export to Excel (Server-side to DMP folder)
        await saveToDrive(opts.ticker, opts.periods.toString(), opts.formType);
    }

    // 6. Send it back to the Controller!
    return columnarData;
}

/**
 * Reusable function to save cached financial data to the local G:\ drive (DMP folder)
 */
export async function saveToDrive(ticker: string, periods: string, formType: string) {
    const cacheKey = `${ticker}:${periods}:${formType}`;
    const data = columnarDataCache.get(cacheKey);

    if (!data) {
        console.warn(`[SaveToDrive]: No cached data found for ${cacheKey}. Run fundamentalsProvider first.`);
        return null;
    }

    try {
        const path = await exportGridToExcel(ticker, data);
        return path;
    } catch (err) {
        console.error(`[SaveToDrive]: Failed to save ${ticker} for ${periods} periods`, err);
        throw err;
    }
}



export async function FinancialGridProvider(processedFile: string, filings: Map<string, string>, formType: string): Promise<ColumnarGrid> {

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

        // NEW: Add the URL right into the column!
        grid['FILING_URL'] = reportedPeriods.map(date => {
            const form = formLookup.get(date);
            const groupKey = `${date}:${form}`;
            return filings.get(groupKey) ?? null;
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
                // -------- Already correct (keep as is) --------
                case "FREE_CASH_FLOW": {
                    const ocf = deps[0];
                    const capex = deps[1];
                    return (ocf != null && capex != null) ? ocf - capex : null;
                }

                case "OPERATING_MARGIN":
                case "NET_MARGIN": {
                    const numerator = deps[0];
                    const denominator = deps[1];
                    if (denominator != null && denominator !== 0 && numerator != null) {
                        return numerator / denominator;
                    }
                    return null;
                }

                case "TOTAL_DEBT": {
                    const shortTerm = deps[0];
                    const longTerm = deps[1];
                    return (shortTerm != null && longTerm != null) ? shortTerm + longTerm : null;
                }

                case "FCF_TO_CAPEX": {
                    const fcf = deps[0];
                    const capex = deps[1];
                    return (fcf != null && capex != null && capex !== 0) ? fcf / Math.abs(capex) : null;
                }

                case "YOY_REVENUE_GROWTH":
                case "YOY_NET_INCOME_GROWTH":
                case "YOY_FCF_GROWTH": {
                    const current = deps[0];
                    const previous = prevDeps[0];
                    if (current != null && previous != null && previous !== 0) {
                        return (current - previous) / Math.abs(previous);
                    }
                    return null;
                }

                case "REVENUE_CAGR_3Y":
                case "NET_INC_CAGR_3Y": {
                    const current = deps[0];
                    const old3Y = grid[config.deps[0]!]?.[index + 3] as number | null | undefined;
                    if (current != null && old3Y != null && old3Y > 0 && current > 0) {
                        return Math.pow(current / old3Y, 1 / 3) - 1;
                    }
                    return null;
                }

                case "REVENUE_CAGR_5Y":
                case "NET_INC_CAGR_5Y": {
                    const current = deps[0];
                    const old5Y = grid[config.deps[0]!]?.[index + 5] as number | null | undefined;
                    if (current != null && old5Y != null && old5Y > 0 && current > 0) {
                        return Math.pow(current / old5Y, 1 / 5) - 1;
                    }
                    return null;
                }

                // -------- FIXED: ROE (prefer parent equity) --------
                case "ROE": {
                    const netIncome = deps[0];
                    const totalEquity = deps[1];
                    const parentEquity = grid["EQUITY_ATTRIBUTABLE_TO_PARENT"]?.[index] as number | null | undefined;
                    const equity = parentEquity != null ? parentEquity : totalEquity;
                    if (netIncome != null && equity != null && equity !== 0) {
                        return netIncome / equity;
                    }
                    return null;
                }

                // -------- FIXED: DEBT_TO_EQUITY (prefer parent equity) --------
                case "DEBT_TO_EQUITY": {
                    const totalDebt = grid["TOTAL_DEBT"]?.[index] as number | null | undefined;
                    const totalEquity = deps[1];
                    const parentEquity = grid["EQUITY_ATTRIBUTABLE_TO_PARENT"]?.[index] as number | null | undefined;
                    const equity = parentEquity != null ? parentEquity : totalEquity;
                    if (totalDebt != null && equity != null && equity !== 0) {
                        return totalDebt / equity;
                    }
                    return null;
                }

                // -------- FIXED: ROIC (using effective tax rate) --------
                case "ROIC": {
                    const opInc = deps[0];
                    const tax = deps[1];
                    const totalEquity = deps[2];
                    const totalDebt = deps[3];

                    // Get pretax income for tax rate calculation
                    const pretax = grid["PRETAX_INCOME"]?.[index] as number | null | undefined;

                    let effTaxRate: number | null = null;
                    if (pretax != null && pretax !== 0 && tax != null) {
                        effTaxRate = tax / pretax;
                    } else {
                        const netInc = grid["NET_INCOME"]?.[index] as number | null | undefined;
                        if (netInc != null && tax != null && (netInc + tax) !== 0) {
                            effTaxRate = tax / (netInc + tax);
                        }
                    }

                    const nopat = (opInc != null && effTaxRate != null) ? opInc * (1 - effTaxRate) : null;
                    const investedCap = (totalEquity != null) ? totalEquity + (totalDebt || 0) : null;

                    if (nopat != null && investedCap != null && investedCap !== 0) {
                        return nopat / investedCap;
                    }
                    return null;
                }

                // -------- NEW CALCULATIONS --------
                case "EFFECTIVE_TAX_RATE": {
                    const tax = deps[0];
                    const pretax = grid["PRETAX_INCOME"]?.[index] as number | null | undefined;
                    if (pretax != null && pretax !== 0 && tax != null) {
                        return tax / pretax;
                    }
                    return null;
                }

                case "NOPAT": {
                    const opInc = deps[0];
                    const taxRate = grid["EFFECTIVE_TAX_RATE"]?.[index] as number | null | undefined;
                    if (opInc != null && taxRate != null) {
                        return opInc * (1 - taxRate);
                    }
                    return null;
                }

                case "FCFF": {
                    const ocf = grid["OP_CASH_FLOW"]?.[index] as number | null | undefined;
                    const capex = grid["CAPEX"]?.[index] as number | null | undefined;
                    const interest = grid["INTEREST_EXPENSE"]?.[index] as number | null | undefined;
                    const taxRate = grid["EFFECTIVE_TAX_RATE"]?.[index] as number | null | undefined;

                    if (ocf != null && capex != null) {
                        let adjustment = 0;
                        if (interest != null && taxRate != null) {
                            adjustment = interest * (1 - taxRate);
                        }
                        return ocf - capex + adjustment;
                    }
                    return null;
                }

                case "INVESTED_CAPITAL": {
                    const totalEquity = deps[0];
                    const totalDebt = deps[1];
                    if (totalEquity != null) {
                        return totalEquity + (totalDebt || 0);
                    }
                    return null;
                }

                case "FCFE": {
                    // Alias for FREE_CASH_FLOW
                    const fcfe = grid["FREE_CASH_FLOW"]?.[index] as number | null | undefined;
                    return fcfe != null ? fcfe : null;
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
    ticker: 'NVDA',
    formType: '10-K',
    periods: 'all',
    refresh: true
} as FundamentalsOptions);