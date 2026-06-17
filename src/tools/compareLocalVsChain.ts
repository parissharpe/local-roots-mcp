import { z } from "zod";
import { searchText, type Place } from "../lib/google-places.js";
import { score, type BusinessSignals, type ScoreBreakdown, type Tier } from "../lib/scoring.js";
import { detectChain } from "../lib/chains.js";
import { checkWaybackTenure } from "../lib/wayback.js";
import type { EducationalResponse } from "../util/response.js";

export const inputSchema = z.object({
  independent_name: z.string().min(2, "independent_name must be at least 2 characters"),
  chain_name: z.string().min(2, "chain_name must be at least 2 characters"),
  near: z.string().min(2, "near must be at least 2 characters"),
  category: z.enum(["farm", "restaurant", "retail", "service", "other"]).optional(),
});

export type Input = z.infer<typeof inputSchema>;

interface ScoredBusiness {
  place_id: string;
  name: string;
  formatted_address?: string;
  website_uri?: string;
  national_phone_number?: string;
  rating?: number;
  user_rating_count?: number;
  wayback_earliest_year?: number | null;
  tier: Tier;
  total_score: number;
  signal_breakdown: ScoreBreakdown;
}

export interface Answer {
  independent: ScoredBusiness;
  chain: ScoredBusiness;
  score_delta: number;
  verdict: string;
}

async function resolveTopResult(name: string, near: string): Promise<Place> {
  const results = await searchText({ query: `${name} near ${near}`, max_results: 1 });
  if (results.length === 0) {
    throw new Error(
      `Could not find "${name}" near "${near}" via Google Places. Try a more specific name, or include the city and state.`,
    );
  }
  return results[0];
}

function scoreBusiness(
  place: Place,
  categoryHint?: BusinessSignals["category_hint"],
  waybackYear?: number | null,
): ScoredBusiness {
  const chain = detectChain(place.display_name);
  const signals: BusinessSignals = {
    name: place.display_name,
    category_hint: categoryHint,
    google_place_types: place.types,
    user_rating_count: place.user_rating_count,
    rating: place.rating,
    photo_count: place.photo_count,
    website_uri: place.website_uri,
    editorial_summary: place.editorial_summary,
    formatted_address: place.formatted_address,
    has_chain_in_name: chain.matched,
    wayback_earliest_year: waybackYear,
  };
  const breakdown = score(signals);
  return {
    place_id: place.place_id,
    name: place.display_name,
    formatted_address: place.formatted_address,
    website_uri: place.website_uri,
    national_phone_number: place.national_phone_number,
    rating: place.rating,
    user_rating_count: place.user_rating_count,
    wayback_earliest_year: waybackYear,
    tier: breakdown.tier,
    total_score: breakdown.total_score,
    signal_breakdown: breakdown,
  };
}

function buildVerdict(independent: ScoredBusiness, chain: ScoredBusiness, delta: number): string {
  const topSignals = [...independent.signal_breakdown.universal, ...independent.signal_breakdown.category_bonuses]
    .sort((a, b) => b.points - a.points)
    .slice(0, 2)
    .map((s) => `${s.signal} (+${s.points})`)
    .join(", ") || "no positive signals above baseline";

  const chainDesc = chain.signal_breakdown.disqualified
    ? `${chain.name} is disqualified as a national chain (tier_4, score: ${chain.total_score})`
    : `${chain.name} scores ${chain.total_score} points (${chain.tier})`;

  const higherChainWarning =
    !chain.signal_breakdown.disqualified && chain.total_score > independent.total_score
      ? ` WARNING: the chain scored higher than the independent. This may mean "${chain.name}" is a regional operator not in the chain database, or "${independent.name}" has an unusually thin Google profile. Use score_specific_business with the place_id to investigate.`
      : "";

  const waybackNote =
    independent.wayback_earliest_year !== undefined && independent.wayback_earliest_year !== null
      ? ` Wayback Machine shows a web presence as early as ${independent.wayback_earliest_year}.`
      : "";

  return (
    `${independent.name} scores ${independent.total_score} points (${independent.tier}); ` +
    `${chainDesc}. Score delta: ${delta >= 0 ? "+" : ""}${delta} in the independent's favor. ` +
    `Top independent signals: ${topSignals}.${waybackNote}${higherChainWarning}`
  );
}

export async function compareLocalVsChain(input: Input): Promise<EducationalResponse<Answer>> {
  // Sequential resolution so error messages name the business that failed
  const indepPlace = await resolveTopResult(input.independent_name, input.near);
  const chainPlace = await resolveTopResult(input.chain_name, input.near);

  // Check Wayback for independent only; chain is disqualified before signals run
  const waybackYear = indepPlace.website_uri
    ? await checkWaybackTenure(indepPlace.website_uri)
    : undefined;

  const independent = scoreBusiness(indepPlace, input.category, waybackYear);
  const chain = scoreBusiness(chainPlace, input.category);
  const delta = independent.total_score - chain.total_score;
  const verdict = buildVerdict(independent, chain, delta);

  return {
    answer: { independent, chain, score_delta: delta, verdict },
    citations: [
      "Google Places API (New): https://developers.google.com/maps/documentation/places/web-service/overview",
      "LocalRoots scoring framework: see src/lib/scoring.ts. Both businesses are scored on identical criteria; the delta quantifies how far apart they are on the independence scale.",
      "Bundled chain database: data/chain-database.json. National chains are disqualified at -100 points regardless of other signals.",
      "Wayback Machine CDX API: https://web.archive.org/cdx/search. Used to infer website age from the earliest archived snapshot.",
    ],
    practical_note: verdict,
    follow_up_questions: [
      `Pass the place_id "${indepPlace.place_id}" to score_specific_business for a Place Details enrichment.`,
      "Use discover_local_independents in the same area to find other independent alternatives.",
    ],
  };
}
