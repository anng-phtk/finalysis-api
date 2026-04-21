import express, { type Request, type Response } from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.get("/", async (req: Request, res: Response) => {
    res.send("Hello World!");
});

app.listen(port, () => {
    console.log("Server started on port 3000");
});

