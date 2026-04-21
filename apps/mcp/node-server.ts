#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { JSDOM } from "jsdom";
import fetch from "node-fetch";

// ============================================================================
// 1. Helper: Extract MD&A (Item 7) from an SEC 10-K HTML
// ============================================================================
async function extractMDAFromURL(url) {
  console.error(`[MCP] Fetching: ${url}`);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Finalysis-MCP/1.0 (your-email@example.com)" // SEC requires a User-Agent
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Strategy 1: Look for a div with id containing "item7" or class "section"
  let mdaSection = null;

  // Common patterns in SEC filings:
  // - <div id="s007"> (used in many modern EDGAR filings)
  // - <a name="Item7"> or <a name="item_7">
  // - <div class="Section">Item 7. Management's Discussion and Analysis...
  const possibleSelectors = [
    'div[id*="s007"]',
    'div[id*="item7"]',
    'div[id*="Item7"]',
    'div[class*="item7"]',
    'div[class*="Item7"]',
    'a[name="Item7"]',
    'a[name="item_7"]',
    'div:contains("Item 7.")',
    'div:contains("Management\'s Discussion")'
  ];

  for (const selector of possibleSelectors) {
    const elem = document.querySelector(selector);
    if (elem) {
      mdaSection = elem;
      break;
    }
  }

  // If still not found, fallback to a regex extraction from raw text
  let extractedText = "";
  if (mdaSection) {
    // Get all text from this element onward until next Item (Item 7A or Item 8)
    let nextItem = mdaSection.nextElementSibling;
    let content = mdaSection.textContent || "";
    while (nextItem && !nextItem.textContent.match(/Item\s+7A|Item\s+8|Item\s+7\./i)) {
      content += " " + (nextItem.textContent || "");
      nextItem = nextItem.nextElementSibling;
    }
    extractedText = content;
  } else {
    // Fallback: Regex on the whole document body text
    const bodyText = document.body.textContent || "";
    const regex = /Item\s+7\.\s*Management's\s+Discussion\s+and\s+Analysis(.*?)(?=Item\s+7A|Item\s+8|Item\s+7\.|\Z)/is;
    const match = bodyText.match(regex);
    if (match) {
      extractedText = match[1];
    } else {
      // Last resort: return the entire body (but trim)
      extractedText = bodyText.slice(0, 10000); // limit to 10k chars
      console.error("[MCP] Warning: Could not locate Item 7 precisely, returning truncated body.");
    }
  }

  // Clean up excessive whitespace
  const cleaned = extractedText.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    throw new Error("No MD&A content could be extracted from the filing.");
  }
  return cleaned;
}

// ============================================================================
// 2. MCP Server Initialisation
// ============================================================================
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

// ============================================================================
// 3. Tool Listing
// ============================================================================
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_mda_narrative",
        description:
          "Extracts the Management Discussion & Analysis (Item 7) text from an SEC 10-K filing URL. Use this to read management's qualitative discussion of financial results, risks, and outlook.",
        inputSchema: {
          type: "object",
          properties: {
            ticker: {
              type: "string",
              description: "The stock ticker symbol (e.g., AAPL)",
            },
            url: {
              type: "string",
              description:
                "The raw SEC EDGAR HTML URL for the 10-K filing (e.g., https://www.sec.gov/Archives/edgar/data/.../...htm)",
            },
          },
          required: ["ticker", "url"],
        },
      },
    ],
  };
});

// ============================================================================
// 4. Tool Execution
// ============================================================================
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "get_mda_narrative") {
    const ticker = String(request.params.arguments?.ticker);
    const url = String(request.params.arguments?.url);

    console.error(`[MCP] AI requested MD&A for ${ticker} from ${url}`);

    try {
      const narrative = await extractMDAFromURL(url);
      // Return the extracted text to the AI
      return {
        content: [
          {
            type: "text",
            text: `Management Discussion & Analysis (Item 7) for ${ticker}:\n\n${narrative}`,
          },
        ],
      };
    } catch (error) {
      console.error(`[MCP Error] Failed to extract MD&A:`, error);
      return {
        content: [
          {
            type: "text",
            text: `Error extracting narrative for ${ticker}: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Tool not found: ${request.params.name}`);
});

// ============================================================================
// 5. Start Transport
// ============================================================================
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Finalysis MCP Server running on stdio (Node.js version)");
}

run().catch((err) => {
  console.error("Fatal error starting MCP server:", err);
  process.exit(1);
});

//npm install @modelcontextprotocol/sdk jsdom node-fetchconfigure