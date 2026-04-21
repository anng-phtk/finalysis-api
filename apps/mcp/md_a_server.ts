import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { exec } from 'node:child_process';
import util from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Construct __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target the sibling file exactly
const pythonScriptPath = path.resolve(__dirname, 'sec_parser.py');

const execPromise = util.promisify(exec);

// 1. Initialize the MCP Server
const server = new Server(
    {
        name: "Finalysis-MCP-Server",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// 2. Define the Tool Schema for the AI
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "get_mda_narrative") {
    throw new Error(`Tool not found: ${request.params.name}`);
  }

  const ticker = String(request.params.arguments?.ticker ?? "");
  const url = String(request.params.arguments?.url ?? "");

  try {
    console.error(`[MCP] AI requested MD&A for ${ticker}.`);
    console.error(`[MCP] Using parser at: ${pythonScriptPath}`);
    console.error(`[MCP] URL: ${url}`);

    const { stdout, stderr } = await execPromise(
      `python "${pythonScriptPath}" "${url}"`
    );

    if (stderr) {
      console.error(`[Python Worker Warning]: ${stderr}`);
    }

    return {
      content: [
        {
          type: "text",
          text: stdout.trim(),
        },
      ],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    console.error(`[MCP Error]: Failed to execute Python script: ${message}`);

    return {
      content: [
        {
          type: "text",
          text: `Error extracting narrative: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// 3. Execute the Python Worker
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "get_mda_narrative") {
        const ticker = String(request.params.arguments?.ticker);
        const url = String(request.params.arguments?.url);

        // Resolve the path to the sibling python directory
        //const pythonScriptPath = path.resolve(process.cwd(), 'apps', 'mcp', 'sec_parser.py');
        // const { stdout, stderr } = await execPromise(`python "${pythonScriptPath}" "${url}"`);
        // We log to stderr so we don't corrupt the MCP stdout communication
        console.error(`[MCP] AI requested MD&A for ${ticker}. Spawning Python worker...`);

        try {
            // Spawn the Python process and pass the URL
            const { stdout, stderr } = await execPromise(`python "${pythonScriptPath}" "${url}"`);

            if (stderr) {
                console.error(`[Python Worker Warning]: ${stderr}`);
            }


            // Return the clean text directly to the AI
            return {
                content: [
                    {
                        type: "text",
                        text: stdout,
                    },
                ],
            };
        } catch (error) {
            console.error(`[MCP Error]: Failed to execute Python script:`, error);
            return {
                content: [{ type: "text", text: `Error extracting narrative: ${error}` }],
                isError: true,
            };
        }
    }

    throw new Error(`Tool not found: ${request.params.name}`);
});

// 4. Start the Transport
async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Finalysis MCP Server running on stdio");
}

run().catch(console.error);