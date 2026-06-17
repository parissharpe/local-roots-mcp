/**
 * Smoke test. Exercises each of the five tools with realistic example inputs.
 * Run with: npm run smoke-test
 *
 * If GOOGLE_PLACES_API_KEY is missing, the smoke test prints a clear notice
 * and exits 0 for the offline-only checks. With a real key, every tool will
 * make live calls and return scored results.
 */

import { discoverLocalIndependents, inputSchema as discoverIn } from "../src/tools/discoverLocalIndependents.js";
import { scoreSpecificBusiness, inputSchema as scoreIn } from "../src/tools/scoreSpecificBusiness.js";
import { findFarmsWithOnlineStore, inputSchema as farmsIn } from "../src/tools/findFarmsWithOnlineStore.js";
import { neighborhoodLocalIndex, inputSchema as indexIn } from "../src/tools/neighborhoodLocalIndex.js";
import { compareLocalVsChain, inputSchema as compareIn } from "../src/tools/compareLocalVsChain.js";

import { score } from "../src/lib/scoring.js";
import { detectChain } from "../src/lib/chains.js";
import { detectEcommercePlatforms } from "../src/lib/ecommerce.js";

let failed = 0;

function section(title: string): void {
  process.stdout.write(`\n${"=".repeat(70)}\n${title}\n${"=".repeat(70)}\n`);
}

function pretty(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

async function check(label: string, fn: () => unknown | Promise<unknown>): Promise<void> {
  try {
    const out = await fn();
    process.stdout.write(`\n--- ${label} ---\n${pretty(out)}\n`);
  } catch (err) {
    failed += 1;
    process.stderr.write(
      `\n!!! ${label} FAILED: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

async function main(): Promise<void> {
  const haveKey = Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());

  section("Offline checks (no API key required)");
  await check("detectChain: Starbucks", () => detectChain("Starbucks"));
  await check("detectChain: Joe's Burger Shack", () => detectChain("Joe's Burger Shack"));
  await check("detectEcommercePlatforms: GrazeCart subdomain", () =>
    detectEcommercePlatforms("https://sunnyhill.grazecart.com"),
  );
  await check("score: Wilson & Sons Hardware (est. 1932)", () =>
    score({
      name: "Wilson & Sons Hardware",
      editorial_summary: "Established 1932 by the Wilson family.",
      user_rating_count: 18,
      photo_count: 4,
      website_uri: null,
    }),
  );
  await check("score: Oakridge Farm with barn2door storefront", () =>
    score({
      name: "Oakridge Farm",
      category_hint: "farm",
      website_uri: "https://oakridge.barn2door.com",
      user_rating_count: 12,
    }),
  );
  await check("score: Starbucks (should disqualify)", () =>
    score({ name: "Starbucks", user_rating_count: 800 }),
  );

  if (!haveKey) {
    process.stdout.write(
      "\nGOOGLE_PLACES_API_KEY is not set. Skipping live tool calls.\n" +
        "Set the env var and re-run to exercise discover_local_independents, score_specific_business, find_farms_with_online_store, neighborhood_local_index, and compare_local_vs_chain against the real API.\n",
    );
    finish();
    return;
  }

  section("Live: discover_local_independents (coffee near Durham, NC)");
  await check("coffee, Durham, NC, 3km", () =>
    discoverLocalIndependents(
      discoverIn.parse({ query: "coffee", near: "Durham, NC", radius_km: 3, max_results: 5 }),
    ),
  );

  section("Live: score_specific_business (name + near)");
  await check("name + near", () =>
    scoreSpecificBusiness(
      scoreIn.parse({ name: "Cocoa Cinnamon", near: "Durham, NC" }),
    ),
  );

  section("Live: find_farms_with_online_store (Hudson Valley, NY)");
  await check("any product, Hudson Valley", () =>
    findFarmsWithOnlineStore(
      farmsIn.parse({ near: "Hudson Valley, NY", radius_km: 80, max_results: 6 }),
    ),
  );

  section("Live: neighborhood_local_index (East Nashville, TN)");
  await check("East Nashville, TN, default categories", () =>
    neighborhoodLocalIndex(
      indexIn.parse({ neighborhood: "East Nashville, TN", radius_km: 3, sample_size: 8 }),
    ),
  );

  section("Live: compare_local_vs_chain (Finca Coffee vs Starbucks, Charlotte, NC)");
  await check("Finca Coffee vs Starbucks near Charlotte, NC", () =>
    compareLocalVsChain(
      compareIn.parse({
        independent_name: "Finca Coffee",
        chain_name: "Starbucks",
        near: "Charlotte, NC",
      }),
    ),
  );

  finish();
}

function finish(): void {
  process.stdout.write(`\n${"=".repeat(70)}\n`);
  if (failed === 0) {
    process.stdout.write("SMOKE TEST PASSED: all checks returned valid responses.\n");
    process.exit(0);
  } else {
    process.stderr.write(`SMOKE TEST FAILED: ${failed} check(s) errored.\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`SMOKE TEST CRASHED: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
