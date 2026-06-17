# LocalRoots Scoring Calibration Notes

## v0.2.0 calibration — 2026-06-17

### Context

These calibration runs were used to tune the v0.2 tier thresholds after:
- Implementing Place Details enrichment in `discover_local_independents`
- Adding the `low_digital_footprint` signal (+12 points)
- Shipping Fix A (tier_2: 40 → 25) in v0.1 post-ship

All live results were from Google Places API (New), enriched with Place Details for the first 10 results per query.

---

### Calibration queries

| Query | Near | max_results | tier_2 threshold tested |
|---|---|---|---|
| coffee | Charlotte, NC | 10 | 25, then 18 |
| bookstore | Portland, OR | 10 | 25, then 18 |
| restaurant | Austin, TX | 10 | 25, then 18 |

---

### Results at threshold tier_2=25 (v0.1 post-ship)

| City / query | tier_1 | tier_2 | tier_3 | tier_4 |
|---|---|---|---|---|
| Charlotte / coffee | 0 | 3 (30%) | 7 (70%) | 0 |
| Portland / bookstore | 0 | 4 (40%) | 6 (60%) | 0 |
| Austin / restaurant | 0 | 0 (0%) | 10 (100%) | 0 |

---

### Results at threshold tier_2=18 (v0.2 shipped)

| City / query | tier_1 | tier_2 | tier_3 | tier_4 |
|---|---|---|---|---|
| Charlotte / coffee | 0 | 8 (80%) | 2 (20%) | 0 |
| Portland / bookstore | 0 | 10 (100%) | 0 (0%) | 0 |
| Austin / restaurant | 0 | 0 (0%) | 10 (100%) | 0 |

---

### Key findings

**1. Tier_1 (≥70 points) is rare with searchText data.**

Tier_1 requires tenure signals (century_plus_in_text +35, half_century_in_text +25, established_25_plus +15) or substantial compound signals. Google Places rarely returns editorial summaries for small independents via searchText, so these signals rarely fire. Tier_1 appears correctly in `score_specific_business` when users look up a known business by name and the editorial summary includes tenure language. This is by design: tier_1 is a high-confidence badge, not a participation trophy.

**2. The Austin restaurant result is correct, not a bug.**

The "restaurant near Austin, TX" query returns Austin's most famous independent restaurants (Hestia, Comedor, Josephine House, 1886 Cafe & Bakery). These are well-reviewed locals with 800-1999 reviews, which fires `algorithmic_well_known(-10)` and cancels the `no_chain_signal(+10)`, netting 0 points. They land in tier_3 because LocalRoots cannot differentiate them from regional chains on score alone — and they don't need LocalRoots to be discovered. A narrower query ("neighborhood restaurant", "local diner", or adding `radius_km=2` in a specific neighborhood) returns less-reviewed, more-independent results.

**3. Place Details enrichment fills in photo_count, suppressing low_digital_footprint.**

In v0.1 baseline, searchText returned photo_count=0 for most results (the `photos.name` field was not being populated in search). After enrichment, many businesses have 5-15 photos on record. This means `low_digital_footprint` fires less than anticipated — which is correct. The signal is reserved for businesses with truly no presence: no website, no editorial, and fewer than 3 photos even after Place Details lookup.

**4. The tier_2 floor at 18 is the right threshold for "likely independent."**

At 18 points, a business has both `modest_review_count` (+8, meaning 50-199 reviews) and `no_chain_signal` (+10). This combination means:
- The business has some real presence (not invisible, not chain-dominant)
- The name doesn't match any national chain

That is a defensible "likely local independent" threshold. The practical_note for tier_2 results suggests calling to confirm.

**5. Portland bookstores are genuinely 100% independent at the neighborhood level.**

All 10 results were tier_2 or higher. This is not a calibration artifact; Portland's independent bookstore scene is one of the strongest in the country. A 100% tier_2 result for that category and city is correct behavior.

---

### Threshold decisions

| Threshold | v0.1 | v0.1 post-ship | v0.2 |
|---|---|---|---|
| tier_1 | 70 | 70 | 70 |
| tier_2 | 40 | 25 | 18 |
| tier_3 | 10 | 10 | 10 |

Rationale for tier_2 = 18:
- Captures `modest_review_count(+8) + no_chain_signal(+10)` = 18 exactly
- Businesses with 50-199 reviews and no chain name are "likely independent" at this signal level
- Does not change tier_1 confidence; tier_1 still requires strong tenure or compound signals

---

### To re-run calibration

```bash
GOOGLE_PLACES_API_KEY=your_key npx tsx scripts/calibrate.ts
```

The script runs all three calibration queries and outputs per-result signal breakdowns. Results depend on Google's current data for the queried locations and may shift as businesses open, close, or update their Google profiles.

---

### Next calibration checkpoint (v0.3)

When `compare_local_vs_chain` is implemented, add it to the calibration suite. Also add a farm query (e.g., "farm near Asheville, NC") to validate ecommerce_platform and nc_century_farm bonus behavior once the Century Farm registry is populated.
