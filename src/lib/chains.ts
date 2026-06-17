import { chainDatabase, type ChainEntry } from "../data.js";

/**
 * Normalize a name for matching. Lowercases, strips punctuation, collapses
 * whitespace. We deliberately do NOT stem because chain names are short and
 * proper nouns; stemming costs more false positives than it saves.
 */
export function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'`’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface ChainMatch {
  matched: boolean;
  chain?: ChainEntry;
  reason?: string;
}

/**
 * Determine whether a business name matches a known national chain. We match
 * conservatively so that, for example, a local diner called "Joe's Burger
 * Shack" is not flagged because it contains the word "burger". The match
 * requires either an exact name token-sequence match or an alias hit.
 */
export function detectChain(businessName: string): ChainMatch {
  const needle = normalize(businessName);
  if (!needle) {
    return { matched: false };
  }
  const needleTokens = needle.split(" ");

  for (const chain of chainDatabase.chains) {
    const candidates = [chain.name, ...chain.aliases].map(normalize).filter(Boolean);
    for (const cand of candidates) {
      const candTokens = cand.split(" ");
      if (containsContiguous(needleTokens, candTokens)) {
        return {
          matched: true,
          chain,
          reason: `Business name "${businessName}" matches chain "${chain.name}".`,
        };
      }
    }
  }
  return { matched: false };
}

function containsContiguous(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}
