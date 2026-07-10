import express from 'express';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { getAiClient } from './ai-service.js';
import { FilingJobQueue, FilingWorker } from './queue.js';
import type { Server } from 'http';

export const dataExplorerRouter = express.Router();

const DATA_DIR = path.resolve(process.cwd(), 'data');
const FILINGS_DIR = DATA_DIR;
const QUEUE_DIR = path.join(DATA_DIR, 'queue');

const jobQueue = new FilingJobQueue(QUEUE_DIR);
let worker: FilingWorker | null = null;
let wss: WebSocketServer | null = null;

// Initialize WebSocket and Queue Worker
export function initDataExplorer(server: Server) {
    // 1. Start WebSocket Server
    wss = new WebSocketServer({ noServer: true });
    
    server.on('upgrade', (request, socket, head) => {
        // Only handle upgrades at root or data-explorer
        const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
        if (pathname === '/' || pathname === '/api/filings/data-explorer') {
            wss?.handleUpgrade(request, socket, head, (ws) => {
                wss?.emit('connection', ws, request);
            });
        }
    });

    wss.on('connection', (ws) => {
        console.log('[DataExplorer WS] Client connected');
        ws.send(JSON.stringify({ type: 'info', payload: { message: 'Connected to Data Explorer WebSocket' } }));
    });

    const broadcast = (type: string, payload: any) => {
        const msg = JSON.stringify({ type, payload });
        wss?.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(msg);
            }
        });
    };

    // 2. Start Queue Worker and hook up event notifications to WebSocket clients
    worker = new FilingWorker(jobQueue, FILINGS_DIR, {
        onJobStart: (job) => broadcast('start', job),
        onJobProgress: (job, item, index, total) => broadcast('progress', { index, total, item }),
        onJobComplete: (job) => broadcast('complete', job),
        onJobError: (job, error) => broadcast('error', { error: error.message }),
    });

    worker.start();
    console.log('🚀 Filing queue worker & WebSocket listener initialized.');
}

// CIK Lookup helper
async function getCikFromTicker(ticker: string): Promise<string | null> {
    const target = ticker.toUpperCase().trim();
    const paths = [
        path.resolve(DATA_DIR, 'company_tickers.json'),
        path.resolve(process.cwd(), 'company_tickers.json')
    ];

    let mappingFile = paths.find(p => fs.existsSync(p));
    if (!mappingFile) {
        try {
            const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
                headers: { 'User-Agent': 'SecFilingExploder contact@example.com' }
            });
            if (res.ok) {
                const data = await res.json();
                mappingFile = path.join(DATA_DIR, 'company_tickers.json');
                fs.mkdirSync(DATA_DIR, { recursive: true });
                fs.writeFileSync(mappingFile, JSON.stringify(data, null, 2));
            }
        } catch (e) {
            console.error('Failed to download ticker map:', e);
            return null;
        }
    }

    if (mappingFile && fs.existsSync(mappingFile)) {
        const raw = fs.readFileSync(mappingFile, 'utf-8');
        const data = JSON.parse(raw);
        for (const key of Object.keys(data)) {
            const entry = data[key];
            if (entry.ticker === target) {
                return String(entry.cik_str).padStart(10, '0');
            }
        }
    }
    return null;
}

// API Routes

// Serve HTML UI at GET /api/filings/data-explorer
dataExplorerRouter.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'apps/api/data-explorer/index.html'));
});

// Enqueue explosion job
dataExplorerRouter.post('/enqueue', (req, res) => {
    try {
        const job = jobQueue.enqueue(req.body);
        res.status(202).json(job);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Get directory structure tree
dataExplorerRouter.get('/tree', (req, res) => {
    if (!fs.existsSync(FILINGS_DIR)) return res.json([]);
    
    const buildTree = (dirPath: string): any[] => {
        return fs.readdirSync(dirPath, { withFileTypes: true })
            .filter(d => !d.name.startsWith('.') && d.name !== 'notes.md' && d.name !== 'queue' && d.name !== 'company_tickers.json' && d.name !== 'cache' && d.name !== 'fixtures')
            .sort((a, b) => {
                if (a.isDirectory() && b.isFile()) return -1;
                if (a.isFile() && b.isDirectory()) return 1;
                return b.name.localeCompare(a.name);
            })
            .map(d => {
                const fullPath = path.join(dirPath, d.name);
                const relativePath = path.relative(FILINGS_DIR, fullPath).replace(/\\/g, '/');
                if (d.isDirectory()) {
                    return { name: d.name, type: 'folder', path: relativePath, children: buildTree(fullPath) };
                }
                return { name: d.name, type: 'file', path: relativePath };
            });
    };
    res.json(buildTree(FILINGS_DIR));
});

// Get filing notes
dataExplorerRouter.get('/notes', (req, res) => {
    const dirPath = req.query.dir as string;
    if (!dirPath) return res.status(400).json({ error: 'Missing dir query parameter' });

    const safePath = path.resolve(FILINGS_DIR, dirPath);
    if (!safePath.startsWith(FILINGS_DIR)) return res.status(403).json({ error: 'Invalid path' });

    const filePath = path.join(safePath, 'notes.md');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.send('');
    }
});

// Save filing notes
dataExplorerRouter.post('/notes', (req, res) => {
    const dirPath = req.body.dir;
    if (!dirPath) return res.status(400).json({ error: 'Missing dir in body' });

    const safePath = path.resolve(FILINGS_DIR, dirPath);
    if (!safePath.startsWith(FILINGS_DIR)) return res.status(403).json({ error: 'Invalid path' });

    const filePath = path.join(safePath, 'notes.md');
    fs.mkdirSync(safePath, { recursive: true });
    fs.writeFileSync(filePath, req.body.content, 'utf-8');
    res.json({ success: true });
});

// Create new custom HTML
dataExplorerRouter.post('/files/create', (req, res) => {
    const { dir, name } = req.body;
    if (!dir || !name) return res.status(400).json({ error: 'Missing dir or name' });

    const safePath = path.resolve(FILINGS_DIR, dir);
    if (!safePath.startsWith(FILINGS_DIR)) return res.status(403).json({ error: 'Invalid path' });

    const cleanName = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '_') + '.html';
    const filePath = path.join(safePath, cleanName);

    if (fs.existsSync(filePath)) {
        return res.status(400).json({ error: 'File already exists' });
    }

    const template = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${name}</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 24px auto; padding: 0 16px; line-height: 1.6; color: #1f2937; }
        h1 { font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 16px; }
        .excerpt-block { background: #f9fafb; border-left: 4px solid #3b82f6; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0; }
        .meta { font-size: 12px; color: #6b7280; margin-bottom: 8px; }
    </style>
</head>
<body>
    <h1>${name}</h1>
    <p>Use the Edit Source editor to add press release excerpts, transcripts, or notes in HTML format here...</p>
</body>
</html>`;

    try {
        fs.mkdirSync(safePath, { recursive: true });
        fs.writeFileSync(filePath, template, 'utf-8');
        res.status(201).json({ success: true, fileName: cleanName });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get raw HTML code
dataExplorerRouter.get('/files/raw', (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ error: 'Missing path query parameter' });

    const safePath = path.resolve(FILINGS_DIR, filePath);
    if (!safePath.startsWith(FILINGS_DIR)) return res.status(403).json({ error: 'Invalid path' });

    if (!fs.existsSync(safePath)) return res.status(404).json({ error: 'File not found' });

    try {
        const raw = fs.readFileSync(safePath, 'utf-8');
        res.type('text/plain').send(raw);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Save raw HTML code
dataExplorerRouter.post('/files/save', (req, res) => {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) return res.status(400).json({ error: 'Missing path or content' });

    const safePath = path.resolve(FILINGS_DIR, filePath);
    if (!safePath.startsWith(FILINGS_DIR)) return res.status(403).json({ error: 'Invalid path' });

    try {
        fs.writeFileSync(safePath, content, 'utf-8');
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Delete a file or directory
dataExplorerRouter.post('/files/delete', (req, res) => {
    const relPath = req.body.path;
    if (!relPath) return res.status(400).json({ error: 'Missing path in body' });

    const safePath = path.resolve(FILINGS_DIR, relPath);
    if (!safePath.startsWith(FILINGS_DIR)) return res.status(403).json({ error: 'Invalid path' });

    if (!fs.existsSync(safePath)) return res.status(404).json({ error: 'Not found' });

    try {
        const stat = fs.statSync(safePath);
        if (stat.isDirectory()) {
            fs.rmSync(safePath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(safePath);
        }
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// CIK & Filing list lookup
dataExplorerRouter.get('/lookup/:ticker', async (req, res) => {
    const ticker = req.params.ticker.toUpperCase().trim();
    try {
        const cik = await getCikFromTicker(ticker);
        if (!cik) {
            return res.status(404).json({ error: `CIK not found for ticker: ${ticker}` });
        }

        const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
        const secRes = await fetch(url, {
            headers: { 'User-Agent': 'SecFilingExploder contact@example.com' }
        });

        if (!secRes.ok) {
            return res.status(secRes.status).json({ error: `SEC submissions fetch failed: ${secRes.statusText}` });
        }

        const data: any = await secRes.json();
        const recent = data.filings?.recent;
        if (!recent) {
            return res.json({ ticker, cik, filings: [] });
        }

        const filings = [];
        const unpaddedCik = cik.replace(/^0+/, '');

        for (let i = 0; i < recent.form.length; i++) {
            const form = recent.form[i];
            if (['10-K', '10-Q', '8-K'].includes(form)) {
                const accession = recent.accessionNumber[i];
                const unformattedAccession = accession.replaceAll('-', '');
                const primaryDoc = recent.primaryDocument[i];
                const reportDate = recent.reportDate[i];
                const filingUrl = `https://www.sec.gov/Archives/edgar/data/${unpaddedCik}/${unformattedAccession}/${primaryDoc}`;

                filings.push({
                    form,
                    reportDate,
                    filingUrl,
                    accessionNumber: accession
                });
            }
        }

        res.json({ ticker, cik, filings });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Run AI analysis
dataExplorerRouter.post('/ai/analyze', async (req, res) => {
    const { filePaths, query } = req.body;
    if (!Array.isArray(filePaths)) {
        return res.status(400).json({ error: 'filePaths must be an array of strings' });
    }

    if (filePaths.length > 3) {
        return res.status(400).json({ error: 'Maximum of 3 file attachments allowed' });
    }

    try {
        const attachments = [];
        for (const fPath of filePaths) {
            const safePath = path.resolve(FILINGS_DIR, fPath);
            if (!safePath.startsWith(FILINGS_DIR)) {
                return res.status(403).json({ error: `Forbidden path access: ${fPath}` });
            }
            if (fs.existsSync(safePath)) {
                let content = fs.readFileSync(safePath, 'utf-8');
                content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
                content = content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
                
                attachments.push({
                    name: path.basename(fPath),
                    content: content.slice(0, 150000)
                });
            }
        }

        const prompt = query || "Provide a summary of the key findings, metrics, and risk items across the attached documents.";
        const aiClient = getAiClient();
        const responseText = await aiClient.generate(prompt, attachments);

        res.json({ result: responseText });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});
