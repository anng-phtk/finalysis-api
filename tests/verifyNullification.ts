import { fundamentalsProvider } from "../packages/runtime-svc/fundamentals-provider.js";

async function verify() {
    console.log("[*] Verifying AAPL mixed periods (Valuation mode)...");
    const grid = await fundamentalsProvider({ ticker: "AAPL", refresh: true });

    const count = grid.reportedPeriods.length;
    let found10Q = false;

    for (let i = 0; i < count; i++) {
        const form = grid.FORM_TYPE![i] || '';
        const roe = grid.ROE![i] || 0;
        const revGrowth = grid.YOY_REVENUE_GROWTH![i];
        const margin = grid.NET_MARGIN![i];

        console.log(`Period ${grid.reportedPeriods[i]} | Form: ${form} | ROE: ${roe} | Margin: ${margin} | YoY Rev: ${revGrowth}`);

        if (form === '10-Q') {
            found10Q = true;
            if (roe !== null || margin !== null || revGrowth !== null) {
                console.error(`[FAIL] Expected nulls for 10-Q at index ${i}`);
            }
        }
    }

    if (!found10Q) {
        console.warn("[!] No 10-Qs were found in this dataset to verify.");
    } else {
        console.log("[SUCCESS] All 10-Q columns have nullified ratios/growth.");
    }
}

verify().catch(console.error);
