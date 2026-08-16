/**
 * Client mirror of server/techGrades.mjs + techSockets.mjs.
 * UI reads content flags; never hardcodes tech ids.
 */
import type { TechnologyDef } from "./contentCatalog";
import { getCachedContent } from "./contentCatalog";
import type { ViewerPayload } from "./types";

export const MAX_TECH_GRADE = 5;
export const DEFAULT_GRADE_MAGNITUDE = [1, 1.15, 1.3, 1.5, 1.75];
export const DEFAULT_SOCKET_FILL_COST: Record<string, number> = {
  "currency.metal": 10,
};

const DEFAULT_UPGRADE_COST: Array<Record<string, number> | null> = [
  null,
  { "currency.cognitio": 20 },
  { "currency.cognitio": 40 },
  { "currency.cognitio": 70 },
  { "currency.cognitio": 110 },
];

type Eco = NonNullable<ViewerPayload["economy"]>;

export function isGradeable(def: TechnologyDef | undefined | null): boolean {
  if (!def) return false;
  if (def.gradeable === true) return true;
  const table = def.gradeTable;
  if (Array.isArray(table) && table.length > 0) return true;
  if (table && Array.isArray(table.magnitude) && table.magnitude.length > 0) return true;
  return false;
}

function clampGrade(grade: number): number {
  const n = Math.floor(Number(grade) || 1);
  return Math.max(1, Math.min(MAX_TECH_GRADE, n));
}

export function factionTechGrade(eco: Eco | undefined, techId: string): number {
  if (!(eco?.unlockedTechs || []).includes(techId)) return 0;
  const stored = eco?.techGrades?.[techId];
  if (stored == null) return 1;
  return clampGrade(stored);
}

export function gradeEffectMagnitude(
  def: TechnologyDef | undefined | null,
  grade: number,
): number {
  if (!isGradeable(def)) return 1;
  const g = clampGrade(grade);
  const table =
    Array.isArray(def?.gradeTable?.magnitude) &&
    (def?.gradeTable?.magnitude?.length || 0) >= MAX_TECH_GRADE
      ? def!.gradeTable!.magnitude!
      : DEFAULT_GRADE_MAGNITUDE;
  const n = Number(table[g - 1]);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function gradeUpgradeCost(
  currentGrade: number,
  def: TechnologyDef | undefined | null,
): Record<string, number> | null {
  const g = clampGrade(currentGrade);
  if (g >= MAX_TECH_GRADE) return null;
  const table = def?.gradeTable?.upgradeCost;
  if (Array.isArray(table) && table[g]) return table[g] as Record<string, number>;
  return DEFAULT_UPGRADE_COST[g];
}

export function socketOptions(def: TechnologyDef | undefined | null) {
  const socket = def?.socket;
  if (!socket || typeof socket !== "object") return null;
  return socket;
}

export function hasSocket(def: TechnologyDef | undefined | null): boolean {
  const socket = socketOptions(def);
  return Boolean(socket && Object.keys(socket).length);
}

export function fillCostForOption(
  option: { fillCost?: Record<string, number> } | undefined,
): Record<string, number> {
  if (option?.fillCost && typeof option.fillCost === "object") return option.fillCost;
  return DEFAULT_SOCKET_FILL_COST;
}

export function resourceLabel(resourceId: string): string {
  return getCachedContent()?.map_resources?.[resourceId]?.name || resourceId;
}
