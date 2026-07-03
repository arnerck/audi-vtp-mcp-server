// GraphQL query definitions for the Audi omnigraph API

export const INVENTORY_SEARCH_QUERY = `
query InventorySearch($input: InventorySearchInput!) {
  inventorySearch(input: $input) {
    ... on InventorySearchSemanticPayload {
      groups {
        ... on InventorySearchSemanticGroupSuccess {
          totalCount
          vehicles {
            id
            vin
            title
            modelYear
            modelName
            exteriorColor
            odometerValue
            stockType
            imageUrl
            dealer {
              id
              name
              region
            }
          }
        }
      }
      warnings {
        __typename
      }
    }
  }
}
`.trim();

export const CARLINES_QUERY = `
query Carlines($identifier: CarlinesIdentifierInput!) {
  carlines(identifier: $identifier) {
    id
    name
  }
}
`.trim();

export const CARLINE_STRUCTURE_QUERY = `
query CarlineStructure($identifier: CarlineStructureIdentifierInput!) {
  carlineStructure(identifier: $identifier) {
    carlineGroups {
      id
      name
      carlines {
        name
        modelYear
        bodyType {
          name
        }
        vehicleType
      }
    }
  }
}
`.trim();
