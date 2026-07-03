import { z } from "zod";

const API_ENDPOINT =
  process.env.AUDI_GRAPHQL_ENDPOINT ?? "https://omnigraph.audi.com/graphql";
const CLIENT_NAME = process.env.AUDI_CLIENT_NAME ?? "audi-vtp-mcp-server";
const CLIENT_VERSION = process.env.AUDI_CLIENT_VERSION ?? "1.0.0";
const REQUEST_TIMEOUT_MS = parseInt(
  process.env.AUDI_REQUEST_TIMEOUT_MS ?? "15000"
);

// ── Response type schemas ────────────────────────────────────────────────────

export const DealerSchema = z.object({
  id: z.string(),
  name: z.string(),
  region: z.string().optional(),
});

export const VehicleSchema = z.object({
  id: z.string(),
  vin: z.string().optional(),
  title: z.string(),
  modelYear: z.number().optional(),
  modelName: z.string().optional(),
  exteriorColor: z.string().optional(),
  odometerValue: z.number().optional(),
  stockType: z.string().optional(),
  imageUrl: z.string().optional(),
  dealer: DealerSchema.optional(),
});

export const GroupSchema = z.object({
  totalCount: z.number(),
  vehicles: z.array(VehicleSchema),
});

export const InventorySearchResponseSchema = z.object({
  data: z
    .object({
      inventorySearch: z.object({
        groups: z.array(GroupSchema).optional(),
        warnings: z.array(z.object({ __typename: z.string() })).optional(),
      }),
    })
    .optional(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        extensions: z.record(z.unknown()).optional(),
      })
    )
    .optional(),
});

export const CarlinesResponseSchema = z.object({
  data: z
    .object({
      carlines: z.array(z.object({ id: z.string(), name: z.string() })),
    })
    .optional(),
  errors: z
    .array(z.object({ message: z.string() }))
    .optional(),
});

export const CarlineStructureResponseSchema = z.object({
  data: z
    .object({
      carlineStructure: z.object({
        carlineGroups: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            carlines: z.array(
              z.object({
                name: z.string(),
                modelYear: z.number(),
                bodyType: z.object({ name: z.string() }),
                vehicleType: z.string(),
              })
            ),
          })
        ),
      }),
    })
    .optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

export type Vehicle = z.infer<typeof VehicleSchema>;
export type Dealer = z.infer<typeof DealerSchema>;
export type VehicleGroup = z.infer<typeof GroupSchema>;

// ── Core GraphQL client ──────────────────────────────────────────────────────

export class GraphQLClientError extends Error {
  constructor(
    message: string,
    public readonly graphqlErrors?: { message: string }[],
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "GraphQLClientError";
  }
}

async function executeQuery<T>(
  query: string,
  variables: Record<string, unknown>,
  operationName: string
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const body = JSON.stringify({ query, variables, operationName });

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "apollographql-client-name": CLIENT_NAME,
        "apollographql-client-version": CLIENT_VERSION,
        "x-apollo-operation-name": operationName,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new GraphQLClientError(
        `HTTP ${response.status}: ${response.statusText}`,
        undefined,
        response.status
      );
    }

    const json = (await response.json()) as T;
    return json;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof GraphQLClientError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new GraphQLClientError(
        `Request timed out after ${REQUEST_TIMEOUT_MS}ms`
      );
    }
    throw new GraphQLClientError(`Network error: ${String(err)}`);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface InventorySearchInput {
  searchQuery: string;
  market?: "US" | "CA";
  language?: string;
  sort?: string;
  dealerId?: string;
}

export async function searchInventory(input: InventorySearchInput) {
  const { INVENTORY_SEARCH_QUERY } = await import("./queries.js");

  const variables = {
    input: {
      searchQuery: input.searchQuery,
      market: input.market ?? "US",
      language: input.language ?? "EN",
      ...(input.sort ? { sort: input.sort } : {}),
      ...(input.dealerId ? { dealerId: input.dealerId } : {}),
    },
  };

  const raw = await executeQuery<unknown>(
    INVENTORY_SEARCH_QUERY,
    variables,
    "InventorySearch"
  );

  const parsed = InventorySearchResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GraphQLClientError(
      `Unexpected response shape: ${parsed.error.message}`
    );
  }

  if (parsed.data.errors?.length) {
    const msgs = parsed.data.errors.map((e) => e.message).join("; ");
    throw new GraphQLClientError(`GraphQL errors: ${msgs}`, parsed.data.errors);
  }

  const groups = parsed.data.data?.inventorySearch?.groups ?? [];
  return groups;
}

export interface CarlineIdentifier {
  country: string;
  language: string;
}

export async function fetchCarlines(identifier: CarlineIdentifier) {
  const { CARLINES_QUERY } = await import("./queries.js");

  const raw = await executeQuery<unknown>(
    CARLINES_QUERY,
    { identifier },
    "Carlines"
  );

  const parsed = CarlinesResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GraphQLClientError(
      `Unexpected carlines response: ${parsed.error.message}`
    );
  }
  if (parsed.data.errors?.length) {
    const msgs = parsed.data.errors.map((e) => e.message).join("; ");
    throw new GraphQLClientError(`GraphQL errors: ${msgs}`);
  }
  return parsed.data.data?.carlines ?? [];
}

export async function fetchCarlineStructure(identifier: CarlineIdentifier) {
  const { CARLINE_STRUCTURE_QUERY } = await import("./queries.js");

  const raw = await executeQuery<unknown>(
    CARLINE_STRUCTURE_QUERY,
    { identifier },
    "CarlineStructure"
  );

  const parsed = CarlineStructureResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GraphQLClientError(
      `Unexpected carlineStructure response: ${parsed.error.message}`
    );
  }
  if (parsed.data.errors?.length) {
    const msgs = parsed.data.errors.map((e) => e.message).join("; ");
    throw new GraphQLClientError(`GraphQL errors: ${msgs}`);
  }
  return parsed.data.data?.carlineStructure?.carlineGroups ?? [];
}
