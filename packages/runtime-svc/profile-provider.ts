import { fetchStockProfileYahoo } from "../quotes/quote-svc.js";
import type { ProfileSnapshot } from "../quotes/quote.types.js";

export interface ProfileProviderOptions {
    ticker: string;
    refresh?: boolean;
}

export const profileProvider = async (
    opts: ProfileProviderOptions
): Promise<ProfileSnapshot> => {
    return fetchStockProfileYahoo(
        opts.ticker,
        opts.refresh ?? false
    );
};
