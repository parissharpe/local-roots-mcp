const WAYBACK_CDX = "http://web.archive.org/cdx/search/cdx";
const TIMEOUT_MS = Number(process.env.WAYBACK_TIMEOUT_MS) || 3000;
const MIN_INTERVAL_MS = 500;

let lastCallAt = 0;

export function _resetThrottle(): void {
  lastCallAt = 0;
}

async function throttledFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastCallAt;
  if (lastCallAt > 0 && elapsed < MIN_INTERVAL_MS) {
    await new Promise<void>((res) => setTimeout(res, MIN_INTERVAL_MS - elapsed));
  }
  lastCallAt = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractDomain(websiteUri: string): string | null {
  try {
    const normalized = websiteUri.startsWith("http") ? websiteUri : `https://${websiteUri}`;
    return new URL(normalized).hostname;
  } catch {
    return null;
  }
}

/**
 * Returns the earliest Wayback Machine snapshot year for the given website.
 * - number: earliest snapshot year found (e.g. 1999).
 * - null: CDX confirmed no snapshots exist for this domain.
 * - undefined: check failed or timed out; treat as no data, not as "no snapshots".
 * Never throws.
 */
export async function checkWaybackTenure(
  websiteUri: string | null | undefined,
): Promise<number | null | undefined> {
  if (!websiteUri) return undefined;
  const domain = extractDomain(websiteUri);
  if (!domain) return undefined;

  const params = new URLSearchParams({
    url: domain,
    output: "json",
    limit: "1",
    fl: "timestamp",
    filter: "statuscode:200",
  });

  try {
    const res = await throttledFetch(`${WAYBACK_CDX}?${params.toString()}`);
    if (!res.ok) return undefined;

    const data = (await res.json()) as unknown[][];
    if (!Array.isArray(data) || data.length < 2) return null;

    const row = data[1];
    if (!Array.isArray(row) || typeof row[0] !== "string" || row[0].length < 4) return undefined;

    const year = parseInt(row[0].slice(0, 4), 10);
    return Number.isFinite(year) ? year : undefined;
  } catch (err) {
    console.error("[wayback] timeout or network error for", domain, (err as Error)?.message);
    return undefined;
  }
}
