import { extractFiltersFromQuery } from "../src/mapping.js";

describe("extractFiltersFromQuery", () => {
  test("passes through a plain model query unchanged", () => {
    const result = extractFiltersFromQuery("Audi Q5");
    expect(result.lifestyleTerms).toHaveLength(0);
    expect(result.enhancedQuery).toBe("Audi Q5");
  });

  test("maps 'elektrisch' to BEV vehicleType", () => {
    const result = extractFiltersFromQuery("ein elektrisches Fahrzeug unter 60000");
    expect(result.vehicleTypes).toContain("BEV");
    expect(result.lifestyleTerms).toContain("elektrisch");
  });

  test("maps 'electric' to BEV vehicleType", () => {
    const result = extractFiltersFromQuery("electric SUV");
    expect(result.vehicleTypes).toContain("BEV");
  });

  test("maps 'hybrid' to PHEV vehicleType", () => {
    const result = extractFiltersFromQuery("hybrid Q3 unter 35000");
    expect(result.vehicleTypes).toContain("PHEV");
    expect(result.lifestyleTerms).toContain("hybrid");
  });

  test("maps 'Familienauto' to family bodyTypes and series hints", () => {
    const result = extractFiltersFromQuery("Ich suche ein Familienauto unter 40000");
    expect(result.bodyTypes).toEqual(
      expect.arrayContaining(["Avant", "allroad quattro", "SUV"])
    );
    expect(result.seriesHints).toEqual(
      expect.arrayContaining(["A5", "A6", "Q5"])
    );
    expect(result.lifestyleTerms).toContain("familienauto");
  });

  test("maps 'sportlich' to sporty series prefixes and sportscar bodyType", () => {
    const result = extractFiltersFromQuery("sportliches Auto unter 50000");
    expect(result.bodyTypes).toEqual(
      expect.arrayContaining(["sportscar", "Sportback"])
    );
    expect(result.lifestyleTerms).toContain("sportlich");
  });

  test("maps 'kompakt' to compact series hints", () => {
    const result = extractFiltersFromQuery("kompaktes Auto");
    expect(result.seriesHints).toEqual(
      expect.arrayContaining(["A1", "A3", "Q2", "Q3"])
    );
  });

  test("maps 'SUV' to SUV bodyTypes", () => {
    const result = extractFiltersFromQuery("SUV mit viel Platz");
    expect(result.bodyTypes).toContain("SUV");
  });

  test("maps 'kombi' to Avant bodyType", () => {
    const result = extractFiltersFromQuery("einen Kombi für die Familie");
    expect(result.bodyTypes).toContain("Avant");
  });

  test("maps 'ev' to BEV vehicleType", () => {
    const result = extractFiltersFromQuery("EV with low mileage");
    // case-insensitive
    expect(result.vehicleTypes).toContain("BEV");
  });

  test("enhances query with vehicle type context", () => {
    const result = extractFiltersFromQuery("elektrisches Auto");
    expect(result.enhancedQuery).toContain("BEV");
  });

  test("does not enhance query when too many series hints (ambiguous)", () => {
    // 'Familienauto' has 8 series hints, so they should NOT be appended to avoid over-constraining
    const result = extractFiltersFromQuery("Familienauto");
    // With more than 4 series hints, the enhancedQuery should not list them
    const hintCount = result.seriesHints.length;
    if (hintCount > 4) {
      expect(result.enhancedQuery).not.toContain("models:");
    }
  });

  test("handles multiple lifestyle terms in one query", () => {
    const result = extractFiltersFromQuery("sportliches elektrisches Familienauto");
    expect(result.vehicleTypes).toContain("BEV");
    expect(result.bodyTypes).toEqual(
      expect.arrayContaining(["sportscar", "Sportback"])
    );
    expect(result.lifestyleTerms.length).toBeGreaterThanOrEqual(2);
  });

  test("is case-insensitive for German terms", () => {
    const lower = extractFiltersFromQuery("familienauto");
    const upper = extractFiltersFromQuery("FAMILIENAUTO");
    expect(lower.lifestyleTerms).toHaveLength(upper.lifestyleTerms.length);
    expect(lower.bodyTypes).toEqual(upper.bodyTypes);
  });
});
