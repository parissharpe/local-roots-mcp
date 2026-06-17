import { detectChain } from "./chains.js";
import { detectEcommercePlatforms } from "./ecommerce.js";
import { lookupCenturyFarm } from "./century-farms.js";

/**
 * BusinessSignals is the normalized input to the scoring engine. Every tool
 * builds one of these from its data source (Google Places result, manual
 * input, etc.) and passes it in. Centralizing the signal contract is what
 * lets the scoring breakdown be consistent across tools.
 */
export interface BusinessSignals {
  name: string;
  category_hint?: "farm" | "restaurant" | "retail" | "service" | "other";
  google_place_types?: string[];
  user_rating_count?: number;
  rating?: number;
  photo_count?: number;
  website_uri?: string | null;
  editorial_summary?: string | null;
  county?: string;
  formatted_address?: string;
  has_chain_in_name?: boolean;
}

export type Tier = "tier_1" | "tier_2" | "tier_3" | "tier_4";

export interface SignalLine {
  signal: string;
  points: number;
  why: string;
}

export interface ScoreBreakdown {
  total_score: number;
  tier: Tier;
  tier_label: string;
  disqualified: boolean;
  disqualification_reason?: string;
  universal: SignalLine[];
  category_bonuses: SignalLine[];
  negatives: SignalLine[];
}

const TIER_LABELS: Record<Tier, string> = {
  tier_1: "Tier 1: confirmed deeply local independent",
  tier_2: "Tier 2: likely local independent",
  tier_3: "Tier 3: ambiguous, could be small chain or franchise",
  tier_4: "Tier 4: national chain or chain-equivalent, disqualified",
};

/**
 * Tier thresholds. A business is assigned the highest tier whose minimum it
 * meets. Tier 4 is a hard disqualification path (chain detected), not a
 * threshold.
 */
const TIER_MIN: Record<Exclude<Tier, "tier_4">, number> = {
  tier_1: 70,
  tier_2: 18,
  tier_3: 10,
};

export function score(signals: BusinessSignals): ScoreBreakdown {
  const universal: SignalLine[] = [];
  const categoryBonuses: SignalLine[] = [];
  const negatives: SignalLine[] = [];

  // ---------------- Disqualification: national chain ----------------
  const chain = detectChain(signals.name);
  if (chain.matched && chain.chain) {
    negatives.push({
      signal: "national_chain_detected",
      points: -100,
      why: `Business name matches the bundled chain database entry "${chain.chain.name}". National chains are disqualified by design; the algorithm already surfaces them.`,
    });
    return {
      total_score: -100,
      tier: "tier_4",
      tier_label: TIER_LABELS.tier_4,
      disqualified: true,
      disqualification_reason: `Matched national chain: ${chain.chain.name}`,
      universal,
      category_bonuses: categoryBonuses,
      negatives,
    };
  }

  // ---------------- Universal positive signals ----------------
  universal.push(...tenureSignals(signals));
  universal.push(...familyOwnershipSignals(signals));
  universal.push(...lowMarketingFootprintSignals(signals));
  universal.push(...singleLocationSignal(signals));

  // ---------------- Universal negative signals ----------------
  negatives.push(...algorithmicWinnerSignals(signals));

  // ---------------- Category-specific bonuses ----------------
  const category = inferCategory(signals);
  if (category === "farm") {
    categoryBonuses.push(...farmCategoryBonuses(signals));
  }
  if (category === "restaurant") {
    categoryBonuses.push(...restaurantCategoryBonuses(signals));
  }
  if (category === "retail") {
    categoryBonuses.push(...retailCategoryBonuses(signals));
  }

  const total = sumPoints(universal) + sumPoints(categoryBonuses) + sumPoints(negatives);
  const tier = tierFor(total);
  return {
    total_score: total,
    tier,
    tier_label: TIER_LABELS[tier],
    disqualified: false,
    universal,
    category_bonuses: categoryBonuses,
    negatives,
  };
}

function tierFor(score: number): Tier {
  if (score >= TIER_MIN.tier_1) return "tier_1";
  if (score >= TIER_MIN.tier_2) return "tier_2";
  if (score >= TIER_MIN.tier_3) return "tier_3";
  return "tier_3";
}

function sumPoints(lines: SignalLine[]): number {
  return lines.reduce((acc, line) => acc + line.points, 0);
}

// ---------------- Signal detectors ----------------

const ESTABLISHED_RE = /\b(est(?:ablished|\.|d)?|since|founded(?: in)?)\s+(\d{4})\b/i;

function tenureSignals(s: BusinessSignals): SignalLine[] {
  const out: SignalLine[] = [];
  const haystack = `${s.name} ${s.editorial_summary ?? ""}`;
  const m = haystack.match(ESTABLISHED_RE);
  if (m) {
    const year = parseInt(m[2], 10);
    const ageYears = new Date().getUTCFullYear() - year;
    if (ageYears >= 100) {
      out.push({
        signal: "century_plus_in_text",
        points: 35,
        why: `Established ${year} (${ageYears}+ years). Survival past a century in a category dominated by chains is the strongest tenure signal LocalRoots tracks.`,
      });
    } else if (ageYears >= 50) {
      out.push({
        signal: "half_century_in_text",
        points: 25,
        why: `Established ${year} (${ageYears} years). Multi-generational tenure rare in chain-heavy categories.`,
      });
    } else if (ageYears >= 25) {
      out.push({
        signal: "established_25_plus",
        points: 15,
        why: `Established ${year} (${ageYears} years). Predates most algorithmic discovery, suggests organic local trust.`,
      });
    } else if (ageYears >= 10) {
      out.push({
        signal: "established_10_plus",
        points: 8,
        why: `Established ${year} (${ageYears} years). Past the 5-year small business survival cliff.`,
      });
    }
  }
  return out;
}

const FAMILY_NAME_HINTS = [
  /&\s*sons?\b/i,
  /&\s*daughters?\b/i,
  /\bbrothers?\b/i,
  /\bsisters?\b/i,
  /\b(family|familia)\b/i,
  /'s\s+(farm|orchard|kitchen|bakery|deli|market|grocery|hardware|nursery)\b/i,
];

function familyOwnershipSignals(s: BusinessSignals): SignalLine[] {
  const out: SignalLine[] = [];
  for (const re of FAMILY_NAME_HINTS) {
    if (re.test(s.name)) {
      out.push({
        signal: "family_ownership_in_name",
        points: 10,
        why: `Name pattern "${re.source}" suggests family ownership, a strong predictor of single-location independent operation.`,
      });
      return out;
    }
  }
  if (s.editorial_summary && /\b(family[-\s]?owned|family[-\s]?run|third[-\s]?generation|fourth[-\s]?generation)\b/i.test(s.editorial_summary)) {
    out.push({
      signal: "family_ownership_in_editorial",
      points: 8,
      why: "Editorial summary explicitly notes family ownership or multi-generational operation.",
    });
  }
  return out;
}

function lowMarketingFootprintSignals(s: BusinessSignals): SignalLine[] {
  const out: SignalLine[] = [];
  const reviews = s.user_rating_count ?? 0;
  const photos = s.photo_count ?? 0;
  if (reviews > 0 && reviews < 50) {
    out.push({
      signal: "low_review_count",
      points: 15,
      why: `${reviews} reviews. The algorithm rewards review velocity; a low count usually means the business has not optimized for discovery.`,
    });
  } else if (reviews >= 50 && reviews < 200) {
    out.push({
      signal: "modest_review_count",
      points: 8,
      why: `${reviews} reviews. Present in the local consciousness but not algorithmically dominant.`,
    });
  }
  if (photos > 0 && photos < 10) {
    out.push({
      signal: "sparse_photo_presence",
      points: 5,
      why: `${photos} photos uploaded. Sparse photo footprint correlates with operator-run, not marketing-team-run.`,
    });
  }
  if (!s.website_uri) {
    out.push({
      signal: "no_website",
      points: 5,
      why: "No website on file. Strong indicator of single-location, word-of-mouth-driven operation.",
    });
  }
  if (!s.website_uri && !s.editorial_summary && (s.photo_count ?? 0) < 3) {
    out.push({
      signal: "low_digital_footprint",
      points: 12,
      why: "Website, editorial summary, and photo presence are all minimal. Chains and franchises maintain robust Google profiles; this combination strongly correlates with single-location, operator-run businesses.",
    });
  }
  return out;
}

function singleLocationSignal(s: BusinessSignals): SignalLine[] {
  if (s.has_chain_in_name === true) return [];
  return [
    {
      signal: "no_chain_signal",
      points: 10,
      why: "No national-chain name match. Combined with other signals, this is the baseline assumption of independence.",
    },
  ];
}

function algorithmicWinnerSignals(s: BusinessSignals): SignalLine[] {
  const out: SignalLine[] = [];
  const reviews = s.user_rating_count ?? 0;
  if (reviews >= 2000) {
    out.push({
      signal: "algorithmic_winner",
      points: -20,
      why: `${reviews} reviews. Algorithm-optimized presence; even if independent, this business is not the discovery problem LocalRoots is trying to solve.`,
    });
  } else if (reviews >= 800) {
    out.push({
      signal: "algorithmic_well_known",
      points: -10,
      why: `${reviews} reviews. Already well-surfaced by standard local search.`,
    });
  }
  return out;
}

function inferCategory(s: BusinessSignals): "farm" | "restaurant" | "retail" | "service" | "other" {
  if (s.category_hint) return s.category_hint;
  const types = s.google_place_types ?? [];
  const name = s.name.toLowerCase();
  if (
    types.some((t) => ["farm", "produce_wholesaler", "produce_market"].includes(t)) ||
    /\b(farm|orchard|ranch|vineyard|dairy|creamery|apiary|homestead|csa)\b/.test(name)
  ) {
    return "farm";
  }
  if (
    types.some((t) =>
      ["restaurant", "cafe", "bar", "bakery", "meal_takeaway", "meal_delivery", "coffee_shop"].includes(t),
    )
  ) {
    return "restaurant";
  }
  if (
    types.some((t) =>
      [
        "store",
        "grocery_store",
        "supermarket",
        "hardware_store",
        "book_store",
        "clothing_store",
      ].includes(t),
    )
  ) {
    return "retail";
  }
  return "other";
}

function farmCategoryBonuses(s: BusinessSignals): SignalLine[] {
  const out: SignalLine[] = [];
  const ecommerce = detectEcommercePlatforms(s.website_uri ?? null);
  if (ecommerce.has_online_store) {
    for (const m of ecommerce.matched_platforms) {
      out.push({
        signal: `ecommerce_platform:${m.platform_name}`,
        points: m.signal_strength === "high" ? 25 : 15,
        why: `Direct-to-consumer e-commerce on ${m.platform_name} (${m.platform_url}). A farm running its own DTC channel routes revenue around aggregators.`,
      });
    }
  }
  const century = lookupCenturyFarm(s.name, s.county);
  if (century.matched && century.entry) {
    out.push({
      signal: "nc_century_farm",
      points: 30,
      why: `Listed in the NC Century Farm registry (family: ${century.entry.family_surname}, county: ${century.entry.county}). 100+ years continuous family ownership of working farmland.`,
    });
  } else if (century.registry_size === 0 && (s.formatted_address ?? "").toLowerCase().includes("nc")) {
    out.push({
      signal: "century_farm_registry_pending",
      points: 0,
      why: "NC Century Farm registry is bundled but empty in v0.1. Population is tracked in CONTRIBUTING.md. This signal is not reducing the score; it is here so you can see the bonus is held in reserve.",
    });
  }
  return out;
}

function restaurantCategoryBonuses(s: BusinessSignals): SignalLine[] {
  const out: SignalLine[] = [];
  const editorial = (s.editorial_summary ?? "").toLowerCase();
  if (/\b(scratch|from[-\s]scratch|in[-\s]house|house[-\s]made|chef[-\s]owned|chef[-\s]driven)\b/.test(editorial)) {
    out.push({
      signal: "independent_kitchen_signal",
      points: 12,
      why: "Editorial summary references scratch cooking or chef ownership, signals of operator-run kitchen rather than franchise commissary.",
    });
  }
  return out;
}

function retailCategoryBonuses(s: BusinessSignals): SignalLine[] {
  const out: SignalLine[] = [];
  const editorial = (s.editorial_summary ?? "").toLowerCase();
  if (/\b(family[-\s]owned|locally[-\s]owned|independent|since\s+\d{4})\b/.test(editorial)) {
    out.push({
      signal: "independent_retail_signal",
      points: 10,
      why: "Editorial summary explicitly identifies the shop as locally owned or long-established.",
    });
  }
  return out;
}
