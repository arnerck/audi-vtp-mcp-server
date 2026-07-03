# Audi VTP MCP Server

Ein MCP (Model Context Protocol) Server, der als Schnittstelle zwischen Claude (oder einem anderen LLM-Client) und der Audi Fahrzeuginventar-API fungiert.

## Schema-Discovery Ergebnisse (Schritt 0)

Die GraphQL-Introspection ist am Endpoint deaktiviert. Durch systematisches Probing wurden folgende relevante Queries ermittelt:

| Query | Typ | Beschreibung |
|-------|-----|--------------|
| `inventorySearch(input: InventorySearchInput!)` | Fahrzeugsuche | Semantische NL-Suche. **Nur US/CA-Markt.** |
| `carlineStructure(identifier: CarlineStructureIdentifierInput!)` | Modellstruktur | Baureihengruppen mit bodyType/vehicleType |
| `carlines(identifier: CarlinesIdentifierInput!)` | Baureihen-Liste | Flache Liste aller Baureihen-IDs/Namen |

### `InventorySearchInput` (vollständig)
```graphql
input InventorySearchInput {
  searchQuery: String!   # NL-Query, VIN oder #StockNummer (2–300 Zeichen)
  market: CountryCode    # "US" | "CA" — KEIN DE/EU-Markt verfügbar
  language: LanguageCode # "EN" | "FR" (nur CA)
  sort: InventorySearchSort  # OLDEST_IN_LOT | NEWEST_IN_LOT | LOWEST_MILEAGE | HIGHEST_MILEAGE
  dealerId: String       # optionale KVPS-Händler-ID
}
```

### `InventorySearchVehicle` (entdeckte Felder)
```
id, vin, title, modelYear, modelName, exteriorColor,
odometerValue, stockType, imageUrl,
dealer { id, name, region }
```

> **Hinweis**: Preis-Felder (price, msrp) wurden nicht im Schema gefunden — die API überlässt Preisfilter der NL-Query (z.B. "under 40000 dollars").

### Markt-Einschränkung
`inventorySearch` unterstützt **nur US und CA**. Ein DE/EU-Markt-Endpunkt ist an `omnigraph.audi.com` nicht vorhanden. Die `carlineStructure`-Query liefert Modelldaten für DE (Referenz für Baureihen/bodyTypes).

---

## Voraussetzungen

- Node.js ≥ 18
- npm

## Installation

```bash
git clone https://github.com/arnerck/audi-vtp-mcp-server.git
cd audi-vtp-mcp-server
npm install
npm run build
```

## Lokaler Start (Entwicklung)

```bash
npm run dev
```

Der Server kommuniziert über **stdio** (kein HTTP-Port). Er wartet auf MCP-Anfragen über stdin/stdout.

## Umgebungsvariablen

| Variable | Standard | Beschreibung |
|----------|----------|--------------|
| `AUDI_GRAPHQL_ENDPOINT` | `https://omnigraph.audi.com/graphql` | GraphQL-Endpoint |
| `AUDI_CLIENT_NAME` | `audi-vtp-mcp-server` | Apollo Client-Name Header |
| `AUDI_CLIENT_VERSION` | `1.0.0` | Apollo Client-Version Header |
| `AUDI_REQUEST_TIMEOUT_MS` | `15000` | Request-Timeout in ms |

## Tests ausführen

```bash
npm test
```

## Projektstruktur

```
audi-vtp-mcp-server/
├── config/
│   └── lifestyle-mapping.json   # Lifestyle-Begriffe → Filter-Mapping (erweiterbar)
├── src/
│   ├── index.ts                 # MCP-Server-Einstiegspunkt (stdio transport)
│   ├── queries.ts               # GraphQL-Query-Definitionen
│   ├── graphql-client.ts        # GraphQL-Client (fetch + Zod-Validierung)
│   ├── mapping.ts               # Lifestyle-Begriff → Filter Mapping-Logik
│   ├── formatter.ts             # Response-Formatierung (Markdown)
│   └── tools/
│       └── handlers.ts          # MCP Tool-Handler + Tool-Schemas
├── tests/
│   └── mapping.test.ts          # Unit-Tests für Mapping-Logik
├── package.json
├── tsconfig.json
└── jest.config.js
```

## Verfügbare MCP Tools

### `search_vehicles`
Fahrzeugsuche mit natürlicher Sprache.

**Parameter:**
- `query` (required): NL-Anfrage, z.B. `"Audi Q5 unter 40000"` oder `"electric SUV low mileage"`
- `market`: `"US"` oder `"CA"` (Standard: `"US"`)
- `sort`: `OLDEST_IN_LOT` | `NEWEST_IN_LOT` | `LOWEST_MILEAGE` | `HIGHEST_MILEAGE`
- `dealerId`: Optionale KVPS-Händler-ID

### `get_vehicle_details`
Detailansicht eines Fahrzeugs per ID (aus `search_vehicles`).

**Parameter:**
- `vehicleId` (required): Base64-codierte Fahrzeug-ID
- `searchQuery`: Optionaler Suchkontext
- `market`: `"US"` oder `"CA"`

### `list_available_models`
Listet alle Audi-Baureihen mit bodyType und Antriebsart auf.

**Parameter:**
- `country`: ISO-Code, z.B. `"DE"` (Standard)
- `language`: Sprachcode, z.B. `"de"` (Standard)
- `format`: `"grouped"` (Standard) oder `"flat"`

## Lifestyle-Mapping (config/lifestyle-mapping.json)

Vage Begriffe werden serverseitig in technische Filter übersetzt:

| Begriff | Mapped zu |
|---------|----------|
| `Familienauto` | bodyTypes: Avant, allroad quattro, SUV; Series: A5, A6, Q3, Q5, Q7, Q8 |
| `sportlich` / `sporty` | Series-Prefix: S, RS; bodyType: sportscar, Sportback |
| `kompakt` / `compact` | Series: A1, A3, Q2, Q3 |
| `elektrisch` / `electric` / `EV` | vehicleType: BEV |
| `Hybrid` / `PHEV` | vehicleType: PHEV |
| `Kombi` / `estate` / `wagon` | bodyType: Avant, allroad quattro |
| `SUV` | bodyType: SUV |
| `Luxus` / `luxury` | Series: A6, A8, Q7, Q8, e-tron GT |

Neue Einträge können direkt in `config/lifestyle-mapping.json` ergänzt werden — kein Code-Änderung nötig.

## Einbindung in Claude Desktop

In `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "audi-vtp": {
      "command": "node",
      "args": ["/absolute/path/to/audi-vtp-mcp-server/dist/index.js"],
      "env": {
        "AUDI_REQUEST_TIMEOUT_MS": "20000"
      }
    }
  }
}
```

Nach dem Speichern Claude Desktop neu starten. Die Tools erscheinen dann im Tool-Menü.

### Mit `npm run dev` (ohne Build)

```json
{
  "mcpServers": {
    "audi-vtp": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/audi-vtp-mcp-server/src/index.ts"]
    }
  }
}
```

## Einbindung in Claude Code (VS Code)

In `.vscode/mcp.json` im Workspace:

```json
{
  "servers": {
    "audi-vtp": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/dist/index.js"]
    }
  }
}
```

## Beispiel-Nutzung

```
User: Zeige mir alle verfügbaren elektrischen Audi unter 60000 Dollar
→ search_vehicles({ query: "electric Audi under 60000", market: "US" })

User: Ich suche ein Familienauto für 4 Personen
→ search_vehicles({ query: "Familienauto für 4 Personen" })
   → Server erkennt "Familienauto", ergänzt: bodyTypes=[Avant,SUV,...], seriesHints=[A5,A6,Q5,...]

User: Welche Audi-Modelle gibt es?
→ list_available_models({ country: "DE", language: "de" })

User: Details zum Fahrzeug mit ID VVNBMjVH...
→ get_vehicle_details({ vehicleId: "VVNBMjVH...", searchQuery: "Audi Q5" })
```

## Bekannte Einschränkungen

- **Nur US/CA-Markt**: `inventorySearch` unterstützt keinen DE/EU-Markt
- **Kein Preisfeld**: Die API liefert keinen strukturierten Preis — Preis-Filter über NL-Query (z.B. "under 40000")
- **Kein Einzelfahrzeug-Lookup**: Es gibt keinen `vehicle(id: ...)` Query; Details werden über eine gezielte Suche + ID-Match ermittelt
- **Standortsuche**: Nicht in v1 implementiert (PLZ/Umkreis per `dealerId` möglich)
