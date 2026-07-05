import express, { type Request, type Response } from "express";
import dotenv from "dotenv";
import { fundamentalsRouter } from "./routes/fundamentals.js";
import { filingsRouter } from "./routes/filings.js";
import { quoteRouter } from "./routes/quote.js";
import { insightsRouter } from "./routes/insights.js";
import cors from "cors";
import path from "path";
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
app.use(cors());

app.use('/data', express.static(path.join(process.cwd(), 'data')));

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
              /* Reset layout margins for eReaders */
              html, body {
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
                color: #111 !important;
                font-family: Georgia, serif !important;
              }
              
              body {
                padding: 1.2rem !important;
                max-width: 800px !important;
                margin: 0 auto !important;
              }

              /* Clear page centering margins on main wrappers */
              body > div, body > section, .main-content, main {
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
              }

              /* Fix nested divs and paragraphs with wide margins */
              div, p, section {
                margin-left: 0 !important;
                margin-right: 0 !important;
                padding-left: 0 !important;
                padding-right: 0 !important;
                width: auto !important;
                max-width: 100% !important;
              }

              /* Global text formatting overrides */
              p, span, div, font, td, th, li, a {
                font-family: Georgia, serif !important;
                font-size: 18px !important;
                line-height: 1.65 !important;
                color: #111 !important;
                letter-spacing: normal !important;
                word-spacing: normal !important;
              }

              /* Ensure headings stand out clearly */
              h1, h2, h3, h4, h5, h6, strong, b {
                font-family: Georgia, serif !important;
                font-weight: bold !important;
                color: #111 !important;
              }

              h1, h2, h3 {
                margin-top: 1.8rem !important;
                margin-bottom: 0.6rem !important;
                line-height: 1.3 !important;
              }
              h1 { font-size: 24px !important; }
              h2 { font-size: 22px !important; }
              h3 { font-size: 20px !important; }

              /* Table formatting to be clean and readable */
              table {
                width: 100% !important;
                margin: 1.5rem 0 !important;
                border-collapse: collapse !important;
              }

              td, th {
                padding: 0.4rem !important;
                vertical-align: top !important;
                border: 1px solid #ccc !important;
                background-color: transparent !important;
              }

              /* Hide SEC interactive UI, scripts, and navigation */
              .ixviewer, script, nav, iframe, #header, #footer, [class*="ix"] {
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

