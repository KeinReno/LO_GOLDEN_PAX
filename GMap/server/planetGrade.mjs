/**
 * Earned planet slot-grade 1–5 (v0.5 P4a).
 *
 * NOT a port — new design from notes/2026-08-13-galaxy-migration-grill.md
 * (Q3/3a/3b/3c). GMap never had a slot-expansion mechanic: surfaceSlots /
 * orbitalSlots were static hand-placed numbers (capitals at 118/24). This
 * module is the earned ladder that replaces those unearned counts.
 *
 * Surface 8→48 over 5 grades; orbital 4→12 on a separate counter. Both
 * advance via planet action `upgrade_grade` (currency + 1 AP). Grade is
 * the source of truth; stored slot fields are denormalized.
 *
 * Starting grade for published worlds (no rewrite of published.json):
 * smallest grade whose slots fit the current building count (Q3c). Capitals
 * are not a special static exception — colonyType does not grant slots.
 *
 * Slot tables / costs live in economy_balance.planetGrade. Arrays below
 * are documented first-pass defaults when content is omitted.
 */

export const MAX_GRADE = 5;

/** First-pass even steps: 8 / 18 / 28 / 38 / 48. Easy to invert by search. */
const DEFAULT_SURFACE_SLOTS = [8, 18, 28, 38, 48];
/** First-pass even steps on a smaller scale: 4 / 6 / 8 / 10 / 12. */
const DEFAULT_ORBITAL_SLOTS = [4, 6, 8, 10, 12];
/** First-pass costs for steps 1→2, 2→3, 3→4, 4→5. Index 0 unused. */
const DEFAULT_UPGRADE_COST = [
  null,
  { "currency.metal": 30, "currency.supply": 15 },
  { "currency.metal": 60, "currency.supply": 30 },
  { "currency.metal": 100, "currency.supply": 50 },
  { "currency.metal": 160, "currency.supply": 80 },
];

export function clampGrade(grade) {
  const n = Math.floor(Number(grade) || 1);
  return Math.max(1, Math.min(MAX_GRADE, n));
}

function slotTable(content, key, fallback) {
  const table = content?.economy_balance?.planetGrade?.[key];
  return Array.isArray(table) && table.length >= MAX_GRADE ? table : fallback;
}

export function surfaceSlotsForGrade(grade, content) {
  const table = slotTable(content, "surfaceSlots", DEFAULT_SURFACE_SLOTS);
  return Number(table[clampGrade(grade) - 1]) || DEFAULT_SURFACE_SLOTS[0];
}

export function orbitalSlotsForGrade(orbitalGrade, content) {
  const table = slotTable(content, "orbitalSlots", DEFAULT_ORBITAL_SLOTS);
  return Number(table[clampGrade(orbitalGrade) - 1]) || DEFAULT_ORBITAL_SLOTS[0];
}

/**
 * Smallest grade whose surfaceSlots >= `needed`. Caps at MAX_GRADE.
 * Used to stamp published capitals without rewriting published.json.
 */
export function smallestGradeForSurfaceSlots(needed, content) {
  const n = Math.max(0, Number(needed) || 0);
  for (let g = 1; g <= MAX_GRADE; g++) {
    if (surfaceSlotsForGrade(g, content) >= n) return g;
  }
  return MAX_GRADE;
}

/** Same invert for the orbital curve (4→12). Caps at MAX_GRADE. */
export function smallestGradeForOrbitalSlots(needed, content) {
  const n = Math.max(0, Number(needed) || 0);
  for (let g = 1; g <= MAX_GRADE; g++) {
    if (orbitalSlotsForGrade(g, content) >= n) return g;
  }
  return MAX_GRADE;
}

export function gradeUpgradeCost(currentGrade, content) {
  const g = clampGrade(currentGrade);
  if (g >= MAX_GRADE) return null;
  const table = content?.economy_balance?.planetGrade?.upgradeCost;
  if (Array.isArray(table) && table[g]) return table[g];
  return DEFAULT_UPGRADE_COST[g];
}

/**
 * Runtime derive: if grade is unset, earn starting grade from building
 * count (not from the old static slot number). Always write denormalized
 * slot caps from grade. Does not touch population.
 */
export function derivedGradeFields(planet, content) {
  const surfaceCount = (planet?.surfaceBuildings ?? []).length;
  const orbitalCount = (planet?.orbitalBuildings ?? []).length;
  const grade =
    planet?.grade != null
      ? clampGrade(planet.grade)
      : smallestGradeForSurfaceSlots(surfaceCount, content);
  const orbitalGrade =
    planet?.orbitalGrade != null
      ? clampGrade(planet.orbitalGrade)
      : smallestGradeForOrbitalSlots(orbitalCount, content);
  return {
    grade,
    orbitalGrade,
    surfaceSlots: surfaceSlotsForGrade(grade, content),
    orbitalSlots: orbitalSlotsForGrade(orbitalGrade, content),
  };
}

export function zoneSlotCap(planet, listKey, content) {
  if (listKey === "orbitalBuildings") {
    return planet?.orbitalGrade != null
      ? orbitalSlotsForGrade(planet.orbitalGrade, content)
      : (planet?.orbitalSlots ?? 4);
  }
  return planet?.grade != null
    ? surfaceSlotsForGrade(planet.grade, content)
    : (planet?.surfaceSlots ?? 8);
}

/**
 * Plan a one-step upgrade. Does not mutate and does not spend.
 * `zone` is "surface" | "orbital".
 */
export function gradeUpgradePlan(planet, zone, content) {
  const isOrbital = zone === "orbital";
  const key = isOrbital ? "orbitalGrade" : "grade";
  const current = clampGrade(planet?.[key] ?? 1);
  if (current >= MAX_GRADE) {
    return { ok: false, error: `Максимальный грейд (${isOrbital ? "орбита" : "поверхность"})` };
  }
  const cost = gradeUpgradeCost(current, content);
  const next = current + 1;
  return {
    ok: true,
    key,
    next,
    cost,
    surfaceSlots: isOrbital
      ? surfaceSlotsForGrade(clampGrade(planet?.grade ?? 1), content)
      : surfaceSlotsForGrade(next, content),
    orbitalSlots: isOrbital
      ? orbitalSlotsForGrade(next, content)
      : orbitalSlotsForGrade(clampGrade(planet?.orbitalGrade ?? 1), content),
  };
}
