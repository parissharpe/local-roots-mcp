import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

export interface ChainEntry {
  name: string;
  aliases: string[];
  categories: string[];
}

export interface ChainDatabase {
  _metadata: {
    populated_date: string;
    source: string;
    review_cadence: string;
    matching_rules: string;
    note: string;
  };
  chains: ChainEntry[];
}

export interface EcommercePlatform {
  name: string;
  url: string;
  host_patterns: string[];
  subdomain_pattern: string | null;
  audience: string;
  signal_strength: "high" | "medium" | "low";
}

export interface EcommercePlatformsFile {
  _metadata: {
    populated_date: string;
    source: string;
    review_cadence: string;
    matching_rules: string;
    note: string;
  };
  platforms: EcommercePlatform[];
}

export interface CenturyFarmEntry {
  name: string;
  county: string;
  city?: string;
  since_year: number;
  website?: string;
}

export interface CenturyFarmsFile {
  _metadata: {
    populated_date: string;
    source: string;
    review_cadence: string;
    expected_record_count: string;
    matching_rules: string;
    note: string;
  };
  farms: CenturyFarmEntry[];
}

function loadJson<T>(filename: string): T {
  const path = join(dataDir, filename);
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as T;
}

function loadCenturyFarms(): CenturyFarmsFile {
  const main = loadJson<CenturyFarmsFile>("century-farms-nc.json");
  if (main.farms.length > 0) return main;
  try {
    const sample = loadJson<{ farms: CenturyFarmEntry[] }>("century-farms-nc-sample.json");
    return { ...main, farms: sample.farms };
  } catch {
    return main;
  }
}

export const chainDatabase: ChainDatabase = loadJson<ChainDatabase>("chain-database.json");
export const ecommercePlatformsFile: EcommercePlatformsFile =
  loadJson<EcommercePlatformsFile>("ecommerce-platforms.json");
export const centuryFarmsFile: CenturyFarmsFile = loadCenturyFarms();
