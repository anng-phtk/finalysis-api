import YahooFinance from "yahoo-finance2/src/index.ts";
import type {
    QuoteSnapshot,
    PriceHistorySnapshot,
    ResearchSnapshot,
} from "./quote.types.js";

type CachedQuote = {
    data: QuoteSnapshot;
    fetchedAtMs: number;
};

type CachedHistory = {
    data: PriceHistorySnapshot;
    fetchedAtMs: number;
};

type CachedResearch = {
    data: ResearchSnapshot;
    fetchedAtMs: number;
};

const quoteCache: Map<string, CachedQuote> = new Map();
const historyCache: Map<string, CachedHistory> = new Map();
const researchCache: Map<string, CachedResearch> = new Map();

const QUOTE_TTL_MS = 1000 * 60 * 30;          // 30 min
const HISTORY_TTL_MS = 1000 * 60 * 60 * 12;   // 12 hours
const RESEARCH_TTL_MS = 1000 * 60 * 60 * 24;  // 24 hours

const yf = new YahooFinance({
    suppressNotices: ["yahooSurvey"],
});

export const fetchStockQuoteYahoo = async (
    ticker: string,
    refresh: boolean = false
): Promise<QuoteSnapshot> => {
    const symbol = ticker.toUpperCase().trim();
    const now = Date.now();

    if (!symbol) throw new Error("Ticker is required");

    const cached = quoteCache.get(symbol);
    if (!refresh && cached && now - cached.fetchedAtMs < QUOTE_TTL_MS) {
        return cached.data;
    }

    const quote = await yf.quote(symbol);

    const snapshot: QuoteSnapshot = {
        symbol: quote.symbol,
        shortName: quote.shortName,
        longName: quote.longName,
        exchange: quote.exchange,
        currency: quote.currency,
        marketState: quote.marketState,
        marketTime: quote.marketTime,
        price: {
            current: quote.regularMarketPrice,
            change: quote.regularMarketChange,
            changePercent: quote.regularMarketChangePercent,
            open: quote.regularMarketOpen,
            previousClose: quote.regularMarketPreviousClose,
            dayLow: quote.regularMarketDayLow,
            dayHigh: quote.regularMarketDayHigh,
            volume: quote.regularMarketVolume,
            bid: quote.bid,
            ask: quote.ask,
        },
        valuation: {
            marketCap: quote.marketCap,
            trailingPE: quote.trailingPE,
            forwardPE: quote.forwardPE,
            priceToBook: quote.priceToBook,
            bookValue: quote.bookValue,
            epsTTM: quote.epsTrailingTwelveMonths,
            epsForward: quote.epsForward,
            epsCurrentYear: quote.epsCurrentYear,
        },
        range: {
            week52Low: quote.fiftyTwoWeekLow,
            week52High: quote.fiftyTwoWeekHigh,
            fiftyDayAverage: quote.fiftyDayAverage,
            twoHundredDayAverage: quote.twoHundredDayAverage,
        },
        dividend: {
            dividendRate: quote.dividendRate,
            dividendYield: quote.dividendYield,
            trailingDividendRate: quote.trailingAnnualDividendRate,
            trailingDividendYield: quote.trailingAnnualDividendYield,
            dividendDate: quote.dividendDate,
        },
        analyst: {
            averageRating: quote.averageAnalystRating,
        },
        events: {
            earningsDate: quote.earningsTimestamp,
            earningsCallStart: quote.earningsCallTimestampStart,
            isEarningsDateEstimate: quote.isEarningsDateEstimate,
        },
        source: "yahoo",
        fetchedAt: new Date(now).toISOString(),
    };

    quoteCache.set(symbol, {
        data: snapshot,
        fetchedAtMs: now,
    });

    return snapshot;
};

export const fetchStockHistoryYahoo = async (
    ticker: string,
    range: string = "5y",
    interval: string = "1d",
    refresh: boolean = false
): Promise<PriceHistorySnapshot> => {
    const symbol = ticker.toUpperCase().trim();
    const now = Date.now();

    if (!symbol) throw new Error("Ticker is required");

    const cacheKey = `${symbol}:${range}:${interval}`;
    const cached = historyCache.get(cacheKey);
    if (!refresh && cached && now - cached.fetchedAtMs < HISTORY_TTL_MS) {
        return cached.data;
    }

    // start period is today
    // end period is 5 years ago
    const startPeriod = new Date(now).toISOString();
    const endPeriod = new Date(now - 1000 * 60 * 60 * 24 * 365 * 5).toISOString();
    const chart = await yf.chart(symbol, {
        period1: endPeriod,
        period2: startPeriod,
        interval: interval as any,
    });

    const bars = (chart.quotes ?? []).map((bar: any) => ({
        date: bar.date instanceof Date ? bar.date.toISOString() : String(bar.date),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        adjClose: bar.adjclose ?? bar.adjClose,
    }));

    const snapshot: PriceHistorySnapshot = {
        symbol,
        range,
        interval,
        bars,
        source: "yahoo",
        fetchedAt: new Date(now).toISOString(),
    };

    historyCache.set(cacheKey, {
        data: snapshot,
        fetchedAtMs: now,
    });

    return snapshot;
};

export const fetchStockResearchYahoo = async (
    ticker: string,
    refresh: boolean = false
): Promise<ResearchSnapshot> => {
    const symbol = ticker.toUpperCase().trim();
    const now = Date.now();

    if (!symbol) throw new Error("Ticker is required");

    const cached = researchCache.get(symbol);
    if (!refresh && cached && now - cached.fetchedAtMs < RESEARCH_TTL_MS) {
        return cached.data;
    }

    const [quote, summary] = await Promise.all([
        yf.quote(symbol),
        yf.quoteSummary(symbol, {
            modules: ["financialData", "summaryDetail", "defaultKeyStatistics", "recommendationTrend"],
        }),
    ]);

    const financialData = (summary as any).financialData ?? {};
    const summaryDetail = (summary as any).summaryDetail ?? {};
    const defaultKeyStatistics = (summary as any).defaultKeyStatistics ?? {};
    const recommendationTrend = (summary as any).recommendationTrend ?? {};

    const snapshot: ResearchSnapshot = {
        symbol,
        beta:
            summaryDetail.beta ??
            defaultKeyStatistics.beta ??
            financialData.beta,
        analyst: {
            averageRating: quote.averageAnalystRating,
            targetMeanPrice: financialData.targetMeanPrice,
            targetHighPrice: financialData.targetHighPrice,
            targetLowPrice: financialData.targetLowPrice,
            numberOfAnalysts: financialData.numberOfAnalystOpinions,
        },
        valuation: {
            priceToBook: financialData.priceToBook,
            trailingPE: financialData.trailingPE,
            forwardPE: financialData.forwardPE,
        },
        source: "yahoo",
        fetchedAt: new Date(now).toISOString(),
    };

    researchCache.set(symbol, {
        data: snapshot,
        fetchedAtMs: now,
    });

    return snapshot;
};