#!/usr/bin/env node

/**
 * Perplexity AI Search Server for MCP
 * Implements a `search_perplexity` tool to query the Perplexity API.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

if (!PERPLEXITY_API_KEY) {
  console.error("Error: PERPLEXITY_API_KEY environment variable is not set.");
  process.exit(1);
}

const server = new Server(
  {
    name: "perplexity",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Expose a single "search_perplexity" tool.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_perplexity",
        description: "Search the web and generate an answer using Perplexity AI (sonar model)",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query or question to ask Perplexity"
            },
            model: {
              type: "string",
              description: "Optional model name (defaults to sonar)",
              default: "sonar"
            }
          },
          required: ["query"]
        }
      }
    ]
  };
});

/**
 * Handler for the search_perplexity tool.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "search_perplexity") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const query = request.params.arguments?.query;
  const model = request.params.arguments?.model || "sonar";

  if (typeof query !== "string" || !query.trim()) {
    throw new Error("A valid string 'query' is required");
  }

  try {
    const response = await axios.post(
      "https://api.perplexity.ai/chat/completions",
      {
        model: model,
        messages: [
          { role: "system", content: "You are a helpful research assistant. Provide concise, accurate answers with citations when possible." },
          { role: "user", content: query }
        ],
        temperature: 0.2,
      },
      {
        headers: {
          "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const answer = response.data?.choices?.[0]?.message?.content;
    
    if (!answer) {
      throw new Error("Invalid response format from Perplexity API");
    }

    return {
      content: [{
        type: "text",
        text: answer
      }]
    };
  } catch (error: any) {
    console.error("Perplexity API Error:", error.response?.data || error.message);
    throw new Error(`Failed to execute Perplexity search: ${error.message}`);
  }
});

/**
 * Start the server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Perplexity MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
