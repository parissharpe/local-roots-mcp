/**
 * Calibration script for v0.2 tier threshold tuning.
 * Run with: tsx scripts/calibrate.ts
 */
import { discoverLocalIndependents, inputSchema } from "../src/tools/discoverLocalIndependents.js";

const QUERIES = [
  { query: "coffee", near: "Charlotte, NC" },
  { query: "bookstore", near: "Portland, OR" },
  { query: "restaurant", near: "Austin, TX" },
];

async function main() {
  for (const q of QUERIES) {
    process.stdout.write(`\n${"=".repeat(60)}\n${q.query} near ${q.near}\n${"=".repeat(60)}\n`);
    const result = await discoverLocalIndependents(
      inputSchema.parse({ query: q.query, near: q.near, max_results: 10 }),
    );
    const dist: Record<string, number> = { tier_1: 0, tier_2: 0, tier_3: 0, tier_4: 0 };
    for (const r of result.answer.results) dist[r.tier]++;
    const total = result.answer.result_count;
    process.stdout.write(`Results: ${total}  Enriched: ${result.answer.enrichment_applied}\n`);
    process.stdout.write(
      `Tier dist: tier_1=${dist.tier_1} (${pct(dist.tier_1, total)}%)  tier_2=${dist.tier_2} (${pct(dist.tier_2, total)}%)  tier_3=${dist.tier_3} (${pct(dist.tier_3, total)}%)  tier_4=${dist.tier_4}\n`,
    );
    for (const r of result.answer.results) {
      const sigs = [...r.signal_breakdown.universal, ...r.signal_breakdown.category_bonuses]
        .map((s) => `${s.signal}(${s.points > 0 ? "+" : ""}${s.points})`)
        .join(", ");
      const negs = r.signal_breakdown.negatives.map((s) => `${s.signal}(${s.points})`).join(", ");
      process.stdout.write(
        `  [${r.tier}/${r.total_score}] ${r.name}\n    + ${sigs || "none"}\n    - ${negs || "none"}\n`,
      );
    }
  }
}

function pct(n: number, total: number): string {
  return total === 0 ? "0" : Math.round((n / total) * 100).toString();
}

main().catch((err) => {
  process.stderr.write(String(err) + "\n");
  process.exit(1);
});
