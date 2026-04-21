import path from 'node:path';

/**
export const BASE_URL = 'https://data.sec.gov';
export const TICKER_URL = 'https://www.sec.gov/files/company_tickers.json';
export const BASE_DIR = path.resolve(process.cwd(), 'data');
export const CACHE_DIR = path.join(BASE_DIR, 'cache');
export const FILING_DIR = path.join(BASE_DIR, 'filings');
export const CACHE_FILE = path.join(BASE_DIR, 'company_tickers.json');

// User Agent is mandatory for SEC API
export const USER_AGENT = "FinalysisApp contact@example.com";
export const FILINGS_DIR = path.join(process.cwd(), 'data', 'filings');

 */



export default class Constants {

    static readonly headers = {
        'User-Agent': process.env.USER_AGENT || 'FinalysisApp contact@example.com',
        'Accept-Encoding': 'gzip, deflate',
    };

    static readonly BASE_URL: string = 'https://data.sec.gov';

    static readonly TICKER_URL: string = 'https://www.sec.gov/files/company_tickers.json';
    static readonly SEC_ARCHIVE_URL: string = 'https://www.sec.gov/Archives/edgar/data';

    static readonly BASE_DIR: string = path.join(path.resolve(process.cwd()), 'data');
    static readonly CACHE_DIR: string = path.join(Constants.BASE_DIR, 'cache');
    static readonly FILING_DIR: string = path.join(Constants.BASE_DIR, 'filings');
    static readonly OPTIONS_DIR: string = path.join(Constants.BASE_DIR, 'options');
    static readonly CACHE_FILE: string = path.join(Constants.CACHE_DIR, 'company_tickers.json');
}