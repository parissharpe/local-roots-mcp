import { centuryFarmsFile, type CenturyFarmEntry } from "../data.js";
import { normalize } from "./chains.js";

export interface CenturyFarmLookup {
  matched: boolean;
  entry?: CenturyFarmEntry;
  registry_loaded: boolean;
  registry_size: number;
}

/**
 * Look up a farm in the bundled NC Century Farm registry. The registry is an
 * empty placeholder in v0.1; this function must NOT throw on an empty file and
 * must NOT generate false positives. Returns registry_size = 0 so callers can
 * decide whether to suppress the Century Farm signal entirely.
 */
export function lookupCenturyFarm(
  farmName: string,
  county?: string,
): CenturyFarmLookup {
  const farms = centuryFarmsFile.farms;
  const registrySize = farms.length;
  if (registrySize === 0) {
    return { matched: false, registry_loaded: true, registry_size: 0 };
  }

  const needle = normalize(farmName);
  const countyNeedle = county ? normalize(county) : null;

  for (const entry of farms) {
    const entryName = normalize(entry.name);
    const entryCounty = normalize(entry.county);

    const nameMatch = entryName && (needle.includes(entryName) || entryName.includes(needle));
    if (!nameMatch) continue;

    if (countyNeedle && entryCounty !== countyNeedle) continue;

    return {
      matched: true,
      entry,
      registry_loaded: true,
      registry_size: registrySize,
    };
  }

  return { matched: false, registry_loaded: true, registry_size: registrySize };
}

export function centuryFarmRegistrySize(): number {
  return centuryFarmsFile.farms.length;
}
