import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { uploadToDrive } from '../storage/upload-svc.js';

// ESM fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. The Subprocess Wrapper
function extractFilingWithPython(url: string): Promise<{ filename: string, content: string }> {
    return new Promise((resolve, reject) => {
        // Correct path to the parser located in apps/mcp/
        const scriptPath = path.resolve(__dirname, '../../apps/mcp/sec_parser.py'); 
        
        // Use 'python' for Windows environments
        const pythonProcess = spawn('python', [scriptPath, url]);

        let markdownOutput = '';
        let logs = '';

        pythonProcess.stdout.on('data', (data) => {
            markdownOutput += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            const logLine = data.toString();
            logs += logLine;
            console.log(`Python Logs: ${logLine.trim()}`);
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(`Python script failed with code ${code}. Logs: ${logs}`));
            }

            // Look for the saved filename in stderr logs
            const match = logs.match(/Saved to (sec_report_\d+\.md|sec_analysis_\d+\.html)/);
            const filename: string = match ? String(match[1]) : `sec_extract_${Date.now()}.md`;

            resolve({ filename, content: markdownOutput });
        });
    });
}

// 2. The Finalysis Controller
export async function handleExtractionRequest(url: string) {
    try {
        console.log(`[*] Starting extraction for: ${url}`);
        
        // Step 1: Python Scraper/Parser
        const { filename, content } = await extractFilingWithPython(url);
        
        // Step 2: Google Drive Deposit (Local G:\ Sync)
        const savedPath = await uploadToDrive(filename, content);
        
        console.log(`[SUCCESS] Pipeline finished. File available at: ${savedPath}`);
        
    } catch (error) {
        console.error("Critical Failure in Extraction Pipeline:", error);
    }
}

// Run test for user's example URL
const TEST_URL = "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm";
await handleExtractionRequest(TEST_URL);