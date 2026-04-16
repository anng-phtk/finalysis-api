/**
 * CIK for AAPL: 0000320193
CIK for NVDA: 0001045810
CIK for TSLA: 0001318605
CIK for AMZN: 0001018724
 */

import { ensureCompanyFacts, ensureCompanyFactsIndex } from "../packages/sec-client/fact-svc.js";

ensureCompanyFacts('0000320193').then((path) => {
    console.log(`Facts saved to: ${path}`);
}).catch((err) => {
    console.error(`Error fetching facts: ${err}`);
});

ensureCompanyFactsIndex('0000320193').then((path) => {
    console.log(`Index saved to: ${path}`);
}).catch((err) => {
    console.error(`Error fetching index: ${err}`);
});