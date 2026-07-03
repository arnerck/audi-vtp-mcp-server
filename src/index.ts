import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  SearchVehiclesInputSchema,
  GetVehicleDetailsInputSchema,
  ListAvailableModelsInputSchema,
  handleSearchVehicles,
  handleGetVehicleDetails,
  handleListAvailableModels,
} from "./tools/handlers.js";

const SERVER_NAME = "audi-vtp-mcp-server";
const SERVER_VERSION = "1.0.0";

function log(level: "info" | "warn" | "error", message: string) {
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] [${level.toUpperCase()}] ${message}\n`);
}

async function main() {
  log("info", `Starting ${SERVER_NAME} v${SERVER_VERSION}`);

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Register search_vehicles
  server.tool(
    "search_vehicles",
    "Suche Audi-Fahrzeuge im Lagerbestand über eine natürlichsprachliche Anfrage. " +
      "Lifestyle-Begriffe wie 'Familienauto', 'sportlich', 'elektrisch' werden serverseitig automatisch " +
      "in technische Filter übersetzt. WICHTIG: Aktuell nur US- und CA-Markt via inventorySearch unterstützt.",
    SearchVehiclesInputSchema.shape,
    async (args) => {
      const result = await handleSearchVehicles(args);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  // Register get_vehicle_details
  server.tool(
    "get_vehicle_details",
    "Rufe Details zu einem einzelnen Fahrzeug ab anhand der ID aus search_vehicles.",
    GetVehicleDetailsInputSchema.shape,
    async (args) => {
      const result = await handleGetVehicleDetails(args);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  // Register list_available_models
  server.tool(
    "list_available_models",
    "Liste alle verfügbaren Audi-Modelle und Baureihen auf (carlineStructure). " +
      "Zeigt Modellname, Karosserieform (bodyType) und Antriebsart (BEV, PHEV, ICEV).",
    ListAvailableModelsInputSchema.shape,
    async (args) => {
      const result = await handleListAvailableModels(args);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log("info", "MCP server connected via stdio transport");
}

main().catch((err) => {
  process.stderr.write(`[FATAL] ${String(err)}\n`);
  process.exit(1);
});
