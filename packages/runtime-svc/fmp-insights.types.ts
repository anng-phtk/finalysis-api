export type FmpCalendarItem = {
    symbol?: string;
    date?: string;
    eps?: number;
    epsEstimated?: number;
    revenueEstimated?: number;
    revenue?: number;
    dividend?: number;
    dividendYield?: number;
    recordDate?: string;
    paymentDate?: string;
    declarationDate?: string;
    companyName?: string;
};

export type FmpInsiderTrade = {
    symbol?: string;
    filingDate?: string;
    transactionDate?: string;
    reportingName?: string;
    transactionType?: string;
    transactionTypeName?: string;
    price?: number;
    shares?: number;
    value?: number;
    link?: string;
    companyName?: string;
    title?: string;
};

export type FmpInsightsSnapshot = {
    symbol: string;
    calendars: {
        earnings: FmpCalendarItem[];
        dividends: FmpCalendarItem[];
    };
    insiderTrades: FmpInsiderTrade[];
    insiderTradesToday: FmpInsiderTrade[];
    source: "fmp";
    fetchedAt: string;
};
