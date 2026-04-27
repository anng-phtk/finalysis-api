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

export type PriceDashboardSnapshot = {
    quote: QuoteSnapshot;
    history?: PriceHistorySnapshot;
    research?: ResearchSnapshot;
};