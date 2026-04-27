import { Router, type Request, type Response } from "express";
import {
    fetchStockQuoteYahoo,
    fetchStockHistoryYahoo,
    fetchStockResearchYahoo,
} from "../../../packages/quotes/quote-svc.js";

export const quoteRouter = Router();

quoteRouter.get("/:ticker", async (req: Request, res: Response) => {
    try {
        const ticker = String(req.params.ticker ?? "").toUpperCase().trim();
        const refresh = req.query.refresh === "true";

        const data = await fetchStockQuoteYahoo(ticker, refresh);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load quote" });
    }
});

quoteRouter.get("/:ticker/history", async (req: Request, res: Response) => {
    try {
        const ticker = String(req.params.ticker ?? "").toUpperCase().trim();
        const range = String(req.query.range ?? "5y");
        const interval = String(req.query.interval ?? "1d");
        const refresh = req.query.refresh === "true";

        const data = await fetchStockHistoryYahoo(ticker, range, interval, refresh);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load price history" });
    }
});

quoteRouter.get("/:ticker/research", async (req: Request, res: Response) => {
    try {
        const ticker = String(req.params.ticker ?? "").toUpperCase().trim();
        const refresh = req.query.refresh === "true";

        const data = await fetchStockResearchYahoo(ticker, refresh);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load research snapshot" });
    }
});