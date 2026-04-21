import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ExtractedFilingDocument {
    filename: string;
    content: string;
}

export function extractFilingWithPython(url: string): Promise<ExtractedFilingDocument> {
    return new Promise((resolve, reject) => {
        const scriptPath = path.resolve(__dirname, '../../apps/mcp/sec_parser.py');
        const pythonProcess = spawn('python', [scriptPath, url]);

        let markdownOutput = '';
        let logs = '';

        pythonProcess.stdout.on('data', (data) => {
            markdownOutput += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            logs += data.toString();
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(`Python script failed with code ${code}. Logs: ${logs}`));
            }

            const match = logs.match(/Saved to (sec_report_\d+\.md|sec_analysis_\d+\.html)/);
            const filename = match ? String(match[1]) : `sec_extract_${Date.now()}.md`;
            resolve({ filename, content: markdownOutput });
        });
    });
}

export async function handleExtractionRequest(url: string): Promise<ExtractedFilingDocument> {
    return extractFilingWithPython(url);
}
