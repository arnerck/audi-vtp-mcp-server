/**
 * HTTP server entry point for Copilot Studio / remote MCP clients.
 *
 * Exposes the MCP server as a Streamable HTTP endpoint (POST /mcp).
 * This is the transport required by Microsoft Copilot Studio and other
 * remote MCP clients that need a URL instead of a local stdio process.
 *
 * Each POST request to /mcp creates a new MCP session (stateless mode).
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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
const PORT = parseInt(process.env.PORT ?? "8080");

function log(level: "info" | "warn" | "error", message: string, data?: unknown) {
  const ts = new Date().toISOString();
  const line = data
    ? `[${ts}] [${level.toUpperCase()}] ${message} ${JSON.stringify(data)}`
    : `[${ts}] [${level.toUpperCase()}] ${message}`;
  process.stderr.write(line + "\n");
}

function createMcpServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

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

  server.tool(
    "get_vehicle_details",
    "Rufe Details zu einem einzelnen Fahrzeug ab anhand der ID aus search_vehicles.",
    GetVehicleDetailsInputSchema.shape,
    async (args) => {
      const result = await handleGetVehicleDetails(args);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

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

  return server;
}

async function main() {
  const app = express();
  app.use(express.json());

  // Health check — Copilot Studio and load balancers ping this
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION });
  });

  // MCP Streamable HTTP endpoint (stateless — one transport per request)
  app.post("/mcp", async (req, res) => {
    log("info", "MCP request received", { method: req.method, path: req.path });

    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless mode
      });

      const server = createMcpServer();

      // Clean up after response ends
      res.on("close", () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      log("error", "MCP request failed", { error: String(err) });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // Copilot Studio also does GET /mcp for session resumption — return 405
  app.get("/mcp", (_req, res) => {
    res.status(405).json({
      error: "Method Not Allowed",
      hint: "Use POST /mcp for MCP Streamable HTTP transport",
    });
  });

  app.listen(PORT, () => {
    log("info", `${SERVER_NAME} v${SERVER_VERSION} listening on port ${PORT}`);
    log("info", `MCP endpoint: POST http://localhost:${PORT}/mcp`);
    log("info", `Health check: GET  http://localhost:${PORT}/health`);
  });
}

main().catch((err) => {
  process.stderr.write(`[FATAL] ${String(err)}\n`);
  process.exit(1);
});
