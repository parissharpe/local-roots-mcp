import { z } from "zod";
import { searchText, type Place } from "../lib/google-places.js";
import { score, type BusinessSignals, type ScoreBreakdown, type Tier } from "../lib/scoring.js";
import { detectChain } from "../lib/chains.js";
import type { EducationalResponse } from "../util/response.js";

export const inputSchema = z.object({
  query: z
    .string({
      required_error:
        "query is required. Use plain English: 'coffee', 'tacos', 'hardware store', 'bookstore'. LocalRoots will translate that into a Places API text search.",
    })
    .min(2, "query must be at least 2 characters"),
  near: z
    .string({
      required_error:
        "near is required. Use a city name, neighborhood, or 'lat,lng'. Examples: 'Durham, NC', 'Mission District, San Francisco', '35.9940,-78.8986'.",
    })
    .min(2, "near must be at least 2 characters"),
  radius_km: z.number().positive().max(50).optional(),
  max_results: z.number().int().positive().max(20).optional(),
  min_tier: z.enum(["tier_1", "tier_2", "tier_3"]).optional(),
  include_chains: z
    .boolean()
    .default(false)
    .describe(
      "Override the chain filter. Default false: chains are removed. Set true if you want to see them ranked next to independents (rare, mostly for debugging the score).",
    ),
});

export type Input = z.infer<typeof inputSchema>;

interface ScoredPlace {
  place_id: string;
  name: string;
  formatted_address?: string;
  latitude?: number;
  longitude?: number;
  website_uri?: string;
  national_phone_number?: string;
  rating?: number;
  user_rating_count?: number;
  tier: Tier;
  total_score: number;
  signal_breakdown: ScoreBreakdown;
  practical_note: string;
}

export interface Answer {
  query_used: { query: string; near: string; radius_km: number };
  result_count: number;
  results: ScoredPlace[];
}

function parseLatLng(near: string): { lat: number; lng: number } | null {
  const m = near.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function placeToSignals(p: Place): BusinessSignals {
  const chain = detectChain(p.display_name);
  return {
    name: p.display_name,
    google_place_types: p.types,
    user_rating_count: p.user_rating_count,
    rating: p.rating,
    photo_count: p.photo_count,
    website_uri: p.website_uri,
    editorial_summary: p.editorial_summary,
    formatted_address: p.formatted_address,
    has_chain_in_name: chain.matched,
  };
}

function practicalNoteForPlace(b: ScoreBreakdown, p: Place): string {
  if (b.disqualified) {
    return `Disqualified as a national chain. ${b.disqualification_reason ?? ""}`.trim();
  }
  if (b.tier === "tier_1") {
    return `Strong independent signal. The top contributors were: ${topReasons(b, 3)}.`;
  }
  if (b.tier === "tier_2") {
    return `Likely independent. Visible signals: ${topReasons(b, 2)}. If you want to confirm, call the business at ${p.national_phone_number ?? "the number on their site"} and ask how long they have been there and who owns it.`;
  }
  return `Ambiguous. The signals are mixed: ${topReasons(b, 2)}. Use score_specific_business with their address for a closer read, or open the website to verify the operator narrative.`;
}

function topReasons(b: ScoreBreakdown, n: number): string {
  const all = [...b.universal, ...b.category_bonuses].sort((a, c) => c.points - a.points);
  const picked = all.slice(0, n).map((s) => `${s.signal} (+${s.points})`);
  return picked.length > 0 ? picked.join(", ") : "no notable positive signals";
}

export async function discoverLocalIndependents(input: Input): Promise<EducationalResponse<Answer>> {
  const radiusKm = input.radius_km ?? 8;
  const maxResults = input.max_results ?? 10;
  const latLng = parseLatLng(input.near);

  const places = await searchText({
    query: latLng ? input.query : `${input.query} near ${input.near}`,
    latitude: latLng?.lat,
    longitude: latLng?.lng,
    radius_meters: Math.round(radiusKm * 1000),
    max_results: Math.min(20, maxResults * 2),
  });

  const scored: ScoredPlace[] = places
    .map((p) => {
      const breakdown = score(placeToSignals(p));
      return {
        place_id: p.place_id,
        name: p.display_name,
        formatted_address: p.formatted_address,
        latitude: p.latitude,
        longitude: p.longitude,
        website_uri: p.website_uri,
        national_phone_number: p.national_phone_number,
        rating: p.rating,
        user_rating_count: p.user_rating_count,
        tier: breakdown.tier,
        total_score: breakdown.total_score,
        signal_breakdown: breakdown,
        practical_note: practicalNoteForPlace(breakdown, p),
      };
    })
    .filter((r) => (input.include_chains ? true : !r.signal_breakdown.disqualified))
    .filter((r) => {
      if (!input.min_tier) return true;
      const order: Tier[] = ["tier_3", "tier_2", "tier_1"];
      return order.indexOf(r.tier) >= order.indexOf(input.min_tier);
    })
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, maxResults);

  const practical = scored.length === 0
    ? "No qualifying independents in this search. Widen radius_km, soften min_tier, or check whether the category itself is dominated by chains in this area. The /score_specific_business tool is useful when you have a specific candidate in mind."
    : "Results are ranked by score, not by Google's default relevance. Open each result's signal_breakdown to see exactly why it ranked where it did. The place_id can be used in score_specific_business for a deeper look.";

  return {
    answer: {
      query_used: { query: input.query, near: input.near, radius_km: radiusKm },
      result_count: scored.length,
      results: scored,
    },
    citations: [
      "Google Places API (New): https://developers.google.com/maps/documentation/places/web-service/overview",
      "LocalRoots scoring framework: see src/lib/scoring.ts. Universal signals (tenure, family ownership, low marketing footprint, single-location) + category-specific bonuses (farm DTC e-commerce, scratch kitchens, etc.) + chain disqualification.",
      "Bundled chain database: data/chain-database.json",
    ],
    practical_note: practical,
    follow_up_questions: [
      "Want me to deep-dive any specific result with score_specific_business?",
      "Should I widen the radius or soften min_tier if too few results returned?",
    ],
  };
}
