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
    REVENUE: {
        label: "Revenue",
        tags: [
            // 1) broad / common
            "Revenues",
            "SalesRevenueNet",
            "RevenuesNetOfInterestExpense", // banks

            // 2) ASC 606 / modern
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            "RevenueFromContractWithCustomerIncludingAssessedTax",

            // 3) industry-specific fallbacks
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

            // fallbacks (be careful: these are “above tax” but not always “operating”)
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
            "IncomeLossFromContinuingOperationsIncludingPortionAttributableToNoncontrollingInterest",
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

    INTEREST_EXPENSE: {
        label: "Interest Expense",
        tags: [
            "InterestExpense",
            "InterestExpenseNet",
            "InterestExpenseOther",
            "InterestAndOtherDebtExpense",
            "InterestCost",
            "InterestIncomeExpense",
            "InterestOnDebt",
            "InterestAccrued",
            // NOTE: "InterestPaid" is cash-flow-ish and can contaminate this metric.
            // Keep it only if you explicitly want that behavior.
            // "InterestPaid",
            // "InterestPaidNet",
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
            "DebtCurrent",           // often a superset
            "ShortTermBorrowings",   // subset
            "LongTermDebtCurrent",   // current portion of LTD
            "CurrentPortionOfLongTermDebt",
        ],
        opts: { unit: "USD", kind: "INSTANT" },
    },

    // IMPORTANT: split shares concepts
    // - SHARES_OUTSTANDING is balance-sheet snapshot -> INSTANT
    SHARES_OUTSTANDING: {
        label: "Shares Outstanding",
        tags: [
            "CommonStockSharesOutstanding",
            "CommonStockSharesIssued",
            "EntityCommonStockSharesOutstanding"
        ],
        opts: { unit: "shares", kind: "INSTANT" },
    },

    // Dividends (FLOW)
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
            "Dividends", // catch-all (use cautiously)
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
        deps: ["NET_INCOME", "TOTAL_EQUITY"],
    },
    DEBT_TO_EQUITY: {
        label: "Debt to Equity",
        unit: "pure", // Note: you might need to add "pure" to your ExtractSeriesOptions unit type!
        kind: "INSTANT" as const,
        deps: ["TOTAL_DEBT", "TOTAL_EQUITY"],
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
        deps: ["REVENUE"]
    },
    NET_INC_CAGR_3Y: {
        label: "3 Yr Net Income CAGR",
        unit: "%",
        kind: "FLOW" as const,
        deps: ["NET_INCOME"]
    },
    REVENUE_CAGR_5Y: {
        label: "3 Yr Revenue CAGR",
        unit: "%",
        kind: "FLOW" as const,
        deps: ["REVENUE"]
    },
    NET_INC_CAGR_5Y: {
        label: "5 Yr Net Income CAGR",
        unit: "%",
        kind: "FLOW" as const,
        deps: ["NET_INCOME"]
    },
    /*
    // --- CAGRs ---
                // Formula: (Current / Oldest)^(1/Years) - 1
                // 3Y CAGR looks back 3 periods (index + 3)
                case "REVENUE_CAGR_3Y":
                case "NET_INC_CAGR_3Y":
                    const old3Y = grid[config.deps[0]!]?.[index + 3] as number | null;
                    if (val0 != null && old3Y != null && old3Y > 0 && val0 > 0) {
                        return Math.pow(val0 / old3Y, 1 / 3) - 1;
                    }
                    return null;

                case "REVENUE_CAGR_5Y":
                case "NET_INC_CAGR_5Y":
                    const old5Y = grid[config.deps[0]!]?.[index + 5] as number | null;
                    if (val0 != null && old5Y != null && old5Y > 0 && val0 > 0) {
                        return Math.pow(val0 / old5Y, 1 / 5) - 1;
                    }
                    return null;
    */
} as const;

// convenience over purity
// purity might create circular imports
export type ReportedMetricKey = keyof typeof REPORTED_METRICS;
export type CalculatedMetricKey = keyof typeof CALCULATED_METRICS;

// Combined key (handy for UI dictionaries)
export type MetricKey = ReportedMetricKey | CalculatedMetricKey;
export type MetricKind = "INSTANT" | "FLOW";

export type ColumnarGrid = {
    reportedPeriods: string[];
    [metricKey: string]: (number | null | string)[];
};
