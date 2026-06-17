# LocalRoots MCP

> The independent local businesses the algorithm buries.

Most local-search platforms rank by review volume and star rating. That math optimizes for businesses that already won the visibility game: chains with marketing teams, franchises with ad budgets, and the handful of independents that figured out review velocity. The businesses you actually want to find, the third-generation hardware store, the farm with a direct-to-consumer storefront, the diner that has been on the same corner since 1962, fall to page 4 because they never optimized for the algorithm.

LocalRoots inverts the scoring. It rewards long tenure, low marketing footprint, family ownership name signals, single-location operation, and category-specific markers like e-commerce platform fingerprints for direct-to-consumer farms. It disqualifies national chains. The result is a discovery layer that surfaces what mainstream local search hides.

This is also a counterculture move. The same algorithmic-intermediary dynamic that disadvantages small operators in commerce is the same one that disadvantages property owners in airspace, inventors in patent prosecution, and ordinary people in nearly every system where intermediary access decides who gets seen. LocalRoots applies that thesis to local commerce.

## What this does

LocalRoots gives Claude five tools that wrap the Google Places API with an opinionated independence-scoring engine. Every result includes the tier (tier_1 = strong independent, tier_4 = chain), the total score, the signal breakdown that produced the score, and a plain-language practical_note so the user can see why a business ranked where it did.

Some things you can ask Claude when this MCP is connected:

- "Find an independent coffee shop near Durham, NC."
- "Is Maria's Bakery on Main Street actually independent?"
- "Is Finca Coffee more independent than the Starbucks next door?"
- "Find farms near the Hudson Valley that have a direct-to-consumer online store."
- "How independent-business-heavy is East Nashville compared to Brentwood?"

The scoring breakdown is the differentiator. A user who reads it walks away understanding which signals matter for telling a real independent from a regional chain.

## What this tool covers

**In scope for v0.1:**

- `discover_local_independents`: text + location search, scored by LocalRoots' independence framework, chains filtered by default.
- `score_specific_business`: deep-dive a single business by place_id or by name + near.
- `find_farms_with_online_store`: farm search with direct-to-consumer e-commerce platform fingerprinting (GrazeCart, Local Line, Barn2Door, Harvie, Farmigo, GrownBy, LocalHarvest).
- `neighborhood_local_index`: aggregate independence score for a neighborhood across six sample categories.

**Out of scope for v0.1:**

- `compare_local_vs_chain`: deferred to v0.3 per roadmap (shipped in v0.3).
- Wayback Machine integration for inferred founding date (shipped in v0.3).
- Live page fetching to detect generic Shopify / Square Online storefronts that are not on the bundled farm-first platform list.
- Non-NC Century Farm registries (only NC is tracked in the v0.1 placeholder).

**Shipped in v0.2:**

- Place Details enrichment for `discover_local_independents`: each result is re-fetched with a Place Details call to fill in `editorialSummary`, `websiteUri`, and photo count before scoring. This unlocks tenure and family-ownership signals that searchText cannot surface.
- `low_digital_footprint` signal (+12 points): fires when website, editorial summary, and photo count are all absent or minimal after enrichment, a compound marker that correlates strongly with single-location, marketing-free operators.
- Tier threshold recalibration (tier_2: 40 → 25 → 18) based on live API calibration across three cities.

**Shipped in v0.3:**

- `compare_local_vs_chain` tool: scores a local independent head-to-head against a national chain at the same location. Returns a side-by-side signal breakdown, a score delta, and a plain-language verdict. Includes Wayback Machine tenure inference for the independent.
- Wayback Machine CDX tenure inference: checks the Internet Archive for the earliest snapshot of a business website and adds `tenure_wayback_pre_2005` (+20), `tenure_wayback_pre_2010` (+12), or `tenure_wayback_pre_2015` (+6) signals when found. Applied in `discover_local_independents`, `score_specific_business`, and `compare_local_vs_chain`. Free, no API key required.
- NC Century Farm sample data: 15 manually researched farms from NCDA&CS public records bundled as a fallback at `data/century-farms-nc-sample.json`. Schema updated to `{ name, county, city?, since_year, website? }`.

**Coming in v0.4:**

- Population of the full NC Century Farm registry (see CONTRIBUTING.md for the procedure).
- Additional category bonuses for breweries, butchers, and tailors.
- Optional live page fetch when a farm website looks like a generic storefront.

## Who it's for

People who want to spend their money at the operator they will see again, not at a brand. Households trying to move grocery spend from aggregators to farms. Travelers who want to find the real neighborhood spot instead of the algorithm's. Anyone who treats local commerce as something worth defending.

## Quick start

You need a Google Places API key. The API is metered; new Google Cloud accounts include a $300 free trial credit (90-day window), which covers substantial experimentation with this MCP.

1. Create or pick a Google Cloud project at https://console.cloud.google.com.
2. Enable **Places API (New)** in that project. The legacy Places API will not work.
3. Generate an API key and restrict it to Places API (New) only. Consider also adding an IP or HTTP referrer restriction to prevent the key from being used outside your environment.
4. Set `GOOGLE_PLACES_API_KEY` in your MCP server environment.

### Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "local-roots": {
      "command": "npx",
      "args": ["-y", "@parissharpe/local-roots-mcp"],
      "env": {
        "GOOGLE_PLACES_API_KEY": "YOUR_KEY_HERE"
      }
    }
  }
}
```

Restart Claude Desktop. The five tools become available in any conversation.

### Local development

```bash
git clone https://github.com/parissharpe/local-roots-mcp
cd local-roots-mcp
npm install
cp .env.example .env
# put your key in .env
npm run build
npm test
npm run smoke-test
```

## Tools

### `discover_local_independents`

Find independent businesses for a query and location, ranked by LocalRoots' independence score.

Parameters:
- `query` (required): plain English, e.g. `"coffee"`, `"hardware store"`.
- `near` (required): a city, neighborhood, or `"lat,lng"`.
- `radius_km` (optional, default 8, max 50)
- `max_results` (optional, default 10, max 20)
- `min_tier` (optional): `tier_1`, `tier_2`, or `tier_3`.
- `include_chains` (optional, default false): keep chains in the results, mostly for debugging.

Returns each result with `place_id`, `name`, `formatted_address`, `tier`, `total_score`, `signal_breakdown`, and a per-result `practical_note`. Use the `place_id` in `score_specific_business` for follow-up.

### `score_specific_business`

Score a specific business. Either pass `place_id` (fetched from a previous result or from Google Maps), or pass `name` plus `near`. Returns the full signal breakdown and a practical note explaining the tier.

### `find_farms_with_online_store`

Find independent farms within radius of a location and detect direct-to-consumer e-commerce by fingerprinting the farm's website against the bundled platform list. Farms with confirmed DTC are ranked first.

Parameters:
- `near` (required)
- `radius_km` (optional, default 80, max 200)
- `max_results` (optional, default 10, max 20)
- `product_focus` (optional, default `"any"`): one of `meat`, `produce`, `dairy`, `csa`, `eggs`, `flowers`, `any`.

### `neighborhood_local_index`

Sample a neighborhood across multiple categories (restaurant, coffee, grocery, hardware, bookstore, bakery by default), score each sampled business, and aggregate into a single Local Index plus per-category stats.

Parameters:
- `neighborhood` (required)
- `radius_km` (optional, default 3)
- `categories` (optional): subset of the default list.
- `sample_size` (optional, default 10, max 20): per-category cap.

The Local Index is best read relatively. Compare two neighborhoods rather than treating a single number as definitive.

### `compare_local_vs_chain`

Score a local independent directly against a national chain at the same location. Both businesses are resolved via Google Places and run through LocalRoots scoring. Returns a side-by-side breakdown, the score delta, and a plain-language verdict.

Parameters:
- `independent_name` (required): name of the independent business.
- `chain_name` (required): name of the chain to compare against.
- `near` (required): a city, neighborhood, or `"lat,lng"`.
- `category` (optional): one of `farm`, `restaurant`, `retail`, `service`, `other`.

The chain will almost always be disqualified (tier_4, -100 points). A warning fires in the verdict if the chain scores higher than the independent, which usually means the chain name is not in the bundled database or the independent has a very thin Google profile. Checks the Wayback Machine for the independent's website to add tenure signals before 2005, 2010, or 2015.

## API usage

Each tool uses Google Places API (New) calls. The call count matters for billing.

| Tool | Call pattern | Default max calls |
|---|---|---|
| `discover_local_independents` | 1 Text Search + up to 10 Place Details (enrichment) + up to 5 Wayback CDX checks (free) | 11 per query |
| `score_specific_business` | 1 Place Details (if `place_id` given) or 1 Text Search + optional 1 Wayback CDX check (free) | 1-2 per query |
| `find_farms_with_online_store` | 1 Text Search | 1 per query |
| `neighborhood_local_index` | 1 Text Search per category (default 6 categories) | 6 per query |
| `compare_local_vs_chain` | 2 Text Searches + optional 1 Wayback CDX check for the independent (free) | 2 per query |

**Estimated cost per `discover_local_independents` call (default 10 results):**  
1 Text Search (~$0.032) + 10 Place Details (~$0.017 each) = ~$0.20 per call at current Google pricing. See [Google Maps Platform pricing](https://mapsplatform.google.com/pricing/) for current rates; prices change.

New Google Cloud accounts include a $300 free trial credit (90-day window). At ~$0.20 per discovery query, that covers roughly 1,500 calls before billing begins.

To reduce Place Details calls, lower `max_results` (e.g., `max_results: 5` uses 1 Text Search + 5 Place Details = ~$0.12). The enrichment cap is always 10 regardless of `max_results`.

## How the scoring works

Every result carries a `signal_breakdown` with three sections: `universal`, `category_bonuses`, and `negatives`. Each line item shows the signal name, the points, and why those points were assigned. The total is the sum.

**Universal positive signals**

- `century_plus_in_text` (+35): "Established 1899" or similar parsed from the name or editorial summary.
- `half_century_in_text` (+25): "Since 1975" or similar.
- `established_25_plus` (+15) / `established_10_plus` (+8): shorter tenure bands.
- `family_ownership_in_name` (+10): name patterns like `& Sons`, `Family`, `Maria's Bakery`.
- `family_ownership_in_editorial` (+8): explicit "family-owned" / "third-generation" in the editorial summary.
- `low_review_count` (+15) / `modest_review_count` (+8): 0-49 / 50-199 reviews respectively. The algorithm rewards review velocity, so a sparse footprint correlates with operator-run discovery.
- `sparse_photo_presence` (+5): fewer than 10 photos.
- `no_website` (+5): often the strongest single signal that a business is single-location and word-of-mouth-driven.
- `low_digital_footprint` (+12): website, editorial summary, and photo count are all absent or minimal after Place Details enrichment. Chains and franchises maintain robust Google profiles; this combination strongly correlates with single-location, operator-run businesses.
- `no_chain_signal` (+10): no national-chain name match. The baseline assumption of independence.

**Wayback Machine tenure signals** (applied when a website is on file and the Wayback CDX API is reachable; free, no key required)

- `tenure_wayback_pre_2005` (+20): Wayback Machine shows an archived snapshot before 2005. A web presence before social media and review aggregators suggests the business predates the algorithmic-discovery era.
- `tenure_wayback_pre_2010` (+12): earliest snapshot before 2010.
- `tenure_wayback_pre_2015` (+6): earliest snapshot before 2015. A decade-plus web presence predates the mass adoption of business discovery apps.
- `wayback_no_snapshot` (0, informational): CDX confirms no snapshot found. Not scored against the business; surfaced so you can see the check ran.

**Category-specific bonuses**

- Farms: `ecommerce_platform:*` (+25 or +15 depending on platform signal strength) for a confirmed direct-to-consumer storefront on one of the seven bundled platforms; `nc_century_farm` (+30) for a registry match; `century_farm_registry_pending` (+0, NC addresses only) as a placeholder when the registry has not been populated yet.
- Restaurants: `independent_kitchen_signal` (+12) for scratch / from-scratch / chef-owned mentions in the editorial summary.
- Retail: `independent_retail_signal` (+10) for locally-owned / independent mentions in the editorial summary.

**Negative signals**

- `algorithmic_winner` (-20): 2000+ reviews. Even if independent, the business does not need LocalRoots to find it.
- `algorithmic_well_known` (-10): 800-1999 reviews.
- `national_chain_detected` (-100): hard disqualification. The business gets `tier_4` and is filtered from results unless `include_chains: true`.

**Tier thresholds**

- `tier_1` (≥70): strong independent. Requires tenure or compound ownership signals.
- `tier_2` (≥18): likely independent. At minimum: 50-199 reviews and no chain name match.
- `tier_3` (≥10): ambiguous. Insufficient signal to confidently call it independent.
- `tier_4`: chain or chain-equivalent, disqualified.

## Limits, caveats, and known gaps

- **The Google Places editorial summary is not always populated.** When it is missing, tenure and family-ownership detection falls back to the business name alone, which is a weaker signal. Wayback Machine tenure inference partially compensates when a website is on file.
- **Tenure is inferred, not authoritative.** A business that started in 2003 but rebranded with "Since 1924" marketing would score as if it has been there since 1924. The scoring is honest about this: it tells you which year string it parsed.
- **The NC Century Farm registry main file is bundled empty.** A 15-entry sample from NCDA&CS public records is bundled as a fallback so the `nc_century_farm` bonus fires for testing. To get full coverage, populate `data/century-farms-nc.json` per the procedure in CONTRIBUTING.md.
- **The chain database is curated and not exhaustive.** Regional chains are deliberately omitted so that, for example, a regional grocer that still feels local is not disqualified. Use `include_chains: true` to inspect.
- **Generic e-commerce platforms (Shopify, Square Online, custom) are not fingerprinted.** A farm running its own Shopify store will not register a `has_online_store` even though it has one. v0.2 may add a live page fetch fallback.

## License

Apache License 2.0
