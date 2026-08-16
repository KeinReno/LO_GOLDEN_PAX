/**
 * Client mirror of server/laborAllocation + populationScale for inspect UI.
 * Tick still uses the server; keep the pin/auto rules in sync.
 */
import { getCachedContent } from "./contentCatalog";
import type { Planet, PlanetBuilding } from "./types";

type LaborDef = {
  kind?: string;
  category?: string;
  laborSlots?: number;
  tier?: number;
  extractsCategory?: unknown;
  extractsDeposits?: unknown;
  effects?: Array<{ effect?: string }>;
};

const FLOW_EFFECTS = new Set([
  "yield_flat",
  "production_flat",
  "flow_convert",
  "capacity_add",
]);

const OCCUPATION_KINDS = new Set([
  "mine",
  "farm",
  "lab",
  "institute",
  "factory",
  "forge",
  "barracks",
  "defense",
  "fortress",
  "shield",
  "shipyard",
  "spaceport",
  "capitol",
  "trade",
  "monument",
  "relay",
  "platform",
  "vat",
  "vault",
]);

function asList(value: unknown): unknown[] {
  if (value == null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

export function laborSlotsForDef(def: LaborDef | null | undefined): number {
  const explicit = Number(def?.laborSlots);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const tier = Number(def?.tier);
  return Math.max(1, Number.isFinite(tier) && tier > 0 ? tier : 1);
}

export function consumesLabor(def: LaborDef | null | undefined): boolean {
  if (!def) return false;
  if (def.kind === "residential" || def.kind === "habitat") return false;
  if (def.kind && OCCUPATION_KINDS.has(def.kind)) return true;
  if (def.kind === "mine") return true;
  if (Object.prototype.hasOwnProperty.call(def, "extractsCategory")) return true;
  if (asList(def.extractsDeposits).length > 0) return true;
  if (["factory", "lab", "farm"].includes(def.kind || "")) return true;
  return (def.effects || []).some((e) => FLOW_EFFECTS.has(String(e.effect || "")));
}

export function assignedLaborOf(inst: PlanetBuilding | null | undefined): number | null {
  if (!inst || !Object.prototype.hasOwnProperty.call(inst, "assignedLabor")) {
    return null;
  }
  const raw: unknown = (inst as { assignedLabor?: unknown }).assignedLabor;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

export function laborPopulation(planet: Planet): number {
  const n = Math.max(0, Number(planet?.population) || 0);
  if (n <= 0) return 0;
  const raw = getCachedContent()?.economy_balance?.population as
    | { censusPerLaborUnit?: number; censusThreshold?: number }
    | undefined;
  const per = Math.max(1, Number(raw?.censusPerLaborUnit) || 1000);
  const threshold = Math.max(1, Number(raw?.censusThreshold) || 10_000);
  const census = planet.censusLocked === true || n >= threshold;
  if (!census) return Math.floor(n);
  return Math.floor(n / per);
}

export function censusPerLaborUnit(): number {
  const raw = getCachedContent()?.economy_balance?.population as
    | { censusPerLaborUnit?: number }
    | undefined;
  return Math.max(1, Number(raw?.censusPerLaborUnit) || 1000);
}

function laborKey(b: PlanetBuilding, index: number): string {
  if (b?.id != null && String(b.id) !== "") return String(b.id);
  return `#${index}`;
}

function resolveDef(
  catalog: Record<string, LaborDef>,
  b: PlanetBuilding,
): LaborDef | undefined {
  if (b.buildingId && catalog[b.buildingId]) return catalog[b.buildingId];
  if (catalog[b.id]) return catalog[b.id];
  return Object.values(catalog).find(
    (d) => d.kind === b.kind,
  );
}

function planetBuildingList(planet: Planet): PlanetBuilding[] {
  return [
    ...(planet.surfaceBuildings || []),
    ...(planet.orbitalBuildings || []),
  ];
}

/** laborKey → staffed fraction 0..1 */
export function allocateLabor(
  planet: Planet,
  catalog: Record<string, LaborDef>,
): Record<string, number> {
  const buildings = planetBuildingList(planet);
  let remaining = laborPopulation(planet);
  const staffing: Record<string, number> = {};

  const visit = (pinnedOnly: boolean) => {
    buildings.forEach((b, i) => {
      if (b?.disabled) return;
      const def = resolveDef(catalog, b);
      if (!consumesLabor(def)) return;
      const key = laborKey(b, i);
      const pin = assignedLaborOf(b);
      if (pinnedOnly && pin == null) return;
      if (!pinnedOnly && pin != null) return;
      const need = laborSlotsForDef(def);
      const want = pin == null ? need : Math.min(need, pin);
      if (remaining <= 0 || want <= 0) {
        staffing[key] = 0;
        return;
      }
      const used = Math.min(want, remaining);
      staffing[key] = need > 0 ? used / need : 0;
      remaining -= used;
    });
  };

  visit(true);
  visit(false);
  return staffing;
}

export function buildingStaffedUnits(
  planet: Planet,
  inst: PlanetBuilding,
  catalog: Record<string, LaborDef>,
): { staffed: number; slots: number; pinned: boolean; free: number } {
  const def = resolveDef(catalog, inst);
  const slots = consumesLabor(def) ? laborSlotsForDef(def) : 0;
  const staffing = allocateLabor(planet, catalog);
  const buildings = planetBuildingList(planet);
  const index = buildings.findIndex((b) => b.id === inst.id);
  const frac = index >= 0 ? staffing[laborKey(inst, index)] ?? 0 : 0;
  const staffed = slots > 0 ? slots * frac : 0;
  let usedTotal = 0;
  buildings.forEach((b, i) => {
    const d = resolveDef(catalog, b);
    if (!consumesLabor(d)) return;
    const f = staffing[laborKey(b, i)] ?? 0;
    usedTotal += laborSlotsForDef(d) * f;
  });
  return {
    staffed,
    slots,
    pinned: assignedLaborOf(inst) != null,
    free: Math.max(0, laborPopulation(planet) - usedTotal),
  };
}

const OCCUPATION_BY_KIND: Record<string, string> = {
  mine: "workers",
  farm: "farmers",
  lab: "scientists",
  institute: "scientists",
  factory: "industrial",
  forge: "industrial",
  barracks: "military",
  defense: "military",
  fortress: "military",
  shield: "military",
  shipyard: "naval",
  spaceport: "naval",
  capitol: "administrators",
  trade: "administrators",
  monument: "administrators",
  relay: "operators",
  platform: "operators",
  vat: "biologists",
  vault: "archivists",
};

export function occupationForDef(def: LaborDef | null | undefined): string {
  if (!def) return "workers";
  if (def.kind && OCCUPATION_BY_KIND[def.kind]) return OCCUPATION_BY_KIND[def.kind];
  if (def.category === "F") return "scientists";
  if (def.category === "E") return "farmers";
  if (def.category === "A") return "workers";
  if (def.category === "C") return "industrial";
  if (def.category === "D") return "operators";
  if (def.category === "B") return "industrial";
  return "workers";
}

export function planetLaborSummary(
  planet: Planet,
  catalog: Record<string, LaborDef>,
): {
  labor: number;
  used: number;
  free: number;
  slots: number;
  open: number;
  pulse: boolean;
} {
  const labor = laborPopulation(planet);
  const staffing = allocateLabor(planet, catalog);
  const buildings = planetBuildingList(planet);
  let used = 0;
  let slots = 0;
  buildings.forEach((b, i) => {
    const d = resolveDef(catalog, b);
    if (!consumesLabor(d)) return;
    const need = laborSlotsForDef(d);
    slots += need;
    used += need * (staffing[laborKey(b, i)] ?? 0);
  });
  const free = Math.max(0, labor - used);
  const open = Math.max(0, slots - used);
  return {
    labor,
    used,
    free,
    slots,
    open,
    pulse: free > 0 && open > 0,
  };
}
