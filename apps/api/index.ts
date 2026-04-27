import express, { type Request, type Response } from "express";
import dotenv from "dotenv";
import { fundamentalsRouter } from "./routes/fundamentals.js";
import { filingsRouter } from "./routes/filings.js";
import { quoteRouter } from "./routes/quote.js";
import cors from "cors";
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
app.use(cors());

app.use('/api/fundamentals', fundamentalsRouter);
app.use('/api/filings', filingsRouter);
app.use('/api/quote', quoteRouter);
app.get("/", async (req: Request, res: Response) => {
    res.send("Hello World!");
});

app.listen(port, () => {
    console.log("Server started on port 3000");
});

