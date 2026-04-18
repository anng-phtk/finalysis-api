import { findTickerMappingFile, getCIK } from "../packages/sec-client/ticker-svc.js";

findTickerMappingFile();
console.log("Ticker mapping file found and loaded successfully.");

const AAPLCIK  = await getCIK('AAPL');
console.log(`CIK for AAPL: ${AAPLCIK}`);
const NVDACIK = await getCIK('NVDA');
console.log(`CIK for NVDA: ${NVDACIK}`);
const TSLACIK = await getCIK('TSLA');
console.log(`CIK for TSLA: ${TSLACIK}`);
const AMZNCIK = await getCIK('AMZN');
console.log(`CIK for AMZN: ${AMZNCIK}`);