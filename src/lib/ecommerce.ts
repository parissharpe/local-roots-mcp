import { ecommercePlatformsFile, type EcommercePlatform } from "../data.js";

export interface EcommerceFingerprint {
  has_online_store: boolean;
  matched_platforms: Array<{
    platform_name: string;
    platform_url: string;
    matched_on: string;
    signal_strength: EcommercePlatform["signal_strength"];
  }>;
}

/**
 * Inspect a website URL for direct-to-consumer farm e-commerce platform
 * fingerprints. Returns the list of matched platforms; a single match is
 * enough to mark a farm as having an online store. We match by host and by
 * subdomain pattern; we deliberately do not fetch the page in v0.1 because
 * Google Places returns the storefront URL and that is enough to detect every
 * platform in our index. Live page fetching can come in v0.2 if we add
 * support for embedded checkout widgets on a farm's own domain.
 */
export function detectEcommercePlatforms(websiteUrl: string | undefined | null): EcommerceFingerprint {
  if (!websiteUrl) {
    return { has_online_store: false, matched_platforms: [] };
  }

  let host = "";
  try {
    const u = new URL(websiteUrl);
    host = u.host.toLowerCase();
  } catch {
    host = websiteUrl.toLowerCase();
  }

  const matched: EcommerceFingerprint["matched_platforms"] = [];

  for (const platform of ecommercePlatformsFile.platforms) {
    for (const pattern of platform.host_patterns) {
      const p = pattern.toLowerCase();
      if (host === p || host.endsWith("." + p)) {
        matched.push({
          platform_name: platform.name,
          platform_url: platform.url,
          matched_on: pattern,
          signal_strength: platform.signal_strength,
        });
        break;
      }
    }
  }

  return {
    has_online_store: matched.length > 0,
    matched_platforms: matched,
  };
}

export function listKnownPlatforms(): EcommercePlatform[] {
  return ecommercePlatformsFile.platforms;
}
