import express, { type Request, type Response } from "express";
import dotenv from "dotenv";
import { fundamentalsRouter } from "./routes/fundamentals.js";
import { filingsRouter } from "./routes/filings.js";
import { quoteRouter } from "./routes/quote.js";
import { insightsRouter } from "./routes/insights.js";
import cors from "cors";
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
app.use(cors());

app.use('/api/fundamentals', fundamentalsRouter);
app.use('/api/filings', filingsRouter);
app.use('/api/quote', quoteRouter);
app.use('/api/insights', insightsRouter);

app.get("/api/filing-reader", async (req: Request, res: Response) => {
    try {
        const url = req.query.url;
        if (!url || typeof url !== "string") {
            res.status(400).send("Missing or invalid 'url' query parameter.");
            return;
        }

        const secRes = await fetch(url, {
            headers: {
                "User-Agent": "Finalysis reader your-email@example.com"
            }
        });

        if (!secRes.ok) {
            res.status(secRes.status).send(`Failed to fetch filing from SEC: ${secRes.statusText}`);
            return;
        }

        let html = await secRes.text();

        // Strip stylesheets
        html = html.replace(/<style[\s\S]*?<\/style>/gi, "");
        html = html.replace(/<link[^>]+stylesheet[^>]*>/gi, "");

        // Inject eReader readable styles
        html = html.replace(
            "</head>",
            `
            <style>
              body {
                font-family: Georgia, "Times New Roman", serif;
                font-size: 20px;
                line-height: 1.65;
                max-width: 760px;
                margin: 0 auto;
                padding: 2rem;
                color: #111;
                background: #fff;
              }

              table {
                width: 100% !important;
                border-collapse: collapse;
                font-size: 16px;
                margin: 1.5rem 0;
              }

              td, th {
                padding: 0.35rem;
                vertical-align: top;
                border: 1px solid #ddd;
              }

              a {
                color: #111;
              }

              .ixviewer, script, nav, #header, #footer {
                display: none !important;
              }
            </style>
            </head>`
        );

        res.setHeader("Content-Type", "text/html");
        res.send(html);
    } catch (error: any) {
        res.status(500).send(`Error rendering filing: ${error.message}`);
    }
});

app.get("/", async (req: Request, res: Response) => {
    res.send("Hello World!");
});

app.listen(port, () => {
    console.log("Server started on port 3000");
});

