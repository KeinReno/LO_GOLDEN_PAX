import { getCachedContent } from "./contentCatalog";
import type { Planet } from "./types";

export const MAX_PLANET_GRADE = 5;
const DEFAULT_SURFACE = [8, 18, 28, 38, 48];
const DEFAULT_ORBITAL = [4, 6, 8, 10, 12];
const DEFAULT_COST: Array<Record<string, number> | null> = [
  null,
  { "currency.metal": 30, "currency.supply": 15 },
  { "currency.metal": 60, "currency.supply": 30 },
  { "currency.metal": 100, "currency.supply": 50 },
  { "currency.metal": 160, "currency.supply": 80 },
];

function cfg() {
  return (getCachedContent()?.economy_balance as {
    planetGrade?: {
      surfaceSlots?: number[];
      orbitalSlots?: number[];
      upgradeCost?: Array<Record<string, number> | null>;
    };
  } | undefined)?.planetGrade;
}

function clamp(grade: number) {
  const n = Math.floor(Number(grade) || 1);
  return Math.max(1, Math.min(MAX_PLANET_GRADE, n));
}

function pick(table: number[] | undefined, fallback: number[], grade: number) {
  const src = Array.isArray(table) && table.length >= MAX_PLANET_GRADE ? table : fallback;
  return Number(src[clamp(grade) - 1]) || fallback[0];
}

export function planetSurfaceGrade(planet: Planet) {
  return clamp(planet.grade ?? 1);
}

export function planetOrbitalGrade(planet: Planet) {
  return clamp(planet.orbitalGrade ?? 1);
}

export function surfaceSlotsForGrade(grade: number) {
  return pick(cfg()?.surfaceSlots, DEFAULT_SURFACE, grade);
}

export function orbitalSlotsForGrade(grade: number) {
  return pick(cfg()?.orbitalSlots, DEFAULT_ORBITAL, grade);
}

export function gradeUpgradeCost(currentGrade: number) {
  const g = clamp(currentGrade);
  if (g >= MAX_PLANET_GRADE) return null;
  const table = cfg()?.upgradeCost;
  if (Array.isArray(table) && table[g]) return table[g];
  return DEFAULT_COST[g];
}
