import { Router, type Request, type Response } from "express";
import { fmpInsightsProvider } from "../../../packages/runtime-svc/fmp-insights-provider.js";

export const insightsRouter = Router();

//  GET /:ticker?refresh=true|false
insightsRouter.get("/:ticker", async (req: Request, res: Response) => {
    try {
        const ticker = String(req.params.ticker ?? "").toUpperCase().trim();
        const refresh = req.query.refresh === "true";

        console.log(`[Insights API] Request for ${ticker} | refresh=${refresh}`);

        const data = await fmpInsightsProvider({
            ticker,
            refresh,
        });

        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load insights" });
    }
});
