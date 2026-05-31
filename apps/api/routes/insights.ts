import { Router, type Request, type Response } from "express";
import { fmpInsightsProvider } from "../../../packages/runtime-svc/fmp-insights-provider.js";
import { profileProvider } from "../../../packages/runtime-svc/profile-provider.js";

export const insightsRouter = Router();

// GET /profile/:ticker
insightsRouter.get("/profile/:ticker", async (req: Request, res: Response) => {
    try {
        const ticker = String(req.params.ticker ?? "").toUpperCase().trim();
        const refresh = req.query.refresh === "true";

        console.log(`[Profile API] Request for ${ticker} | refresh=${refresh}`);

        const data = await profileProvider({
            ticker,
            refresh,
        });

        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load company profile" });
    }
});

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
