import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types
export interface LifestyleMapping {
  description?: string;
  bodyTypes?: string[];
  vehicleTypes?: string[];
  seriesHints?: string[];
  seriesPrefixes?: string[];
  fuelHint?: string;
}

export interface MappingConfig {
  lifestyleMappings: Record<string, LifestyleMapping>;
  validVehicleTypes: string[];
  validBodyTypes: string[];
  sortOptions: Record<string, string>;
}

export interface ExtractedFilters {
  lifestyleTerms: string[];
  bodyTypes: string[];
  vehicleTypes: string[];
  seriesHints: string[];
  fuelHints: string[];
  enhancedQuery: string;
}

let _config: MappingConfig | null = null;

function loadConfig(): MappingConfig {
  if (_config) return _config;
  const require = createRequire(import.meta.url);
  const configPath = path.resolve(__dirname, "../config/lifestyle-mapping.json");
  _config = require(configPath) as MappingConfig;
  return _config;
}

/**
 * Extracts structured filter hints from a natural language query by
 * matching lifestyle/vague terms against the mapping table.
 * The LLM passes the query largely unmodified; this layer translates
 * any lifestyle keywords into additional filter context.
 */
export function extractFiltersFromQuery(userQuery: string): ExtractedFilters {
  const config = loadConfig();
  const lowerQuery = userQuery.toLowerCase();

  const matchedTerms: string[] = [];
  const bodyTypes = new Set<string>();
  const vehicleTypes = new Set<string>();
  const seriesHints = new Set<string>();
  const fuelHints = new Set<string>();

  for (const [term, mapping] of Object.entries(config.lifestyleMappings)) {
    // Check for whole-word / phrase match
    if (lowerQuery.includes(term.toLowerCase())) {
      matchedTerms.push(term);
      mapping.bodyTypes?.forEach((bt) => bodyTypes.add(bt));
      mapping.vehicleTypes?.forEach((vt) => vehicleTypes.add(vt));
      mapping.seriesHints?.forEach((sh) => seriesHints.add(sh));
      if (mapping.fuelHint) fuelHints.add(mapping.fuelHint);
    }
  }

  // Build enhanced query by appending resolved series hints and vehicle types
  // so the NL search API has more context
  let enhancedQuery = userQuery;
  const appendParts: string[] = [];

  if (vehicleTypes.size > 0) {
    appendParts.push(`vehicle type: ${[...vehicleTypes].join(" or ")}`);
  }
  if (seriesHints.size > 0 && seriesHints.size <= 4) {
    // Only append series hints if they narrow things down meaningfully
    appendParts.push(`models: ${[...seriesHints].join(", ")}`);
  }
  if (bodyTypes.size > 0 && bodyTypes.size <= 4) {
    appendParts.push(`body: ${[...bodyTypes].join(" or ")}`);
  }

  if (appendParts.length > 0) {
    enhancedQuery = `${userQuery} (${appendParts.join("; ")})`;
  }

  return {
    lifestyleTerms: matchedTerms,
    bodyTypes: [...bodyTypes],
    vehicleTypes: [...vehicleTypes],
    seriesHints: [...seriesHints],
    fuelHints: [...fuelHints],
    enhancedQuery,
  };
}

export function getConfig(): MappingConfig {
  return loadConfig();
}
