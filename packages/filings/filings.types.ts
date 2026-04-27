export interface FilingHistoryRow {
    accessionNumber: string;
    form: string;
    reportDate: string;
    filingUrl: string;
    primaryDocument: string;
}

export interface FilingHistoryResponse {
    ticker: string;
    rows: FilingHistoryRow[];
}
export interface FilingUrlProviderOptions {
    ticker: string;
    refresh?: boolean;
}

export interface FilingHistoryRow {
    accessionNumber: string;
    form: string;
    reportDate: string;
    filingUrl: string;
    primaryDocument: string;
}

export interface FilingHistoryResponse {
    ticker: string;
    rows: FilingHistoryRow[];
}