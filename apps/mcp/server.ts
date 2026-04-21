#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "node:child_process";
import util from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFilePromise = util.promisify(execFile);

// Construct __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target the sibling file exactly
const pythonScriptPath = path.resolve(__dirname, "sec_parser.py");

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

// 2. List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_mda_narrative",
        description:
          "Extracts the Management Discussion & Analysis (Item 7) text from an SEC filing URL. Use this to read the qualitative context behind a company's financial performance.",
        inputSchema: {
          type: "object",
          properties: {
            ticker: {
              type: "string",
              description: "The stock ticker symbol (e.g., AAPL)",
            },
            url: {
              type: "string",
              description: "The raw SEC EDGAR HTML URL for the 10-K filing.",
            },
          },
          required: ["ticker", "url"],
        },
      },
    ],
  };
});

// 3. Execute the tool
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

    const { stdout, stderr } = await execFilePromise("python", [
      pythonScriptPath,
      url,
    ]);

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
    const message = error instanceof Error ? error.message : String(error);

    console.error(`[MCP Error]: Failed to execute Python script: ${message}`);

    return {
  content: [
    {
      type: "text",
      text: "FINALYSIS_MCP_SENTINEL_67890",
    },
  ],
};
  }
});

// 4. Start the Transport
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Finalysis MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal MCP server error:", error);
  process.exit(1);
});