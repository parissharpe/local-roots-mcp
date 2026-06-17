/**
 * Thin client over the Google Places API (New). Three responsibilities:
 *   1. Read GOOGLE_PLACES_API_KEY from env, never log it, never include it in
 *      thrown errors.
 *   2. Rate-limit calls to RATE_LIMIT_RPS (default 5) so a noisy tool turn
 *      cannot blow through a user's billing quota.
 *   3. Normalize the upstream JSON into the Place shape the rest of the code
 *      expects, so platform-specific field naming stays in this file.
 */

const PLACES_BASE = "https://places.googleapis.com/v1";

const DEFAULT_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
  "places.userRatingCount",
  "places.rating",
  "places.websiteUri",
  "places.editorialSummary",
  "places.businessStatus",
  "places.priceLevel",
  "places.nationalPhoneNumber",
  "places.photos.name",
].join(",");

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "types",
  "userRatingCount",
  "rating",
  "websiteUri",
  "editorialSummary",
  "businessStatus",
  "priceLevel",
  "nationalPhoneNumber",
  "photos.name",
].join(",");

export interface Place {
  place_id: string;
  display_name: string;
  formatted_address?: string;
  latitude?: number;
  longitude?: number;
  types: string[];
  user_rating_count?: number;
  rating?: number;
  website_uri?: string;
  editorial_summary?: string;
  business_status?: string;
  price_level?: string;
  national_phone_number?: string;
  photo_count: number;
}

export interface SearchTextParams {
  query: string;
  latitude?: number;
  longitude?: number;
  radius_meters?: number;
  max_results?: number;
  included_type?: string;
}

export interface SearchNearbyParams {
  latitude: number;
  longitude: number;
  radius_meters: number;
  included_types: string[];
  max_results?: number;
}

export class GooglePlacesError extends Error {
  status: number;
  hint?: string;
  constructor(status: number, message: string, hint?: string) {
    super(message);
    this.name = "GooglePlacesError";
    this.status = status;
    this.hint = hint;
  }
}

class RateLimiter {
  private queue: Array<() => void> = [];
  private inFlight = 0;
  private lastSlotAt = 0;
  private readonly minIntervalMs: number;

  constructor(rps: number) {
    const safeRps = Math.max(0.5, Math.min(rps, 50));
    this.minIntervalMs = Math.ceil(1000 / safeRps);
  }

  async wait(): Promise<void> {
    return new Promise<void>((resolve) => {
      const run = () => {
        const now = Date.now();
        const since = now - this.lastSlotAt;
        const delay = Math.max(0, this.minIntervalMs - since);
        setTimeout(() => {
          this.lastSlotAt = Date.now();
          this.inFlight += 1;
          resolve();
        }, delay);
      };
      this.queue.push(run);
      this.drain();
    });
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    this.drain();
  }

  private drain(): void {
    if (this.queue.length === 0) return;
    if (this.inFlight >= 1) return;
    const next = this.queue.shift();
    if (next) next();
  }
}

let limiter: RateLimiter | null = null;

function getLimiter(): RateLimiter {
  if (limiter) return limiter;
  const raw = process.env.RATE_LIMIT_RPS;
  const parsed = raw ? Number(raw) : NaN;
  const rps = Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
  limiter = new RateLimiter(rps);
  return limiter;
}

function getApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new GooglePlacesError(
      0,
      "GOOGLE_PLACES_API_KEY is not set.",
      "Add the variable to your MCP server environment. See .env.example for the format. The README has the Google Cloud Console steps for issuing a Places API (New) key.",
    );
  }
  return key.trim();
}

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  userRatingCount?: number;
  rating?: number;
  websiteUri?: string;
  editorialSummary?: { text?: string };
  businessStatus?: string;
  priceLevel?: string;
  nationalPhoneNumber?: string;
  photos?: Array<{ name?: string }>;
}

function normalize(raw: RawPlace): Place {
  return {
    place_id: raw.id ?? "",
    display_name: raw.displayName?.text ?? "",
    formatted_address: raw.formattedAddress,
    latitude: raw.location?.latitude,
    longitude: raw.location?.longitude,
    types: raw.types ?? [],
    user_rating_count: raw.userRatingCount,
    rating: raw.rating,
    website_uri: raw.websiteUri,
    editorial_summary: raw.editorialSummary?.text,
    business_status: raw.businessStatus,
    price_level: raw.priceLevel,
    national_phone_number: raw.nationalPhoneNumber,
    photo_count: raw.photos?.length ?? 0,
  };
}

async function callPlaces(
  pathAndQuery: string,
  init: RequestInit,
  fieldMask: string,
): Promise<unknown> {
  const apiKey = getApiKey();
  const lim = getLimiter();
  await lim.wait();
  try {
    const res = await fetch(`${PLACES_BASE}${pathAndQuery}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      const safe = text.length > 400 ? text.slice(0, 400) + "..." : text;
      throw new GooglePlacesError(
        res.status,
        `Google Places API returned HTTP ${res.status}. Response: ${safe}`,
        res.status === 401 || res.status === 403
          ? "Check that your API key is valid and that 'Places API (New)' is enabled in the same Google Cloud project."
          : res.status === 429
            ? "You hit the Places API rate limit. Lower RATE_LIMIT_RPS or wait a few minutes."
            : undefined,
      );
    }
    return await res.json();
  } finally {
    lim.release();
  }
}

export async function searchText(params: SearchTextParams): Promise<Place[]> {
  const body: Record<string, unknown> = {
    textQuery: params.query,
    maxResultCount: clampResultCount(params.max_results),
  };
  if (params.latitude != null && params.longitude != null) {
    body.locationBias = {
      circle: {
        center: { latitude: params.latitude, longitude: params.longitude },
        radius: params.radius_meters ?? 8000,
      },
    };
  }
  if (params.included_type) {
    body.includedType = params.included_type;
  }
  const json = (await callPlaces(
    `/places:searchText`,
    { method: "POST", body: JSON.stringify(body) },
    DEFAULT_FIELD_MASK,
  )) as { places?: RawPlace[] };
  return (json.places ?? []).map(normalize);
}

export async function searchNearby(params: SearchNearbyParams): Promise<Place[]> {
  const body = {
    includedTypes: params.included_types,
    maxResultCount: clampResultCount(params.max_results),
    locationRestriction: {
      circle: {
        center: { latitude: params.latitude, longitude: params.longitude },
        radius: params.radius_meters,
      },
    },
  };
  const json = (await callPlaces(
    `/places:searchNearby`,
    { method: "POST", body: JSON.stringify(body) },
    DEFAULT_FIELD_MASK,
  )) as { places?: RawPlace[] };
  return (json.places ?? []).map(normalize);
}

export async function getPlaceDetails(placeId: string): Promise<Place> {
  const json = (await callPlaces(
    `/places/${encodeURIComponent(placeId)}`,
    { method: "GET" },
    DETAILS_FIELD_MASK,
  )) as RawPlace;
  return normalize(json);
}

function clampResultCount(n: number | undefined): number {
  if (n == null || !Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(20, Math.floor(n)));
}

export function rateLimiterRpsForTest(): number {
  const raw = process.env.RATE_LIMIT_RPS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}
