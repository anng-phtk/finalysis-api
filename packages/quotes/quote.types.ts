export type QuoteSnapshot = {
    symbol: string;
    shortName?: string;
    longName?: string;
    exchange?: string;
    currency?: string;
    marketState?: string;
    marketTime?: string;

    price: {
        current?: number;
        change?: number;
        changePercent?: number;
        open?: number;
        previousClose?: number;
        dayLow?: number;
        dayHigh?: number;
        volume?: number;
        bid?: number;
        ask?: number;
    };

    valuation: {
        marketCap?: number;
        trailingPE?: number;
        forwardPE?: number;
        priceToBook?: number;
        bookValue?: number;
        epsTTM?: number;
        epsForward?: number;
        epsCurrentYear?: number;
        beta?: number;
    };

    range: {
        week52Low?: number;
        week52High?: number;
        fiftyDayAverage?: number;
        twoHundredDayAverage?: number;
    };

    dividend: {
        dividendRate?: number;
        dividendYield?: number;
        trailingDividendRate?: number;
        trailingDividendYield?: number;
        dividendDate?: string;
    };

    analyst: {
        averageRating?: string;
    };

    events: {
        earningsDate?: string;
        earningsCallStart?: string;
        isEarningsDateEstimate?: boolean;
    };

    source: "yahoo";
    fetchedAt: string;
};

export type PriceBar = {
    date: string;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
    adjClose?: number;
};

export type PriceHistorySnapshot = {
    symbol: string;
    range: string;
    interval: string;
    bars: PriceBar[];
    source: "yahoo";
    fetchedAt: string;
};

export type ResearchSnapshot = {
    symbol: string;
    beta?: number;
    valuation?: {
        priceToBook?: number;
        trailingPE?: number;
        forwardPE?: number;
    };
    analyst?: {
        averageRating?: string;
        targetMeanPrice?: number;
        targetHighPrice?: number;
        targetLowPrice?: number;
        numberOfAnalysts?: number;
    };
    source: "yahoo";
    fetchedAt: string;
};

export type InsightsSnapshot = {
    symbol: string;
    recommendation?: {
        rating?: "BUY" | "SELL" | "HOLD";
        targetPrice?: number;
        provider?: string;
    };
    companySnapshot?: {
        sectorInfo?: string;
        company?: {
            innovativeness?: number;
            hiring?: number;
            sustainability?: number;
            insiderSentiments?: number;
            earningsReports?: number;
            dividends?: number;
        };
        sector?: {
            innovativeness?: number;
            hiring?: number;
            sustainability?: number;
            insiderSentiments?: number;
            earningsReports?: number;
            dividends?: number;
        };
    };
    instrumentInfo?: {
        technicals?: {
            provider?: string;
            support?: number;
            resistance?: number;
            stopLoss?: number;
        };
        valuation?: {
            provider?: string;
            color?: number;
            description?: string;
            discount?: string;
            relativeValue?: string;
        };
        outlooks?: {
            shortTerm?: {
                direction?: string;
                score?: number;
                scoreDescription?: string;
            };
            intermediateTerm?: {
                direction?: string;
                score?: number;
                scoreDescription?: string;
            };
            longTerm?: {
                direction?: string;
                score?: number;
                scoreDescription?: string;
            };
        };
    };
    reports: Array<{
        id: string;
        title?: string;
        reportTitle: string;
        provider: string;
        reportDate: string;
        reportType: string;
        targetPrice?: number;
        targetPriceStatus?: "Increased" | "Maintained" | "Decreased" | "-";
        investmentRating?: "Bullish" | "Neutral" | "Bearish";
        tickers?: string[];
    }>;
    sigDevs: Array<{
        headline: string;
        date: string;
    }>;
    secReports?: Array<{
        id: string;
        type: string;
        title: string;
        description: string;
        filingDate: number;
        snapshotUrl: string;
        formType: string;
    }>;
    source: "yahoo";
    fetchedAt: string;
};

export type PriceDashboardSnapshot = {
    quote: QuoteSnapshot;
    history?: PriceHistorySnapshot;
    research?: ResearchSnapshot;
    insights?: InsightsSnapshot;
};

export type ProfileSnapshot = {
    symbol: string;
    description?: string;
    earningsDate?: string;
    source: "yahoo";
    fetchedAt: string;
};

