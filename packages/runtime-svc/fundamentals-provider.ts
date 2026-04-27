import { getCIK } from "../sec-client/ticker-svc.js";
import { ensureCompanyFacts, ensureCompanyFactsIndex } from "../sec-client/fact-svc.js";
import { extractFacts, type ExtractedFactsMap, type SelectionMode } from "../facts-svc/fact-extractor.js";
import { filingsProvider } from "./filings-provider.js";
import { type FilingHistoryResponse, type FilingHistoryRow } from "../filings/filings.types.js";
import type { ColumnarGrid, FetchOptions } from "../facts-svc/metrics.types.js";
import {
    REPORTED_METRICS,
    CALCULATED_METRICS,
    type ReportedMetricKey,
    type CalculatedMetricKey,
} from "../facts-svc/metrics.types.js";

export interface FundamentalsOptions {
    ticker: string;
    refresh?: boolean;
    mode?: SelectionMode;
}

const columnarDataCache: Map<string, ColumnarGrid> = new Map();

export const fundamentalsProvider = async (opts: FundamentalsOptions): Promise<ColumnarGrid> => {

    const selectedMode = opts.mode ?? 'VALUATION';
    const cacheKey = `${opts.ticker.toUpperCase()}:${selectedMode}`;
    if (!opts.refresh) {
        const cached = columnarDataCache.get(cacheKey);
        if (cached) return cached;
    }

    const cik = await getCIK(opts.ticker);
    if (!cik || !cik.length) {
        throw new Error(`No SEC identifier (CIK) found for ${opts.ticker}`);
    }

    const fetchOptions: FetchOptions = { force: opts.refresh || false };
    const indexFile = await ensureCompanyFactsIndex(cik, fetchOptions);
    const factFile = await ensureCompanyFacts(cik, fetchOptions);

    const { facts } = await extractFacts(indexFile, factFile, selectedMode);
    const filingsMap = await filingsProvider({
        ticker: opts.ticker,
        refresh: opts.refresh || false,
    });

    if (!filingsMap || filingsMap.rows.length === 0) {
        throw new Error(`No filings found for ${opts.ticker}`);
    }

    const columnarData = buildFundamentalsGrid(facts, filingsMap, selectedMode);
    columnarDataCache.set(cacheKey, columnarData);
    return columnarData;
};

export function buildFundamentalsGrid(
    processedFacts: ExtractedFactsMap,
    filings: FilingHistoryResponse,
    mode: SelectionMode = 'VALUATION'
): ColumnarGrid {

    const isRatioOrGrowth = (calcKey: string): boolean => {
        const config = CALCULATED_METRICS[calcKey as CalculatedMetricKey];
        if (config.unit === '%' || config.unit === 'pure') return true;
        if (calcKey.startsWith('YOY_') || calcKey.includes('CAGR_') || calcKey.endsWith('_MARGIN')) return true;
        return false;
    };
    const uniqueDates = new Set<string>();
    const fastLookup: Record<string, number> = {};
    const formLookup: Map<string, string> = new Map();

    for (const fact of Object.values(processedFacts)) {
        uniqueDates.add(fact.reportDate);
        fastLookup[`${fact.metric}:${fact.reportDate}`] = fact.value;
        formLookup.set(fact.reportDate, fact.form);
    }

    const reportedPeriods = Array.from(uniqueDates).sort((a, b) => Date.parse(b) - Date.parse(a));

    const filingsLookup: Map<string, string> = new Map();
    filings.rows.forEach((row: FilingHistoryRow) => {
        const key = `${row.reportDate}:${row.form}`;
        filingsLookup.set(key, row.filingUrl);
    });

    const grid: ColumnarGrid = {
        reportedPeriods,
        FORM_TYPE: reportedPeriods.map(date => formLookup.get(date) ?? null),
        FILING_URL: reportedPeriods.map(date => {
            const form = formLookup.get(date);
            const groupKey = `${date}:${form}`;
            return filingsLookup.get(groupKey) ?? null;
        }),
    };

    const metricKeys = Object.keys(REPORTED_METRICS) as ReportedMetricKey[];
    for (const key of metricKeys) {
        grid[key] = reportedPeriods.map(date => {
            const lookupKey = `${key}:${date}`;
            return fastLookup[lookupKey] ?? null;
        });
    }

    const calcKeys = Object.keys(CALCULATED_METRICS) as CalculatedMetricKey[];
    for (const calcKey of calcKeys) {
        const config = CALCULATED_METRICS[calcKey];

        grid[calcKey] = reportedPeriods.map((_, index) => {
            const deps = config.deps.map(dep => grid[dep]?.[index] as number | null);
            const prevDeps = config.deps.map(dep => grid[dep]?.[index + 1] as number | null);

            // If current column is mixed 10-Q and 10-K, nullify ratios and period over period calculations for 10Qs
            if (mode === 'VALUATION' && grid.FORM_TYPE[index] === '10-Q' && isRatioOrGrowth(calcKey)) {
                return null;
            }

            switch (calcKey) {
                case "FREE_CASH_FLOW": {
                    const ocf = deps[0];
                    const capex = deps[1];
                    return (ocf != null && capex != null) ? ocf - capex : null;
                }

                case "OPERATING_MARGIN":
                case "NET_MARGIN": {
                    const numerator = deps[0];
                    const denominator = deps[1];
                    return (denominator != null && denominator !== 0 && numerator != null)
                        ? numerator / denominator
                        : null;
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
                    return (current != null && previous != null && previous !== 0)
                        ? (current - previous) / Math.abs(previous)
                        : null;
                }

                case "REVENUE_CAGR_3Y":
                case "NET_INC_CAGR_3Y": {
                    const current = deps[0];
                    const old3Y = grid[config.deps[0]!]?.[index + 3] as number | null | undefined;
                    return (current != null && old3Y != null && old3Y > 0 && current > 0)
                        ? Math.pow(current / old3Y, 1 / 3) - 1
                        : null;
                }

                case "REVENUE_CAGR_5Y":
                case "NET_INC_CAGR_5Y": {
                    const current = deps[0];
                    const old5Y = grid[config.deps[0]!]?.[index + 5] as number | null | undefined;
                    return (current != null && old5Y != null && old5Y > 0 && current > 0)
                        ? Math.pow(current / old5Y, 1 / 5) - 1
                        : null;
                }

                case "ROE": {
                    const netIncome = deps[0];
                    const totalEquity = deps[1];
                    const parentEquity = grid["EQUITY_ATTRIBUTABLE_TO_PARENT"]?.[index] as number | null | undefined;
                    const equity = parentEquity != null ? parentEquity : totalEquity;
                    return (netIncome != null && equity != null && equity !== 0) ? netIncome / equity : null;
                }

                case "DEBT_TO_EQUITY": {
                    const totalDebt = grid["TOTAL_DEBT"]?.[index] as number | null | undefined;
                    const totalEquity = deps[1];
                    const parentEquity = grid["EQUITY_ATTRIBUTABLE_TO_PARENT"]?.[index] as number | null | undefined;
                    const equity = parentEquity != null ? parentEquity : totalEquity;
                    return (totalDebt != null && equity != null && equity !== 0) ? totalDebt / equity : null;
                }

                case "ROIC": {
                    const opInc = deps[0];
                    const tax = deps[1];
                    const totalEquity = deps[2];
                    const totalDebt = deps[3];
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
                    return (nopat != null && investedCap != null && investedCap !== 0) ? nopat / investedCap : null;
                }

                case "EFFECTIVE_TAX_RATE": {
                    const tax = deps[0];
                    const pretax = grid["PRETAX_INCOME"]?.[index] as number | null | undefined;
                    return (pretax != null && pretax !== 0 && tax != null) ? tax / pretax : null;
                }

                case "NOPAT": {
                    const opInc = deps[0];
                    const taxRate = grid["EFFECTIVE_TAX_RATE"]?.[index] as number | null | undefined;
                    return (opInc != null && taxRate != null) ? opInc * (1 - taxRate) : null;
                }

                case "FCFF": {
                    const ocf = grid["OP_CASH_FLOW"]?.[index] as number | null | undefined;
                    const capex = grid["CAPEX"]?.[index] as number | null | undefined;
                    const interest = grid["INTEREST_EXPENSE"]?.[index] as number | null | undefined;
                    const taxRate = grid["EFFECTIVE_TAX_RATE"]?.[index] as number | null | undefined;

                    if (ocf != null && capex != null) {
                        const adjustment = (interest != null && taxRate != null) ? interest * (1 - taxRate) : 0;
                        return ocf - capex + adjustment;
                    }
                    return null;
                }

                case "INVESTED_CAPITAL": {
                    const totalEquity = deps[0];
                    const totalDebt = deps[1];
                    return (totalEquity != null) ? totalEquity + (totalDebt || 0) : null;
                }

                case "FCFE": {
                    const fcfe = grid["FREE_CASH_FLOW"]?.[index] as number | null | undefined;
                    return fcfe != null ? fcfe : null;
                }

                default:
                    return null;
            }
        });
    }

    return grid;
}
