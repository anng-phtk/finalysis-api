import { Router, type Request, type Response } from "express";
import { filingsProvider, parseFilingProvider } from "../../../packages/runtime-svc/filings-provider.js";

export const filingsRouter = Router();

filingsRouter.get("/parse", async (req: Request, res: Response) => {
    const url = String(req.query.url ?? "");

    if (!url) {
        res.status(400).json({ error: "URL is required" });
        return;
    }

    try {
        const extractedData = await parseFilingProvider(url);
        res.json(extractedData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to parse filing" });
    }
});

//  GET /:ticker?refresh=true|false
filingsRouter.get("/:ticker", async (req: Request, res: Response) => {
    try {
        const ticker = String(req.params.ticker ?? "").toUpperCase().trim();
        const refresh = req.query.refresh === "true";

        const data = await filingsProvider({ ticker, refresh });
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load filings" });
    }
});