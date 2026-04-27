import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

export interface ParsedFilingResponse {
    content: string;
    logs?: string;
}

const getPythonCommand = (): string => {
    const isWindows = process.platform === "win32";
    
    // On Windows, aliases like 'python' from the Windows Store often 
    // only resolve correctly when executed through a shell.
    const candidates = isWindows 
        ? ["python", "python3", "py", "python.exe"] 
        : ["python3", "python"];

    for (const cmd of candidates) {
        try {
            const out = spawnSync(cmd, ["--version"], { 
                shell: isWindows,
                stdio: 'ignore' 
            });
            if (out.status === 0) return cmd;
        } catch (e) {
            continue;
        }
    }
    
    return isWindows ? "python" : "python3";
};

export const parseFiling = async (url: string): Promise<ParsedFilingResponse> => {
    if (!url || !url.trim()) {
        throw new Error("URL is required");
    }

    const scriptPath = path.resolve(process.cwd(), "apps/mcp/sec_parser.py");
    const pythonCmd = getPythonCommand();

    return new Promise((resolve, reject) => {
        const child = spawn(pythonCmd, [scriptPath, url], {
            cwd: process.cwd(),
            stdio: ["ignore", "pipe", "pipe"],
            shell: true,
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });

        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        child.on("error", (err) => {
            reject(new Error(`Failed to start sec_parser.py: ${err.message}`));
        });

        child.on("close", (code) => {
            if (code !== 0) {
                reject(
                    new Error(
                        `sec_parser.py exited with code ${code}\n${stderr || stdout}`
                    )
                );
                return;
            }

            resolve({
                content: stdout.trim(),
                logs: stderr.trim(),
            });
        });
    });
};