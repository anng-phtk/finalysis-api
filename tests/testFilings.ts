import { filingsProvider } from "../packages/runtime-svc/filings-provider.js";

filingsProvider({
    ticker: "AAPL",
    refresh: true
}).then((data) => {
    console.log(data);
}).catch((error) => {
    console.error(error);
});