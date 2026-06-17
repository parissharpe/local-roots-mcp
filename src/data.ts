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
  family_surname: string;
  county: string;
  year_recognized?: number;
  farm_name?: string;
  notes?: string;
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

export const chainDatabase: ChainDatabase = loadJson<ChainDatabase>("chain-database.json");
export const ecommercePlatformsFile: EcommercePlatformsFile =
  loadJson<EcommercePlatformsFile>("ecommerce-platforms.json");
export const centuryFarmsFile: CenturyFarmsFile =
  loadJson<CenturyFarmsFile>("century-farms-nc.json");
