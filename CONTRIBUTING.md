# Contributing to LocalRoots

LocalRoots is opinionated about two things: the educational return shape, and the scoring framework. Code that breaks either is a regression, even if the tests pass. The rest of the codebase is permissive.

## The educational return shape

Every tool returns `{ answer, citations, practical_note, caveats?, follow_up_questions? }`. The `signal_breakdown` is part of `answer` for any scored result; do not collapse it to a summary string. Users learning the framework rely on seeing the per-signal points.

Brand voice: no em dashes anywhere in code, docs, prompts, or tool descriptions. Use commas, periods, or semicolons, or rewrite the sentence.

## The scoring framework

The scoring engine lives in `src/lib/scoring.ts`. Three sections, in order: `universal`, `category_bonuses`, `negatives`. New signals belong in the section that matches their generality. A signal that fires only for farms is a category bonus, not a universal signal, even if it is positive.

When adding a signal:
1. Add a detector function in `src/lib/scoring.ts` that returns a `SignalLine[]`.
2. Wire it into one of `tenureSignals` / `familyOwnershipSignals` / `farmCategoryBonuses` / etc., or write a new aggregator function and call it from `score()`.
3. Add a test in `tests/lib/scoring.test.ts` for the positive case and at least one near-miss negative case.
4. Update the README's "How the scoring works" section.

Tier thresholds are tuned to current real-world data. If you find yourself adjusting them to make a test pass, prefer fixing the signal points instead.

## Populating the NC Century Farm dataset

The NC Department of Agriculture and Consumer Services Century Farm Family Program recognizes farms continuously owned by the same family for 100 years or more. There are approximately 1,800 recognized farms. A public directory is browseable by county group at https://www.ncagr.gov/divisions/public-affairs/directory-of-century-farms. A 2024 PDF directory is also available for download from that page.

A 15-entry sample from NCDA&CS public records is bundled at `data/century-farms-nc-sample.json` and is used automatically when the main registry is empty. This lets the `nc_century_farm` bonus fire for demonstration and testing. To replace the sample with the full registry, follow the procedure below.

Population procedure:

1. Obtain the full Century Farm list from NCDA&CS:
   - Browse the county directory at https://www.ncagr.gov/divisions/public-affairs/directory-of-century-farms and copy entries from each county page, or
   - Submit a public information request to https://www.ncagr.gov (Marketing Division, 919-707-3100). The full list has been provided as a printed roster or Excel file in past requests.

2. Normalize each entry into the schema in `data/century-farms-nc.json`:
   ```json
   {
     "name": "Wilson Family Farm",
     "county": "Wake",
     "city": "Raleigh",
     "since_year": 1887,
     "website": "https://wilsonfamilyfarm.com"
   }
   ```
   - `name` and `county` are required.
   - `city` and `website` are optional but add precision. Providing a website enables Wayback Machine tenure inference for the farm.
   - `since_year` is the year the family began farming the land, not the year the Century Farm award was granted.

3. Sort the array by `county` then `name` so diffs stay readable.

4. Update `_metadata.populated_date` and `_metadata.expected_record_count`.

5. Run `npm test` and `npm run smoke-test` to verify nothing regressed. Then verify with a known Century Farm name + county that `score_specific_business` now produces the `nc_century_farm` bonus.

When `data/century-farms-nc.json` contains at least one entry, it takes precedence over the sample file. The sample is bypassed automatically.

## The chain database

`data/chain-database.json` is curated, not exhaustive. The bar for adding a chain is: at least 100 U.S. locations AND a brand-consistent menu / inventory at every location. Regional chains under that threshold are intentionally left out so a regional grocer that still feels local is not disqualified.

A user can override the chain filter with `include_chains: true` on `discover_local_independents`. If you find a frequent false positive (a beloved local business named identically to a chain), open an issue with the example and the city; the right fix is usually an alias refinement, not a chain removal.

## The e-commerce platform fingerprints

`data/ecommerce-platforms.json` is hand-curated. The bar for adding a platform: it is farm-first, used by independent farms (not aggregators), and matching its host pattern does not generate cross-category false positives. Generic e-commerce (Shopify, Square Online) is deliberately excluded; matching on them would flag every retail business as a "farm with online store".

## Running tests

```bash
npm test           # vitest
npm run smoke-test # exercises each tool; live calls if GOOGLE_PLACES_API_KEY is set
```

The smoke test runs offline by default (chain detection, ecommerce fingerprinting, scoring engine). Live calls are skipped without a key. To run live:

```bash
GOOGLE_PLACES_API_KEY=AIza... npm run smoke-test
```

Never commit a real key. `.env` is gitignored; use it for local development.

## Pull requests

PRs that touch the scoring engine should include before/after `signal_breakdown` output on at least one representative business so reviewers can see the effect on a real result, not just on the unit tests.
