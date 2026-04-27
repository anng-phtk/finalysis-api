import { Router, type Request, type Response } from "express";
import { fundamentalsProvider } from "../../../packages/runtime-svc/fundamentals-provider.js";
import type { SelectionMode } from "../../../packages/facts-svc/fact-extractor.js";

export const fundamentalsRouter = Router();
//  GET /:ticker?mode=VALUATION|ANNUAL|QUARTERLY&refresh=true
fundamentalsRouter.get("/:ticker", async (req: Request, res: Response) => {
    const ticker = String(req.params.ticker).toUpperCase() || '';
    const rawMode = String(req.query.mode ?? 'VALUATION').toUpperCase();
    const allowedModes: SelectionMode[] = ['ANNUAL', 'VALUATION', 'QUARTERLY'];
    const mode: SelectionMode = allowedModes.includes(rawMode as SelectionMode)
        ? (rawMode as SelectionMode)
        : 'VALUATION';
    const refresh = req.query.refresh === 'true';

    console.log(`[Fundamentals API] Request for ${ticker} | mode=${mode} | refresh=${refresh}`);
    const data = await fundamentalsProvider({ ticker, mode, refresh });
    res.json(data);
});