export interface FetchOptions {
    /** when true, ignore the cached JSON and always re-download */
    force?: boolean;
}

// packages/runtime-svc/fact-mapping.ts
// Clean separation:
// - REPORTED_METRICS: only XBRL-tag extractable metrics (tags[] required)
// - CALCULATED_METRICS: computed from reported metrics (NO tags)
// Also: explicit kind everywhere (INSTANT vs FLOW)

/**
 * ----------------------------
 * REPORTED (XBRL extractable)
 * ----------------------------
 */

export const REPORTED_METRICS = {
    // -------- Income Statement (FLOW) --------
    RECEIVABLES: {
        label: "Accounts Receivable",
        tags: ["AccountsReceivableNetCurrent", "AccountsReceivableGross", "TradeAccountsReceivable"],
        opts: { unit: "USD", kind: "INSTANT" }
    },
    INVENTORY: {
        label: "Inventory",
        tags: ["InventoryNet", "InventoryGross", "MerchandiseInventory"],
        opts: { unit: "USD", kind: "INSTANT" }
    },
    PAYABLES: {
        label: "Accounts Payable",
        tags: ["AccountsPayableCurrent", "TradeAccountsPayable"],
        opts: { unit: "USD", kind: "INSTANT" }
    },
    REVENUE: {
        label: "Revenue",
        tags: [
            "Revenues",
            "SalesRevenueNet",
            "RevenuesNetOfInterestExpense", // banks
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            "RevenueFromContractWithCustomerIncludingAssessedTax",
            "SalesRevenueServicesNet",
            "SalesRevenueGoodsNet",
            "OilAndGasRevenue",
            "FinancialServicesRevenue",
            "RealEstateRevenueNet",
            "PremiumsEarnedNet",
        ],
        opts: { unit: "USD", kind: "FLOW" },
    },

    OP_INCOME: {
        label: "Operating Income",
        tags: [
            "OperatingIncomeLoss",
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
            "IncomeLossFromContinuingOperationsIncludingPortionAttributableToNoncontrollingInterest",
        ],
        opts: { unit: "USD", kind: "FLOW" },
    },

    // ✅ NEW: Pretax Income (needed for effective tax rate and FCFF)
    PRETAX_INCOME: {
        label: "Pretax Income",
        tags: [
            "IncomeLossBeforeTax",
            "IncomeBeforeTax",
            "IncomeBeforeIncomeTax",
            "IncomeFromContinuingOperationsBeforeTax",
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxes",
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
        ],
        opts: { unit: "USD", kind: "FLOW" },
    },

    NET_INCOME: {
        label: "Net Income",
        tags: [
            "NetIncomeLoss",
            "ProfitLoss",
            "NetIncomeLossAvailableToCommonStockholdersBasic",
        ],
        opts: { unit: "USD", kind: "FLOW" },
    },

    EPS_DILUTED: {
        label: "EPS Diluted",
        tags: [
            "EarningsPerShareDiluted",
            "IncomeLossFromContinuingOperationsPerDilutedShare",
        ],
        opts: { unit: "USD/shares", kind: "FLOW" },
    },

    // ✅ NEW: Weighted average shares (for your own EPS calculations / sanity checks)
    WEIGHTED_AVG_SHARES_DILUTED: {
        label: "Weighted Avg Shares (Diluted)",
        tags: [
            "WeightedAverageNumberOfDilutedSharesOutstanding",
            "WeightedAverageNumberOfSharesOutstandingBasic",
            "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
        ],
        opts: { unit: "shares", kind: "FLOW" },
    },

    // -------- Cash Flow (FLOW) --------
    OP_CASH_FLOW: {
        label: "Operating Cash Flow",
        tags: [
            "NetCashProvidedByUsedInOperatingActivities",
            "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
        ],
        opts: { unit: "USD", kind: "FLOW" },
    },

    CAPEX: {
        label: "Capex",
        tags: [
            "PaymentsToAcquirePropertyPlantAndEquipment",
            "PaymentsToAcquireProductiveAssets",
            "PaymentsToAcquireIntangibleAssets",
            "PaymentsForCapitalizedSoftware",
            "PaymentsToDevelopSoftware",
            "CapitalExpendituresIncurredButNotYetPaid",
        ],
        opts: { unit: "USD", kind: "FLOW" },
    },

    SBC: {
        label: "Stock-Based Compensation",
        tags: [
            "ShareBasedCompensation",
            "StockBasedCompensationExpense",
            "AllocatedShareBasedCompensationExpense",
            "StockGrantedDuringPeriodValueSharebasedCompensation",
            "EmployeeServiceShareBasedCompensationNonvestedShareAwardsTotalCompensationCostNotYetRecognized",
        ],
        opts: { unit: "USD", kind: "FLOW" },
    },

    TAX: {
        label: "Income Tax Expense",
        tags: [
            "IncomeTaxExpenseBenefit",
            "IncomeTaxExpenseBenefitContinuingOperations",
        ],
        opts: { unit: "USD", kind: "FLOW" },
    },

    DA: {
        label: "Depreciation & Amortization",
        tags: [
            "DepreciationDepletionAndAmortization",
            "DepreciationAmortizationAndAccretionNet",
            "DepreciationAndAmortization",
            "Depreciation",
        ],
        opts: { unit: "USD", kind: "FLOW" },
    },

    // ✅ Expanded synonyms for Interest Expense (to cover more S&P500 filings)
    INTEREST_EXPENSE: {
        label: "Interest Expense",
        tags: [
            "InterestExpense",
            "InterestExpenseNet",
            "InterestExpenseOther",
            "InterestAndOtherDebtExpense",
            "InterestCost",
            "InterestIncomeExpense",      // may be net; use cautiously
            "InterestOnDebt",
            "InterestAccrued",
            "InterestExpenseOperating",
            "InterestExpenseLongTermDebt",
            "InterestExpenseShortTermDebt",
            "InterestCostsIncurred",
            "InterestOnBorrowings",
            // Exclude "InterestPaid" (that's cash flow, not accrual)
        ],
        opts: { unit: "USD", kind: "FLOW" },
    },

    // -------- Balance Sheet (INSTANT) --------
    TOTAL_EQUITY: {
        label: "Total Equity",
        tags: [
            "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
            "StockholdersEquity",
            "StockholdersEquityAttributableToParent",
        ],
        opts: { unit: "USD", kind: "INSTANT" },
    },

    // ✅ NEW: Parent-only equity (cleaner for ROE and DCF)
    EQUITY_ATTRIBUTABLE_TO_PARENT: {
        label: "Equity Attributable to Parent",
        tags: [
            "StockholdersEquityAttributableToParent",
            "StockholdersEquityExcludingNoncontrollingInterest",
            "CommonStockholdersEquity",
        ],
        opts: { unit: "USD", kind: "INSTANT" },
    },

    CASH_AND_EQUIV: {
        label: "Cash & Equivalents",
        tags: [
            "CashAndCashEquivalentsAtCarryingValue",
            "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
            "CashAndCashEquivalents",
            "MarketableSecuritiesCurrent",
            "CashCashEquivalentsAndShortTermInvestments",
        ],
        opts: { unit: "USD", kind: "INSTANT" },
    },

    LONG_TERM_DEBT: {
        label: "Long-term Debt",
        tags: [
            "LongTermDebtNoncurrent",
            "LongTermDebt",
            "LongTermDebtAndCapitalLeaseObligations",
        ],
        opts: { unit: "USD", kind: "INSTANT" },
    },

    SHORT_TERM_DEBT: {
        label: "Short-term Debt",
        tags: [
            "DebtCurrent",
            "ShortTermBorrowings",
            "LongTermDebtCurrent",
            "CurrentPortionOfLongTermDebt",
        ],
        opts: { unit: "USD", kind: "INSTANT" },
    },

    SHARES_OUTSTANDING: {
        label: "Shares Outstanding",
        tags: [
            "CommonStockSharesOutstanding",
            "CommonStockSharesIssued",
            "EntityCommonStockSharesOutstanding"
        ],
        opts: { unit: "shares", kind: "INSTANT" },
    },

    DIV_PER_SHARE: {
        label: "Dividends Per Share",
        tags: [
            "CommonStockDividendsPerShareCashPaid",
            "CommonStockDividendsPerShareDeclared",
            "DividendsPerShareBasic",
            "DividendsPerShare",
        ],
        opts: { unit: "USD/shares", kind: "FLOW" },
    },

    DIV_PAID: {
        label: "Dividends Paid",
        tags: [
            "PaymentsOfDividendsCommonStock",
            "PaymentsOfDividends",
            "PaymentsOfOrdinaryDividends",
            "DividendsCommonStockCash",
            "Dividends",
        ],
        opts: { unit: "USD", kind: "FLOW" },
    },
} as const;

/**
 * ----------------------------
 * CALCULATED (backend computed)
 * ----------------------------
 * NO tags here.
 */
export const CALCULATED_METRICS = {
    // -------- Previously existing (corrected where needed) --------
    FREE_CASH_FLOW: {
        label: "Free Cash Flow",
        unit: "USD",
        kind: "FLOW" as const,
        deps: ["OP_CASH_FLOW", "CAPEX"],
    },
    OPERATING_MARGIN: {
        label: "Operating Margin",
        unit: "%",
        kind: "FLOW" as const,
        deps: ["OP_INCOME", "REVENUE"],
    },
    NET_MARGIN: {
        label: "Net Margin",
        unit: "%",
        kind: "FLOW" as const,
        deps: ["NET_INCOME", "REVENUE"],
    },
    TOTAL_DEBT: {
        label: "Total Debt",
        unit: "USD",
        kind: "INSTANT" as const,
        deps: ["SHORT_TERM_DEBT", "LONG_TERM_DEBT"],
    },
    ROE: {
        label: "Return on Equity",
        unit: "%",
        kind: "FLOW" as const,
        deps: ["NET_INCOME", "TOTAL_EQUITY"],      // uses parent equity if available in calculation
    },
    DEBT_TO_EQUITY: {
        label: "Debt to Equity",
        unit: "pure",
        kind: "INSTANT" as const,
        deps: ["TOTAL_DEBT", "TOTAL_EQUITY"],      // parent equity preferred
    },
    FCF_TO_CAPEX: {
        label: "FCF to Capex",
        unit: "pure",
        kind: "FLOW" as const,
        deps: ["FREE_CASH_FLOW", "CAPEX"],
    },
    ROIC: {
        label: "ROIC",
        unit: "%",
        kind: "FLOW" as const,
        deps: ["OP_INCOME", "TAX", "TOTAL_EQUITY", "TOTAL_DEBT"],
    },
    YOY_REVENUE_GROWTH: {
        label: "YoY Revenue Growth",
        unit: "%",
        kind: "FLOW" as const,
        deps: ["REVENUE"],
    },
    YOY_NET_INCOME_GROWTH: {
        label: "YoY Net Income Growth",
        unit: "%",
        kind: "FLOW" as const,
        deps: ["NET_INCOME"],
    },
    YOY_FCF_GROWTH: {
        label: "YoY FCF Growth",
        unit: "%",
        kind: "FLOW" as const,
        deps: ["FREE_CASH_FLOW"],
    },
    REVENUE_CAGR_3Y: {
        label: "3 Yr Revenue CAGR",
        unit: "%",
        kind: "FLOW" as const,
        deps: ["REVENUE"],
    },
    NET_INC_CAGR_3Y: {
        label: "3 Yr Net Income CAGR",
        unit: "%",
        kind: "FLOW" as const,
        deps: ["NET_INCOME"],
    },
    REVENUE_CAGR_5Y: {
        label: "5 Yr Revenue CAGR",      // Fixed label (was "3 Yr")
        unit: "%",
        kind: "FLOW" as const,
        deps: ["REVENUE"],
    },
    NET_INC_CAGR_5Y: {
        label: "5 Yr Net Income CAGR",
        unit: "%",
        kind: "FLOW" as const,
        deps: ["NET_INCOME"],
    },

    // -------- NEW metrics for intrinsic value & better analysis --------
    EFFECTIVE_TAX_RATE: {
        label: "Effective Tax Rate",
        unit: "%",
        kind: "FLOW" as const,
        deps: ["TAX"],                     // Also needs PRETAX_INCOME (handled in calc logic)
    },
    NOPAT: {
        label: "NOPAT (Net Operating Profit After Tax)",
        unit: "USD",
        kind: "FLOW" as const,
        deps: ["OP_INCOME"],
    },
    FCFF: {
        label: "Free Cash Flow to Firm",
        unit: "USD",
        kind: "FLOW" as const,
        deps: ["OP_CASH_FLOW", "CAPEX"],    // Interest & tax rate used internally
    },
    INVESTED_CAPITAL: {
        label: "Invested Capital",
        unit: "USD",
        kind: "INSTANT" as const,
        deps: ["TOTAL_EQUITY", "TOTAL_DEBT"],
    },
    FCFE: {
        label: "Free Cash Flow to Equity",
        unit: "USD",
        kind: "FLOW" as const,
        deps: ["FREE_CASH_FLOW"],          // already defined, but added for clarity
    },
    
} as const;

// Type helper
export type CalculatedMetricKey = keyof typeof CALCULATED_METRICS;

// convenience over purity
// purity might create circular imports
export type ReportedMetricKey = keyof typeof REPORTED_METRICS;

// Combined key (handy for UI dictionaries)
export type MetricKey = ReportedMetricKey | CalculatedMetricKey;
export type MetricKind = "INSTANT" | "FLOW";

export type ColumnarGrid = {
    reportedPeriods: string[];
    [metricKey: string]: (number | null | string)[];
};
