import YahooFinance from "yahoo-finance2";
import type { FmpCalendarItem, FmpInsightsSnapshot, FmpInsiderTrade } from "./fmp-insights.types.js";

export interface FmpInsightsOptions {
    ticker: string;
    refresh?: boolean;
}

type CachedFmpInsights = {
    data: FmpInsightsSnapshot;
    fetchedAtMs: number;
};

const insightsCache: Map<string, CachedFmpInsights> = new Map();
const INSIGHTS_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

const yf = new YahooFinance({
    suppressNotices: ["yahooSurvey"],
});

const isToday = (dateStr?: string) => {
    if (!dateStr) return false;
    const today = new Date().toISOString().slice(0, 10);
    return dateStr === today;
};

const parseTransactionText = (text: string) => {
    const lower = (text || "").toLowerCase();
    let transactionType = "Other";
    let transactionTypeName = "Other";

    if (lower.startsWith("sale")) {
        transactionType = "S-Sale";
        transactionTypeName = "Sale";
    } else if (lower.startsWith("purchase")) {
        transactionType = "P-Purchase";
        transactionTypeName = "Purchase";
    } else if (lower.startsWith("exercise") || lower.startsWith("option exercise")) {
        transactionType = "A-Acquisition";
        transactionTypeName = "Exercise";
    } else if (lower.startsWith("stock gift") || lower.startsWith("gift")) {
        transactionType = "G-Gift";
        transactionTypeName = "Gift";
    } else if (lower.startsWith("grant") || lower.startsWith("award")) {
        transactionType = "A-Acquisition";
        transactionTypeName = "Award";
    }

    let price = 0;
    const priceMatch = (text || "").match(/at price\s+([\d\.]+)/i);
    if (priceMatch && priceMatch[1]) {
        price = parseFloat(priceMatch[1]);
    }

    return { transactionType, transactionTypeName, price };
};

export const fmpInsightsProvider = async (opts: FmpInsightsOptions): Promise<FmpInsightsSnapshot> => {
    const ticker = String(opts.ticker || "").toUpperCase().trim();
    const now = Date.now();

    if (!ticker) {
        throw new Error("Ticker is required");
    }

    const cached = insightsCache.get(ticker);
    if (!opts.refresh && cached && now - cached.fetchedAtMs < INSIGHTS_TTL_MS) {
        return cached.data;
    }

    console.log(`[Yahoo Insights Provider] Fetching data for ${ticker} from Yahoo Finance...`);
    const summary = await yf.quoteSummary(ticker, {
        modules: ["calendarEvents", "insiderTransactions", "summaryDetail"]
    });

    const calendarEvents: any = (summary as any).calendarEvents ?? {};
    const insiderTransactions: any = (summary as any).insiderTransactions ?? {};
    const summaryDetail: any = (summary as any).summaryDetail ?? {};

    // 1. Process Earnings Dates
    const earnings: FmpCalendarItem[] = [];
    if (calendarEvents.earnings && Array.isArray(calendarEvents.earnings.earningsDate)) {
        for (const dateVal of calendarEvents.earnings.earningsDate) {
            if (dateVal) {
                earnings.push({
                    symbol: ticker,
                    date: new Date(dateVal).toISOString().slice(0, 10),
                    epsEstimated: calendarEvents.earnings.earningsAverage ?? undefined,
                    revenueEstimated: calendarEvents.earnings.revenueAverage ?? undefined,
                    companyName: `${ticker} Inc.`
                } as any);
            }
        }
    }

    // 2. Process Dividends Dates
    const dividends: FmpCalendarItem[] = [];
    const divDate = calendarEvents.dividendDate ?? summaryDetail.dividendDate;
    const exDivDate = calendarEvents.exDividendDate ?? summaryDetail.exDividendDate;

    if (divDate || exDivDate) {
        dividends.push({
            symbol: ticker,
            date: exDivDate ? new Date(exDivDate).toISOString().slice(0, 10) : (divDate ? new Date(divDate).toISOString().slice(0, 10) : ""),
            paymentDate: divDate ? new Date(divDate).toISOString().slice(0, 10) : undefined,
            dividend: summaryDetail.dividendRate ?? summaryDetail.trailingAnnualDividendRate ?? undefined,
            dividendYield: summaryDetail.dividendYield ?? summaryDetail.trailingAnnualDividendYield ?? undefined,
        } as any);
    }

    // 3. Process Insider Trades
    const insiderTrades: FmpInsiderTrade[] = (insiderTransactions.transactions || []).map((t: any) => {
        const { transactionType, transactionTypeName, price } = parseTransactionText(t.transactionText);
        const filingDate = t.startDate ? new Date(t.startDate).toISOString().slice(0, 10) : undefined;
        return {
            symbol: ticker,
            filingDate,
            transactionDate: filingDate,
            reportingName: t.filerName,
            transactionType,
            transactionTypeName,
            price: price || (t.shares ? t.value / t.shares : 0),
            shares: t.shares,
            value: t.value || (price * (t.shares || 0)),
            title: t.filerRelation,
        };
    });

    const insiderTradesToday = insiderTrades.filter(
        item => isToday(item.filingDate) || isToday(item.transactionDate)
    );

    const snapshot: FmpInsightsSnapshot = {
        symbol: ticker,
        calendars: {
            earnings,
            dividends,
        },
        insiderTrades,
        insiderTradesToday,
        source: "fmp", // Keep as 'fmp' to avoid breaking frontend checks, or we can use any string if needed
        fetchedAt: new Date(now).toISOString(),
    };

    insightsCache.set(ticker, {
        data: snapshot,
        fetchedAtMs: now,
    });

    return snapshot;
};
