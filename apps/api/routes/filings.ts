import { Router, type Request, type Response } from "express";
import { filingsProvider, parseFilingProvider } from "../../../packages/runtime-svc/filings-provider.js";
import { Sec10KExploder } from "../../../scripts/explode-10k.js";
import fs from "fs";
import path from "path";

export const filingsRouter = Router();

filingsRouter.get("/explode", async (req: Request, res: Response) => {
    const url = String(req.query.url ?? "");
    if (!url) {
        res.status(400).json({ error: "URL query parameter is required" });
        return;
    }

    try {
        const exploder = new Sec10KExploder(url);
        await exploder.explode();
        res.json({ success: true, message: "Filing exploded successfully" });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: `Failed to explode filing: ${error.message}` });
    }
});

filingsRouter.get("/data-explorer", async (req: Request, res: Response) => {
    try {
        const dataDir = path.join(process.cwd(), "data");
        if (!fs.existsSync(dataDir)) {
            res.json({ tickers: [] });
            return;
        }

        const ticker = req.query.ticker ? String(req.query.ticker).trim().toUpperCase() : null;
        const folder = req.query.folder ? String(req.query.folder).trim() : null;

        if (ticker && folder) {
            const folderPath = path.join(dataDir, ticker, folder);
            if (!fs.existsSync(folderPath)) {
                res.status(404).json({ error: "Folder not found" });
                return;
            }

            const manifestPath = path.join(folderPath, "manifest.txt");
            let files = [];
            if (fs.existsSync(manifestPath)) {
                const lines = fs.readFileSync(manifestPath, "utf8").split("\n");
                for (const line of lines) {
                    if (!line.trim()) continue;
                    const parts = line.split("|").map(s => s.trim());
                    if (parts.length >= 3) {
                        const item = parts[0];
                        const title = parts[1];
                        const fileName = parts[2];
                        if (fileName) {
                            files.push({ name: fileName, title: `${item}: ${title}` });
                        }
                    }
                }
            } else {
                const allFiles = fs.readdirSync(folderPath);
                files = allFiles
                    .filter(f => f.endsWith(".html") || f.endsWith(".htm"))
                    .map(f => ({ name: f, title: f }));
            }
            res.json({ files });
            return;
        }

        if (ticker) {
            const tickerPath = path.join(dataDir, ticker);
            if (!fs.existsSync(tickerPath)) {
                res.json({ folders: [] });
                return;
            }

            const items = fs.readdirSync(tickerPath);
            const folders = items.filter(item => {
                const stat = fs.statSync(path.join(tickerPath, item));
                return stat.isDirectory() && item !== "cache" && item !== "fixtures";
            });
            res.json({ folders });
            return;
        }

        const items = fs.readdirSync(dataDir);
        const tickers = items.filter(item => {
            const stat = fs.statSync(path.join(dataDir, item));
            return stat.isDirectory() && item !== "cache" && item !== "fixtures";
        });
        res.json({ tickers });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: `Failed to read data directory: ${error.message}` });
    }
});

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