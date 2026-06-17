import { z } from "zod";
import { searchText, type Place } from "../lib/google-places.js";
import { score, type ScoreBreakdown, type Tier } from "../lib/scoring.js";
import { detectChain } from "../lib/chains.js";
import { detectEcommercePlatforms, listKnownPlatforms } from "../lib/ecommerce.js";
import type { EducationalResponse } from "../util/response.js";

export const inputSchema = z.object({
  near: z
    .string({
      required_error:
        "near is required. Use a city, region, or 'lat,lng'. Example: 'Asheville, NC', 'Hudson Valley, NY', '36.0726,-79.7920'.",
    })
    .min(2),
  radius_km: z.number().positive().max(200).optional(),
  max_results: z.number().int().positive().max(20).optional(),
  product_focus: z
    .enum(["any", "meat", "produce", "dairy", "csa", "eggs", "flowers"])
    .default("any"),
});

export type Input = z.infer<typeof inputSchema>;

interface FarmResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  latitude?: number;
  longitude?: number;
  website_uri?: string;
  national_phone_number?: string;
  has_online_store: boolean;
  online_store_platforms: Array<{ platform_name: string; platform_url: string }>;
  tier: Tier;
  total_score: number;
  signal_breakdown: ScoreBreakdown;
  practical_note: string;
}

export interface Answer {
  query_used: { near: string; radius_km: number; product_focus: Input["product_focus"] };
  result_count: number;
  results: FarmResult[];
  known_platforms_searched: Array<{ name: string; url: string; signal_strength: string }>;
}

function parseLatLng(near: string): { lat: number; lng: number } | null {
  const m = near.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}

function farmQueryFor(focus: Input["product_focus"]): string {
  switch (focus) {
    case "meat":
      return "pasture raised meat farm";
    case "produce":
      return "vegetable farm produce";
    case "dairy":
      return "dairy farm creamery";
    case "csa":
      return "CSA farm community supported agriculture";
    case "eggs":
      return "pasture raised eggs farm";
    case "flowers":
      return "flower farm";
    case "any":
    default:
      return "farm";
  }
}

function noteFor(farm: { has_online_store: boolean; signal_breakdown: ScoreBreakdown; website_uri?: string }): string {
  if (farm.has_online_store) {
    const platforms = farm.signal_breakdown.category_bonuses
      .filter((s) => s.signal.startsWith("ecommerce_platform:"))
      .map((s) => s.signal.replace("ecommerce_platform:", ""));
    return `Direct-to-consumer e-commerce confirmed on ${platforms.join(", ")}. Buying from this farm routes revenue around aggregators. Open ${farm.website_uri} to see what is in stock.`;
  }
  if (farm.website_uri) {
    return `Website on file but no recognized DTC platform fingerprint. The farm may run its own checkout (Shopify, Square Online, custom) or may sell only at markets and pickup. Open ${farm.website_uri} and look for a "Shop" or "Order" link.`;
  }
  return "No website on file. Likely a market-and-pickup operation. Use score_specific_business with the place_id or call them directly to learn their sales channels.";
}

export async function findFarmsWithOnlineStore(input: Input): Promise<EducationalResponse<Answer>> {
  const radiusKm = input.radius_km ?? 80;
  const maxResults = input.max_results ?? 10;
  const latLng = parseLatLng(input.near);
  const baseQuery = farmQueryFor(input.product_focus);

  const places = await searchText({
    query: latLng ? baseQuery : `${baseQuery} near ${input.near}`,
    latitude: latLng?.lat,
    longitude: latLng?.lng,
    radius_meters: Math.round(radiusKm * 1000),
    max_results: 20,
  });

  const enriched: FarmResult[] = places.map((p: Place) => {
    const chain = detectChain(p.display_name);
    const breakdown = score({
      name: p.display_name,
      category_hint: "farm",
      google_place_types: p.types,
      user_rating_count: p.user_rating_count,
      rating: p.rating,
      photo_count: p.photo_count,
      website_uri: p.website_uri,
      editorial_summary: p.editorial_summary,
      formatted_address: p.formatted_address,
      has_chain_in_name: chain.matched,
    });
    const ecommerce = detectEcommercePlatforms(p.website_uri ?? null);
    const result: FarmResult = {
      place_id: p.place_id,
      name: p.display_name,
      formatted_address: p.formatted_address,
      latitude: p.latitude,
      longitude: p.longitude,
      website_uri: p.website_uri,
      national_phone_number: p.national_phone_number,
      has_online_store: ecommerce.has_online_store,
      online_store_platforms: ecommerce.matched_platforms.map((m) => ({
        platform_name: m.platform_name,
        platform_url: m.platform_url,
      })),
      tier: breakdown.tier,
      total_score: breakdown.total_score,
      signal_breakdown: breakdown,
      practical_note: "",
    };
    result.practical_note = noteFor({
      has_online_store: result.has_online_store,
      signal_breakdown: breakdown,
      website_uri: p.website_uri,
    });
    return result;
  });

  const withStore = enriched.filter((r) => r.has_online_store && !r.signal_breakdown.disqualified);
  const withoutStore = enriched.filter((r) => !r.has_online_store && !r.signal_breakdown.disqualified);
  const ranked = [
    ...withStore.sort((a, b) => b.total_score - a.total_score),
    ...withoutStore.sort((a, b) => b.total_score - a.total_score),
  ].slice(0, maxResults);

  return {
    answer: {
      query_used: { near: input.near, radius_km: radiusKm, product_focus: input.product_focus },
      result_count: ranked.length,
      results: ranked,
      known_platforms_searched: listKnownPlatforms().map((p) => ({
        name: p.name,
        url: p.url,
        signal_strength: p.signal_strength,
      })),
    },
    citations: [
      "Google Places API (New): https://developers.google.com/maps/documentation/places/web-service/overview",
      "Bundled DTC farm e-commerce platform fingerprints: data/ecommerce-platforms.json. The seven platforms in the index are the dominant farm-first checkout systems in the U.S.",
      "LocalRoots scoring framework: see src/lib/scoring.ts.",
    ],
    practical_note:
      ranked.length === 0
        ? "No farms surfaced in this search. Widen radius_km, broaden product_focus to 'any', or check whether the region uses different naming (e.g., 'orchard' vs 'farm')."
        : "Results with confirmed direct-to-consumer e-commerce are ranked first. Open each result's signal_breakdown to see why it scored where it did, and use the website_uri or place_id to dig further.",
    follow_up_questions: [
      "Want a deeper look at a specific farm with score_specific_business?",
      "Should I check a wider radius or a different product focus?",
    ],
  };
}
