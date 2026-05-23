import { fetchStockInsightsYahoo } from "../quotes/quote-svc.js";
import type { InsightsSnapshot } from "../quotes/quote.types.js";

export interface InsightsProviderOptions {
    ticker: string;
    refresh?: boolean;
    reportsCount?: number;
}

export const insightsProvider = async (
    opts: InsightsProviderOptions
): Promise<InsightsSnapshot> => {
    return fetchStockInsightsYahoo(
        opts.ticker,
        opts.reportsCount ?? 5,
        opts.refresh ?? false
    );
};
