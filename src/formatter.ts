import type { Vehicle, VehicleGroup, Dealer } from "./graphql-client.js";

const MAX_VEHICLES_PER_RESPONSE = 10;
const MAX_GROUPS_IN_RESPONSE = 2;

function formatDealer(dealer?: Dealer): string {
  if (!dealer) return "Händler nicht angegeben";
  const parts = [dealer.name];
  if (dealer.region) parts.push(dealer.region);
  return parts.join(", ");
}

function formatOdometer(value?: number): string {
  if (value == null) return "k.A.";
  return value.toLocaleString("de-DE") + " km";
}

function formatVehicle(v: Vehicle, index: number): string {
  const lines: string[] = [
    `**${index + 1}. ${v.title}**`,
    v.modelName ? `   Modell: ${v.modelName}` : "",
    v.exteriorColor ? `   Farbe: ${v.exteriorColor}` : "",
    `   Laufleistung: ${formatOdometer(v.odometerValue)}`,
    v.stockType
      ? `   Typ: ${v.stockType === "USED" ? "Gebrauchtwagen" : v.stockType === "NEW" ? "Neuwagen" : v.stockType}`
      : "",
    `   Händler: ${formatDealer(v.dealer)}`,
    v.imageUrl ? `   Bild: ${v.imageUrl}` : "",
    v.vin ? `   VIN: ${v.vin}` : "",
    `   ID: ${v.id}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function formatSearchResults(
  groups: VehicleGroup[],
  userQuery: string,
  lifestyleTerms: string[]
): string {
  if (groups.length === 0) {
    return (
      `Keine Fahrzeuge für "${userQuery}" gefunden. ` +
      "Bitte verfeinern Sie Ihre Suche oder ändern Sie die Filterkriterien."
    );
  }

  const parts: string[] = [];

  // Header
  parts.push(`## Suchergebnisse für: "${userQuery}"`);
  if (lifestyleTerms.length > 0) {
    parts.push(
      `*Erkannte Begriffe: ${lifestyleTerms.join(", ")} → Filter automatisch angewendet*`
    );
  }
  parts.push("");

  let shownGroups = 0;
  let totalShown = 0;

  for (const group of groups) {
    if (shownGroups >= MAX_GROUPS_IN_RESPONSE) break;

    const vehiclesToShow = group.vehicles.slice(
      0,
      MAX_VEHICLES_PER_RESPONSE - totalShown
    );
    if (vehiclesToShow.length === 0) continue;

    parts.push(`### Gruppe (${group.totalCount} Treffer gesamt)`);
    vehiclesToShow.forEach((v, i) => {
      parts.push(formatVehicle(v, i));
      parts.push("");
    });

    if (group.totalCount > vehiclesToShow.length) {
      parts.push(
        `> *${group.totalCount - vehiclesToShow.length} weitere Fahrzeuge verfügbar. ` +
          "Verfeinern Sie die Suche (z.B. Farbe, Kilometerstand, Baujahr) für mehr spezifische Ergebnisse.*"
      );
    }

    totalShown += vehiclesToShow.length;
    shownGroups++;
  }

  if (totalShown === 0) {
    return (
      `Keine Fahrzeuge für "${userQuery}" gefunden. ` +
      "Bitte verfeinern Sie Ihre Suche."
    );
  }

  return parts.join("\n");
}

export function formatVehicleDetails(vehicle: Vehicle): string {
  const lines: string[] = [
    `# ${vehicle.title}`,
    "",
    `**Vollständiger Modellname:** ${vehicle.modelName ?? "k.A."}`,
    `**Baujahr:** ${vehicle.modelYear ?? "k.A."}`,
    `**Außenfarbe:** ${vehicle.exteriorColor ?? "k.A."}`,
    `**Laufleistung:** ${formatOdometer(vehicle.odometerValue)}`,
    `**Fahrzeugtyp:** ${
      vehicle.stockType === "USED"
        ? "Gebrauchtwagen"
        : vehicle.stockType === "NEW"
          ? "Neuwagen"
          : vehicle.stockType ?? "k.A."
    }`,
    "",
    "**Händler:**",
    `  Name: ${vehicle.dealer?.name ?? "k.A."}`,
    `  Region: ${vehicle.dealer?.region ?? "k.A."}`,
    `  Händler-ID: ${vehicle.dealer?.id ?? "k.A."}`,
    "",
    `**VIN:** ${vehicle.vin ?? "k.A."}`,
    `**Fahrzeug-ID:** ${vehicle.id}`,
    vehicle.imageUrl ? `\n**Bild:** ${vehicle.imageUrl}` : "",
  ];
  return lines.filter((l) => l !== undefined).join("\n");
}

export function formatModelsList(
  carlineGroups: Array<{
    id: string;
    name: string;
    carlines: Array<{
      name: string;
      modelYear: number;
      bodyType: { name: string };
      vehicleType: string;
    }>;
  }>
): string {
  if (carlineGroups.length === 0) {
    return "Keine Modelle verfügbar.";
  }

  const vehicleTypeLabel: Record<string, string> = {
    ICEV: "Verbrenner",
    BEV: "Elektro",
    PHEV: "Plug-in Hybrid",
    MHEV: "Mild-Hybrid",
  };

  const parts: string[] = ["## Verfügbare Audi-Modelle\n"];

  for (const group of carlineGroups) {
    parts.push(`### ${group.name}`);
    for (const carline of group.carlines) {
      const vType = vehicleTypeLabel[carline.vehicleType] ?? carline.vehicleType;
      parts.push(
        `- ${carline.name} (${carline.bodyType.name}, ${vType}, MY${carline.modelYear})`
      );
    }
    parts.push("");
  }

  return parts.join("\n");
}
