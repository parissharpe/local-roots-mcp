import { z } from "zod";
import { searchText, getPlaceDetails, type Place } from "../lib/google-places.js";
import { score, type ScoreBreakdown } from "../lib/scoring.js";
import { detectChain } from "../lib/chains.js";
import { checkWaybackTenure } from "../lib/wayback.js";
import type { EducationalResponse } from "../util/response.js";

export const inputSchema = z.object({
  place_id: z.string().optional(),
  name: z.string().optional(),
  near: z.string().optional(),
});

export type Input = z.infer<typeof inputSchema>;

function requireResolvableInput(input: Input): void {
  const haveId = Boolean(input.place_id);
  const haveNameAndNear = Boolean(input.name) && Boolean(input.near);
  if (!haveId && !haveNameAndNear) {
    throw new Error(
      "Either place_id is required, or both name and near must be provided. Pass place_id when you have it (from a previous discover_local_independents result), otherwise pass name + near.",
    );
  }
}

export interface Answer {
  place: {
    place_id: string;
    name: string;
    formatted_address?: string;
    latitude?: number;
    longitude?: number;
    types: string[];
    website_uri?: string;
    national_phone_number?: string;
    rating?: number;
    user_rating_count?: number;
    editorial_summary?: string;
    business_status?: string;
    wayback_earliest_year?: number | null;
  };
  tier: ScoreBreakdown["tier"];
  tier_label: string;
  total_score: number;
  signal_breakdown: ScoreBreakdown;
}

async function resolvePlace(input: Input): Promise<Place> {
  if (input.place_id) return await getPlaceDetails(input.place_id);
  const query = `${input.name} ${input.near}`.trim();
  const results = await searchText({ query, max_results: 1 });
  if (results.length === 0) {
    throw new Error(
      `Could not find a Google Places match for "${input.name}" near "${input.near}". Try a more specific name or pass the place_id directly.`,
    );
  }
  return results[0];
}

export async function scoreSpecificBusiness(input: Input): Promise<EducationalResponse<Answer>> {
  requireResolvableInput(input);
  const place = await resolvePlace(input);
  const waybackYear = place.website_uri ? await checkWaybackTenure(place.website_uri) : undefined;
  const chain = detectChain(place.display_name);
  const breakdown = score({
    name: place.display_name,
    google_place_types: place.types,
    user_rating_count: place.user_rating_count,
    rating: place.rating,
    photo_count: place.photo_count,
    website_uri: place.website_uri,
    editorial_summary: place.editorial_summary,
    formatted_address: place.formatted_address,
    has_chain_in_name: chain.matched,
    wayback_earliest_year: waybackYear,
  });

  const practical = breakdown.disqualified
    ? `This business hit the chain disqualification path. LocalRoots removes chains from independent-discovery results because the standard algorithm already surfaces them.`
    : breakdown.tier === "tier_1"
      ? `This business scores in the strongest band. The biggest positive contributor was "${(breakdown.universal[0] ?? breakdown.category_bonuses[0])?.signal ?? "no signal"}". If this is a farm and the address is in NC, watch for the Century Farm registry to populate (see CONTRIBUTING.md).`
      : breakdown.tier === "tier_2"
        ? `This business looks independent but lacks the long-tenure or family-ownership markers that push something into Tier 1. Call and ask, "how long have you been here, and is it family-owned?" A direct answer often raises the score by 25-40 points.`
        : `The score is ambiguous. Either signals are missing from Google's profile or the business looks like a small regional chain. Open the website and look for "About" or "Our Story". A "since 19XX" mention pushes the score immediately.`;

  return {
    answer: {
      place: {
        place_id: place.place_id,
        name: place.display_name,
        formatted_address: place.formatted_address,
        latitude: place.latitude,
        longitude: place.longitude,
        types: place.types,
        website_uri: place.website_uri,
        national_phone_number: place.national_phone_number,
        rating: place.rating,
        user_rating_count: place.user_rating_count,
        editorial_summary: place.editorial_summary,
        business_status: place.business_status,
        wayback_earliest_year: waybackYear,
      },
      tier: breakdown.tier,
      tier_label: breakdown.tier_label,
      total_score: breakdown.total_score,
      signal_breakdown: breakdown,
    },
    citations: [
      "Google Places API (New) Place Details: https://developers.google.com/maps/documentation/places/web-service/place-details",
      "LocalRoots scoring framework: see src/lib/scoring.ts. The breakdown above shows the exact signals and points that produced this tier.",
    ],
    practical_note: practical,
  };
}
