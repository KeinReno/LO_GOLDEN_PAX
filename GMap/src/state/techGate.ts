/**
 * Client mirror of server/techActions.mjs — keep in sync:
 * BASE_PROPERTIES, factionHasProperty, collectRequiredProperties, canBuildWithTech.
 */

export type TechEcoSlice = {
  techTiers?: Record<string, number>;
  unlockedProperties?: string[];
};

const BASE_PROPERTIES = new Set([
  "strong",
  "malleable",
  "fuel",
  "energy",
  "toxic",
  "weapon",
]);

export function factionHasProperty(
  eco: TechEcoSlice | undefined,
  prop: string,
): boolean {
  if (BASE_PROPERTIES.has(prop)) return true;
  return (eco?.unlockedProperties || []).includes(prop);
}

type BuildingDefLike = {
  category?: string;
  tier?: number;
  slots?: Array<{ require?: { properties?: string[] } }>;
  effects?: Array<{ effect: string; args?: Record<string, unknown> }>;
};

/** Construction slots only; excludes properties unlocked by the building itself. */
export function collectRequiredProperties(
  buildingDef: BuildingDefLike,
): Set<string> {
  const props = new Set<string>();
  for (const slot of buildingDef?.slots || []) {
    for (const p of slot.require?.properties || []) props.add(p);
  }
  for (const e of buildingDef?.effects || []) {
    if (e.effect === "unlock_property" && e.args?.property) {
      props.delete(String(e.args.property));
    }
  }
  return props;
}

function factionMaxTier(
  eco: TechEcoSlice | undefined,
  category: string,
): number {
  if (!eco?.techTiers) return 1;
  return Number(eco.techTiers[category] ?? 1);
}

export function canBuildWithTech(
  eco: TechEcoSlice | undefined,
  buildingDef: BuildingDefLike,
): { ok: boolean; error?: string } {
  if (buildingDef?.category) {
    const need = Number(buildingDef.tier) || 1;
    const max = Math.max(3, factionMaxTier(eco, buildingDef.category) + 1);
    if (need > max) {
      return {
        ok: false,
        error: `Нужен tier ${buildingDef.category}≥${need - 1} (сейчас ${factionMaxTier(eco, buildingDef.category)})`,
      };
    }
  }

  const required = collectRequiredProperties(buildingDef);
  for (const prop of required) {
    if (!factionHasProperty(eco, prop)) {
      return { ok: false, error: `Нужно свойство: ${prop}` };
    }
  }
  return { ok: true };
}

/** Whether slot fill is allowed for a resource (property gate on intersection). */
export function canFillResourceProperties(
  eco: TechEcoSlice | undefined,
  slotProperties: string[] | undefined,
  resourceProperties: string[],
): { ok: boolean; error?: string } {
  for (const p of slotProperties || []) {
    if (!resourceProperties.includes(p)) continue;
    if (!factionHasProperty(eco, p)) {
      return { ok: false, error: `Нужно свойство: ${p}` };
    }
  }
  return { ok: true };
}
