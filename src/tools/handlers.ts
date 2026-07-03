import { z } from "zod";
import {
  searchInventory,
  fetchCarlines,
  fetchCarlineStructure,
  GraphQLClientError,
  type VehicleGroup,
  type Vehicle,
} from "../graphql-client.js";
import { extractFiltersFromQuery } from "../mapping.js";
import {
  formatSearchResults,
  formatVehicleDetails,
  formatModelsList,
} from "../formatter.js";

// ── Input schemas (used both for MCP tool schemas and runtime validation) ──

export const SearchVehiclesInputSchema = z.object({
  query: z
    .string()
    .min(2)
    .max(300)
    .describe(
      'Natural language search query, e.g. "Audi Q5 unter 40000 Euro" or ' +
        '"red sportback electric under 60k". Lifestyle terms like ' +
        '"Familienauto", "sportlich", "elektrisch" are automatically resolved server-side.'
    ),
  market: z
    .enum(["US", "CA"])
    .default("US")
    .describe("Target market (US or CA). Note: only US/CA markets are supported by the inventory API."),
  sort: z
    .enum(["OLDEST_IN_LOT", "NEWEST_IN_LOT", "LOWEST_MILEAGE", "HIGHEST_MILEAGE"])
    .optional()
    .describe("Sort order for results. Defaults to OLDEST_IN_LOT."),
  dealerId: z
    .string()
    .optional()
    .describe("Optional KVPS dealer ID to scope search to a single dealership."),
});

export const GetVehicleDetailsInputSchema = z.object({
  vehicleId: z
    .string()
    .describe(
      "Vehicle ID as returned by search_vehicles (the base64 id field). " +
        "To look up a vehicle by VIN, include the VIN directly in a search_vehicles query instead."
    ),
  searchQuery: z
    .string()
    .optional()
    .describe(
      "Optional: include original search context to narrow down results when fetching details."
    ),
  market: z.enum(["US", "CA"]).default("US"),
});

export const ListAvailableModelsInputSchema = z.object({
  country: z
    .string()
    .default("DE")
    .describe('ISO country code for carline structure, e.g. "DE", "US".'),
  language: z
    .string()
    .default("de")
    .describe('Language code, e.g. "de", "en".'),
  format: z
    .enum(["grouped", "flat"])
    .default("grouped")
    .describe(
      '"grouped" returns model groups (A-series, Q-series, etc.); "flat" returns a flat list of carline IDs/names.'
    ),
});

// ── Tool definitions for MCP registration ───────────────────────────────────

export const TOOL_DEFINITIONS = [
  {
    name: "search_vehicles",
    description:
      "Suche Audi-Fahrzeuge im Lagerbestand über eine natürlichsprachliche Anfrage. " +
      "Lifestyle-Begriffe wie 'Familienauto', 'sportlich', 'elektrisch', 'Kombi', 'SUV' " +
      "werden serverseitig automatisch in technische Filter übersetzt. " +
      "WICHTIG: Aktuell nur US- und CA-Markt via inventorySearch unterstützt. " +
      "Preis-Filter können direkt in der Query angegeben werden (z.B. 'under 40000').",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'Natürlichsprachliche Suchanfrage, z.B. "rotes Familienauto unter 40000" ' +
            'oder "electric SUV low mileage". Min. 2, max. 300 Zeichen.',
          minLength: 2,
          maxLength: 300,
        },
        market: {
          type: "string",
          enum: ["US", "CA"],
          default: "US",
          description: "Zielmarkt (US oder CA).",
        },
        sort: {
          type: "string",
          enum: ["OLDEST_IN_LOT", "NEWEST_IN_LOT", "LOWEST_MILEAGE", "HIGHEST_MILEAGE"],
          description: "Sortierung der Ergebnisse.",
        },
        dealerId: {
          type: "string",
          description: "Optionale KVPS Händler-ID um Suche auf einen Händler einzuschränken.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_vehicle_details",
    description:
      "Rufe Details zu einem einzelnen Fahrzeug ab. Da die API kein eigenständiges " +
      "Einzelfahrzeug-Lookup unterstützt, wird die vehicle ID genutzt um das Fahrzeug " +
      "aus einer gezielten Suchanfrage zu identifizieren und detailliert darzustellen.",
    inputSchema: {
      type: "object",
      properties: {
        vehicleId: {
          type: "string",
          description:
            "Fahrzeug-ID aus search_vehicles (base64-codiert, z.B. 'VVNBMjVHMTEzODU0...').",
        },
        searchQuery: {
          type: "string",
          description: "Optionaler Suchkontext (z.B. VIN oder Modellname) für die Detailsuche.",
        },
        market: {
          type: "string",
          enum: ["US", "CA"],
          default: "US",
        },
      },
      required: ["vehicleId"],
    },
  },
  {
    name: "list_available_models",
    description:
      "Liste alle verfügbaren Audi-Modelle und Baureihen (carlineStructure) auf. " +
      "Zeigt Modellname, Karosserieform (bodyType) und Antriebsart (vehicleType: BEV, PHEV, ICEV). " +
      "Nützlich um gültige Modellnamen für die Fahrzeugsuche zu ermitteln.",
    inputSchema: {
      type: "object",
      properties: {
        country: {
          type: "string",
          default: "DE",
          description: 'ISO-Ländercode, z.B. "DE" oder "US".',
        },
        language: {
          type: "string",
          default: "de",
          description: 'Sprachcode, z.B. "de" oder "en".',
        },
        format: {
          type: "string",
          enum: ["grouped", "flat"],
          default: "grouped",
          description:
            '"grouped": Modellgruppen mit Details. "flat": Einfache ID/Name-Liste.',
        },
      },
      required: [],
    },
  },
] as const;

// ── Handler implementations ──────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", message: string, data?: unknown) {
  const ts = new Date().toISOString();
  const line = data
    ? `[${ts}] [${level.toUpperCase()}] ${message} ${JSON.stringify(data)}`
    : `[${ts}] [${level.toUpperCase()}] ${message}`;
  process.stderr.write(line + "\n");
}

export async function handleSearchVehicles(rawInput: unknown): Promise<string> {
  const parsed = SearchVehiclesInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return `Ungültige Eingabe: ${parsed.error.issues.map((i) => i.message).join(", ")}`;
  }
  const { query, market, sort, dealerId } = parsed.data;

  // Apply lifestyle mapping
  const filters = extractFiltersFromQuery(query);
  const effectiveQuery = filters.enhancedQuery;

  log("info", "search_vehicles called", {
    originalQuery: query,
    effectiveQuery,
    lifestyleTerms: filters.lifestyleTerms,
    market,
    sort,
  });

  try {
    const groups = await searchInventory({
      searchQuery: effectiveQuery,
      market,
      sort,
      dealerId,
    });

    log("info", "search_vehicles result", {
      groupCount: groups.length,
      totals: groups.map((g: VehicleGroup) => g.totalCount),
    });

    return formatSearchResults(groups, query, filters.lifestyleTerms);
  } catch (err) {
    if (err instanceof GraphQLClientError) {
      log("error", "search_vehicles GraphQL error", { message: err.message });
      return `Fehler bei der Fahrzeugsuche: ${err.message}`;
    }
    log("error", "search_vehicles unexpected error", { error: String(err) });
    return "Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.";
  }
}

export async function handleGetVehicleDetails(rawInput: unknown): Promise<string> {
  const parsed = GetVehicleDetailsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return `Ungültige Eingabe: ${parsed.error.issues.map((i) => i.message).join(", ")}`;
  }
  const { vehicleId, searchQuery, market } = parsed.data;

  log("info", "get_vehicle_details called", { vehicleId, searchQuery, market });

  // The API has no dedicated single-vehicle lookup.
  // We search using the ID or a provided search query and find the matching vehicle.
  const effectiveQuery = searchQuery ?? vehicleId;

  try {
    const groups = await searchInventory({
      searchQuery: effectiveQuery,
      market,
    });

    // Find the vehicle with the matching ID across all groups
    let found: Vehicle | undefined;
    for (const group of groups) {
      found = group.vehicles.find((v: Vehicle) => v.id === vehicleId);
      if (found) break;
    }

    if (!found) {
      // Try a broader fallback: return first result with a note
      const firstVehicle = groups[0]?.vehicles[0];
      if (firstVehicle) {
        return (
          `Fahrzeug mit ID \`${vehicleId}\` nicht in den aktuellen Suchergebnissen gefunden.\n\n` +
          `Erster Treffer der Suche "${effectiveQuery}":\n\n` +
          formatVehicleDetails(firstVehicle)
        );
      }
      return `Kein Fahrzeug mit ID \`${vehicleId}\` gefunden. Bitte verwenden Sie search_vehicles für eine neue Suche.`;
    }

    return formatVehicleDetails(found);
  } catch (err) {
    if (err instanceof GraphQLClientError) {
      log("error", "get_vehicle_details error", { message: err.message });
      return `Fehler beim Abrufen der Fahrzeugdetails: ${err.message}`;
    }
    return "Ein unerwarteter Fehler ist aufgetreten.";
  }
}

export async function handleListAvailableModels(rawInput: unknown): Promise<string> {
  const parsed = ListAvailableModelsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return `Ungültige Eingabe: ${parsed.error.issues.map((i) => i.message).join(", ")}`;
  }
  const { country, language, format } = parsed.data;

  log("info", "list_available_models called", { country, language, format });

  try {
    if (format === "flat") {
      const carlines = await fetchCarlines({ country, language });
      if (carlines.length === 0) return "Keine Modelle verfügbar.";
      const lines = carlines.map((c) => `- **${c.name}** (ID: \`${c.id}\`)`);
      return `## Audi Baureihen (${country.toUpperCase()})\n\n${lines.join("\n")}`;
    }

    const groups = await fetchCarlineStructure({ country, language });
    return formatModelsList(groups);
  } catch (err) {
    if (err instanceof GraphQLClientError) {
      log("error", "list_available_models error", { message: err.message });
      return `Fehler beim Abrufen der Modelle: ${err.message}`;
    }
    return "Ein unerwarteter Fehler ist aufgetreten.";
  }
}
