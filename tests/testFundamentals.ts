import { fundamentalsProvider } from "../packages/runtime-svc/fundamentals-provider.js";

fundamentalsProvider({ ticker: "AAPL", refresh: true }).then(console.log).catch(console.error);