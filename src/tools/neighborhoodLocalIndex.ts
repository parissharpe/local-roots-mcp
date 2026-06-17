import { z } from "zod";
import { searchText, type Place } from "../lib/google-places.js";
import { score, type Tier } from "../lib/scoring.js";
import { detectChain } from "../lib/chains.js";
import type { EducationalResponse } from "../util/response.js";

export const inputSchema = z.object({
  neighborhood: z
    .string({
      required_error:
        "neighborhood is required. Use a city, neighborhood, or 'lat,lng'. Examples: 'East Nashville, TN', 'Mission, San Francisco', '35.9940,-78.8986'.",
    })
    .min(2),
  radius_km: z.number().positive().max(20).optional(),
  categories: z
    .array(z.enum(["restaurant", "coffee", "grocery", "hardware", "bookstore", "bakery"]))
    .optional(),
  sample_size: z.number().int().positive().max(20).optional(),
});

export type Input = z.infer<typeof inputSchema>;

const DEFAULT_CATEGORIES: Array<{ key: string; query: string }> = [
  { key: "restaurant", query: "restaurant" },
  { key: "coffee", query: "coffee shop" },
  { key: "grocery", query: "grocery store" },
  { key: "hardware", query: "hardware store" },
  { key: "bookstore", query: "bookstore" },
  { key: "bakery", query: "bakery" },
];

interface CategoryStat {
  category: string;
  sampled: number;
  independents: number;
  chains: number;
  tier_distribution: Record<Tier, number>;
  independence_rate: number;
  top_independents: Array<{ place_id: string; name: string; total_score: number; tier: Tier }>;
}

export interface Answer {
  neighborhood: string;
  radius_km: number;
  overall_independence_rate: number;
  overall_local_index: number;
  interpretation: string;
  category_stats: CategoryStat[];
}

function parseLatLng(near: string): { lat: number; lng: number } | null {
  const m = near.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}

function emptyDist(): Record<Tier, number> {
  return { tier_1: 0, tier_2: 0, tier_3: 0, tier_4: 0 };
}

function interpret(localIndex: number): string {
  if (localIndex >= 70) {
    return "Strong independent character. This neighborhood is genuinely full of independents; the algorithm's defaults will surface them in normal searches.";
  }
  if (localIndex >= 50) {
    return "Mixed but independent-leaning. Independents exist in most categories but compete against chain presence; LocalRoots-style scoring helps surface them.";
  }
  if (localIndex >= 30) {
    return "Chain-dominant with independent pockets. Most categories have national-chain saturation; the independents that exist tend to be missed by default search.";
  }
  return "Chain-saturated. Few independents exist in the sampled categories. Widening the radius or sampling a nearby neighborhood often yields more options.";
}

export async function neighborhoodLocalIndex(input: Input): Promise<EducationalResponse<Answer>> {
  const radiusKm = input.radius_km ?? 3;
  const sampleSize = input.sample_size ?? 10;
  const requested = input.categories ?? DEFAULT_CATEGORIES.map((c) => c.key);
  const cats = DEFAULT_CATEGORIES.filter((c) => requested.includes(c.key));
  const latLng = parseLatLng(input.neighborhood);

  const stats: CategoryStat[] = [];
  for (const cat of cats) {
    const places = await searchText({
      query: latLng ? cat.query : `${cat.query} near ${input.neighborhood}`,
      latitude: latLng?.lat,
      longitude: latLng?.lng,
      radius_meters: Math.round(radiusKm * 1000),
      max_results: sampleSize,
    });
    const stat: CategoryStat = {
      category: cat.key,
      sampled: places.length,
      independents: 0,
      chains: 0,
      tier_distribution: emptyDist(),
      independence_rate: 0,
      top_independents: [],
    };
    const scored = places.map((p: Place) => {
      const chain = detectChain(p.display_name);
      const breakdown = score({
        name: p.display_name,
        google_place_types: p.types,
        user_rating_count: p.user_rating_count,
        rating: p.rating,
        photo_count: p.photo_count,
        website_uri: p.website_uri,
        editorial_summary: p.editorial_summary,
        formatted_address: p.formatted_address,
        has_chain_in_name: chain.matched,
      });
      return { place: p, breakdown };
    });
    for (const r of scored) {
      stat.tier_distribution[r.breakdown.tier] += 1;
      if (r.breakdown.disqualified) stat.chains += 1;
      else stat.independents += 1;
    }
    stat.independence_rate = stat.sampled === 0 ? 0 : stat.independents / stat.sampled;
    stat.top_independents = scored
      .filter((r) => !r.breakdown.disqualified)
      .sort((a, b) => b.breakdown.total_score - a.breakdown.total_score)
      .slice(0, 3)
      .map((r) => ({
        place_id: r.place.place_id,
        name: r.place.display_name,
        total_score: r.breakdown.total_score,
        tier: r.breakdown.tier,
      }));
    stats.push(stat);
  }

  const totalSampled = stats.reduce((a, s) => a + s.sampled, 0);
  const totalIndependents = stats.reduce((a, s) => a + s.independents, 0);
  const overallIndependenceRate = totalSampled === 0 ? 0 : totalIndependents / totalSampled;

  const weightedScore = stats.reduce((acc, s) => {
    const tier1Weight = s.tier_distribution.tier_1 * 100;
    const tier2Weight = s.tier_distribution.tier_2 * 65;
    const tier3Weight = s.tier_distribution.tier_3 * 30;
    const slice = s.sampled === 0 ? 0 : (tier1Weight + tier2Weight + tier3Weight) / s.sampled;
    return acc + slice;
  }, 0);
  const overallLocalIndex = stats.length === 0 ? 0 : Math.round(weightedScore / stats.length);

  return {
    answer: {
      neighborhood: input.neighborhood,
      radius_km: radiusKm,
      overall_independence_rate: Number(overallIndependenceRate.toFixed(2)),
      overall_local_index: overallLocalIndex,
      interpretation: interpret(overallLocalIndex),
      category_stats: stats,
    },
    citations: [
      "Google Places API (New): https://developers.google.com/maps/documentation/places/web-service/overview",
      "LocalRoots scoring framework: see src/lib/scoring.ts. The Local Index is a per-category-averaged, tier-weighted aggregate of business scores.",
      "Bundled chain database: data/chain-database.json",
    ],
    practical_note:
      "The Local Index is best read as a relative measure. Compare two neighborhoods side by side rather than treating any single number as authoritative. The per-category breakdown is where the real signal lives: a neighborhood can be chain-dominant for restaurants and strongly independent for hardware, and that nuance is the point.",
    follow_up_questions: [
      "Want to compare this neighborhood to another?",
      "Should I pull the top independents in a specific category for a closer look?",
    ],
  };
}
