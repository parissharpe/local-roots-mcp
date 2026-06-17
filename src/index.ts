#!/usr/bin/env node
/**
 * LocalRoots MCP. Surfaces independent local businesses the algorithm normally
 * buries. Four tools, all built on the Google Places API (New) plus a bundled
 * chain database, e-commerce platform fingerprints, and an NC Century Farm
 * registry placeholder.
 *
 * Every tool returns structured JSON with name, address, tier, score, and a
 * signal breakdown the user can read to understand WHY a place ranked where
 * it did. The breakdown is the differentiator; see CONTRIBUTING.md before
 * touching the scoring engine or the response shape.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  inputSchema as discoverSchema,
  discoverLocalIndependents,
} from "./tools/discoverLocalIndependents.js";
import {
  inputSchema as scoreSchema,
  scoreSpecificBusiness,
} from "./tools/scoreSpecificBusiness.js";
import {
  inputSchema as farmsSchema,
  findFarmsWithOnlineStore,
} from "./tools/findFarmsWithOnlineStore.js";
import {
  inputSchema as indexSchema,
  neighborhoodLocalIndex,
} from "./tools/neighborhoodLocalIndex.js";

import { runTool } from "./util/response.js";

function checkEnvAtStartup(): void {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || key.trim().length === 0) {
    process.stderr.write(
      "local-roots-mcp: WARNING. GOOGLE_PLACES_API_KEY is not set. Tools that call Google Places will fail until you configure it. See .env.example.\n",
    );
  }
}

const server = new McpServer(
  {
    name: "local-roots-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.tool(
  "discover_local_independents",
  "Find independent local businesses for a given query and location, ranked by LocalRoots' independence score instead of Google's review-volume default. " +
    "The algorithm penalizes high review counts, disqualifies national chains, and rewards long tenure, family-ownership name signals, sparse marketing footprint, and " +
    "(for farms) direct-to-consumer e-commerce. Use this when a user asks for local coffee, an independent bookstore, a real bakery, etc. Returns up to max_results " +
    "businesses, each with a tier (tier_1 = strong independent, tier_4 = chain), the total score, the full signal_breakdown, and a per-result practical_note. " +
    "Always include the place_id from results so follow-up tools can reference the specific business.",
  discoverSchema.shape,
  async (args) => runTool("discover_local_independents", args, discoverLocalIndependents),
);

server.tool(
  "score_specific_business",
  "Score a specific business by place_id, or by (name + near). Returns the same tier and signal_breakdown shape as discover_local_independents, but for a single " +
    "place the user already has in mind. Use this when a user asks 'is X actually independent?' or wants to understand why a particular business ranked where it did. " +
    "Will fetch Place Details from Google Places if a place_id is given, or run a top-1 text search if only name+near are given.",
  scoreSchema.shape,
  async (args) => runTool("score_specific_business", args, scoreSpecificBusiness),
);

server.tool(
  "find_farms_with_online_store",
  "Find independent farms near a location that have direct-to-consumer e-commerce. Detection works by fingerprinting the farm's website against the bundled list of " +
    "farm-first DTC platforms (GrazeCart, Local Line, Barn2Door, Harvie, Farmigo, GrownBy, LocalHarvest). Farms confirmed to have a DTC store are ranked first, " +
    "then other independent farms without a confirmed store. Use this when a user wants to buy direct from a farm without going through an aggregator or " +
    "marketplace. Optional product_focus narrows by meat / produce / dairy / CSA / eggs / flowers.",
  farmsSchema.shape,
  async (args) => runTool("find_farms_with_online_store", args, findFarmsWithOnlineStore),
);

server.tool(
  "neighborhood_local_index",
  "Score a neighborhood for its overall independent-business density. Samples each of a set of categories (restaurant, coffee, grocery, hardware, bookstore, bakery " +
    "by default), runs LocalRoots scoring on each result, and aggregates into a single Local Index plus per-category stats. Use this when a user asks 'how local is " +
    "X neighborhood' or wants to compare two areas. The per-category breakdown is the real signal; a neighborhood can be chain-dominant for restaurants and strongly " +
    "independent for hardware, and surfacing that nuance is the point.",
  indexSchema.shape,
  async (args) => runTool("neighborhood_local_index", args, neighborhoodLocalIndex),
);

async function main() {
  checkEnvAtStartup();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stdio MCP servers must not write to stdout outside of the protocol; log to
  // stderr so Claude Desktop's log capture can pick it up without corrupting
  // the JSON-RPC stream.
  process.stderr.write("local-roots-mcp: stdio transport connected\n");
}

main().catch((err) => {
  process.stderr.write(
    `local-roots-mcp: fatal error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
