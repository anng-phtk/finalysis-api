import YahooFinance from "yahoo-finance2";
import type { InsightsResult } from "yahoo-finance2/modules/insights";
import type {
    QuoteSnapshot,
    PriceHistorySnapshot,
    ResearchSnapshot,
    InsightsSnapshot,
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

type CachedInsights = {
    data: InsightsSnapshot;
    fetchedAtMs: number;
};

const quoteCache: Map<string, CachedQuote> = new Map();
const historyCache: Map<string, CachedHistory> = new Map();
const researchCache: Map<string, CachedResearch> = new Map();
const insightsCache: Map<string, CachedInsights> = new Map();

const QUOTE_TTL_MS = 1000 * 60 * 30;          // 30 min
const HISTORY_TTL_MS = 1000 * 60 * 60 * 12;   // 12 hours
const RESEARCH_TTL_MS = 1000 * 60 * 60 * 24;  // 24 hours
const INSIGHTS_TTL_MS = 1000 * 60 * 60 * 24;  // 24 hours

const yf = new YahooFinance({
    suppressNotices: ["yahooSurvey"],
});

const withDate = (value: Date): string => value.toISOString();

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

export const fetchStockInsightsYahoo = async (
    ticker: string,
    reportsCount: number = 5,
    refresh: boolean = false
): Promise<InsightsSnapshot> => {
    const symbol = ticker.toUpperCase().trim();
    const now = Date.now();
    const normalizedReportsCount = Math.max(0, Math.floor(reportsCount));

    if (!symbol) throw new Error("Ticker is required");

    const cacheKey = `${symbol}:${normalizedReportsCount}`;
    const cached = insightsCache.get(cacheKey);
    if (!refresh && cached && now - cached.fetchedAtMs < INSIGHTS_TTL_MS) {
        return cached.data;
    }

    const insights: InsightsResult = await yf.insights(symbol, {
        reportsCount: normalizedReportsCount,
    });

    const snapshot: InsightsSnapshot = {
        symbol: insights.symbol,
        ...(insights.recommendation
            ? {
                recommendation: {
                    ...("rating" in insights.recommendation ? { rating: insights.recommendation.rating } : {}),
                    ...("targetPrice" in insights.recommendation && insights.recommendation.targetPrice !== undefined
                        ? { targetPrice: insights.recommendation.targetPrice }
                        : {}),
                    ...("provider" in insights.recommendation ? { provider: insights.recommendation.provider } : {}),
                },
            }
            : {}),
        ...(insights.companySnapshot
            ? {
                companySnapshot: {
                    ...(insights.companySnapshot.sectorInfo !== undefined
                        ? { sectorInfo: insights.companySnapshot.sectorInfo }
                        : {}),
                    ...(insights.companySnapshot.company
                        ? {
                            company: {
                                ...(insights.companySnapshot.company.innovativeness !== undefined
                                    ? { innovativeness: insights.companySnapshot.company.innovativeness }
                                    : {}),
                                ...(insights.companySnapshot.company.hiring !== undefined
                                    ? { hiring: insights.companySnapshot.company.hiring }
                                    : {}),
                                ...(insights.companySnapshot.company.sustainability !== undefined
                                    ? { sustainability: insights.companySnapshot.company.sustainability }
                                    : {}),
                                ...(insights.companySnapshot.company.insiderSentiments !== undefined
                                    ? { insiderSentiments: insights.companySnapshot.company.insiderSentiments }
                                    : {}),
                                ...(insights.companySnapshot.company.earningsReports !== undefined
                                    ? { earningsReports: insights.companySnapshot.company.earningsReports }
                                    : {}),
                                ...(insights.companySnapshot.company.dividends !== undefined
                                    ? { dividends: insights.companySnapshot.company.dividends }
                                    : {}),
                            },
                        }
                        : {}),
                    ...(insights.companySnapshot.sector
                        ? {
                            sector: {
                                ...(insights.companySnapshot.sector.innovativeness !== undefined
                                    ? { innovativeness: insights.companySnapshot.sector.innovativeness }
                                    : {}),
                                ...(insights.companySnapshot.sector.hiring !== undefined
                                    ? { hiring: insights.companySnapshot.sector.hiring }
                                    : {}),
                                ...(insights.companySnapshot.sector.sustainability !== undefined
                                    ? { sustainability: insights.companySnapshot.sector.sustainability }
                                    : {}),
                                ...(insights.companySnapshot.sector.insiderSentiments !== undefined
                                    ? { insiderSentiments: insights.companySnapshot.sector.insiderSentiments }
                                    : {}),
                                ...(insights.companySnapshot.sector.earningsReports !== undefined
                                    ? { earningsReports: insights.companySnapshot.sector.earningsReports }
                                    : {}),
                                ...(insights.companySnapshot.sector.dividends !== undefined
                                    ? { dividends: insights.companySnapshot.sector.dividends }
                                    : {}),
                            },
                        }
                        : {}),
                },
            }
            : {}),
        ...(insights.instrumentInfo
            ? {
                instrumentInfo: {
                    technicals: {
                        ...("provider" in insights.instrumentInfo.keyTechnicals
                            ? { provider: insights.instrumentInfo.keyTechnicals.provider }
                            : {}),
                        ...(insights.instrumentInfo.keyTechnicals.support !== undefined
                            ? { support: insights.instrumentInfo.keyTechnicals.support }
                            : {}),
                        ...(insights.instrumentInfo.keyTechnicals.resistance !== undefined
                            ? { resistance: insights.instrumentInfo.keyTechnicals.resistance }
                            : {}),
                        ...(insights.instrumentInfo.keyTechnicals.stopLoss !== undefined
                            ? { stopLoss: insights.instrumentInfo.keyTechnicals.stopLoss }
                            : {}),
                    },
                    valuation: {
                        ...("provider" in insights.instrumentInfo.valuation
                            ? { provider: insights.instrumentInfo.valuation.provider }
                            : {}),
                        ...(insights.instrumentInfo.valuation.color !== undefined
                            ? { color: insights.instrumentInfo.valuation.color }
                            : {}),
                        ...(insights.instrumentInfo.valuation.description !== undefined
                            ? { description: insights.instrumentInfo.valuation.description }
                            : {}),
                        ...(insights.instrumentInfo.valuation.discount !== undefined
                            ? { discount: insights.instrumentInfo.valuation.discount }
                            : {}),
                        ...(insights.instrumentInfo.valuation.relativeValue !== undefined
                            ? { relativeValue: insights.instrumentInfo.valuation.relativeValue }
                            : {}),
                    },
                    outlooks: {
                        shortTerm: {
                            ...(insights.instrumentInfo.technicalEvents.shortTermOutlook.direction !== undefined
                                ? { direction: insights.instrumentInfo.technicalEvents.shortTermOutlook.direction }
                                : {}),
                            ...(insights.instrumentInfo.technicalEvents.shortTermOutlook.score !== undefined
                                ? { score: insights.instrumentInfo.technicalEvents.shortTermOutlook.score }
                                : {}),
                            ...(insights.instrumentInfo.technicalEvents.shortTermOutlook.scoreDescription !== undefined
                                ? { scoreDescription: insights.instrumentInfo.technicalEvents.shortTermOutlook.scoreDescription }
                                : {}),
                        },
                        intermediateTerm: {
                            ...(insights.instrumentInfo.technicalEvents.intermediateTermOutlook.direction !== undefined
                                ? { direction: insights.instrumentInfo.technicalEvents.intermediateTermOutlook.direction }
                                : {}),
                            ...(insights.instrumentInfo.technicalEvents.intermediateTermOutlook.score !== undefined
                                ? { score: insights.instrumentInfo.technicalEvents.intermediateTermOutlook.score }
                                : {}),
                            ...(insights.instrumentInfo.technicalEvents.intermediateTermOutlook.scoreDescription !== undefined
                                ? { scoreDescription: insights.instrumentInfo.technicalEvents.intermediateTermOutlook.scoreDescription }
                                : {}),
                        },
                        longTerm: {
                            ...(insights.instrumentInfo.technicalEvents.longTermOutlook.direction !== undefined
                                ? { direction: insights.instrumentInfo.technicalEvents.longTermOutlook.direction }
                                : {}),
                            ...(insights.instrumentInfo.technicalEvents.longTermOutlook.score !== undefined
                                ? { score: insights.instrumentInfo.technicalEvents.longTermOutlook.score }
                                : {}),
                            ...(insights.instrumentInfo.technicalEvents.longTermOutlook.scoreDescription !== undefined
                                ? { scoreDescription: insights.instrumentInfo.technicalEvents.longTermOutlook.scoreDescription }
                                : {}),
                        },
                    },
                },
            }
            : {}),
        reports: (insights.reports ?? []).map(report => ({
            id: report.id,
            ...(report.title !== undefined ? { title: report.title } : {}),
            reportTitle: report.reportTitle,
            provider: report.provider,
            reportDate: withDate(report.reportDate),
            reportType: report.reportType,
            ...(report.targetPrice !== undefined ? { targetPrice: report.targetPrice } : {}),
            ...(report.targetPriceStatus !== undefined ? { targetPriceStatus: report.targetPriceStatus } : {}),
            ...(report.investmentRating !== undefined ? { investmentRating: report.investmentRating } : {}),
            ...(report.tickers !== undefined ? { tickers: report.tickers } : {}),
        })),
        sigDevs: insights.sigDevs.map(item => ({
            headline: item.headline,
            date: withDate(item.date),
        })),
        ...(insights.secReports
            ? {
                secReports: insights.secReports.map(report => ({
                    id: report.id,
                    type: report.type,
                    title: report.title,
                    description: report.description,
                    filingDate: Number(report.filingDate),
                    snapshotUrl: report.snapshotUrl,
                    formType: report.formType,
                })),
            }
            : {}),
        source: "yahoo",
        fetchedAt: new Date(now).toISOString(),
    };

    insightsCache.set(cacheKey, {
        data: snapshot,
        fetchedAtMs: now,
    });

    return snapshot;
};
