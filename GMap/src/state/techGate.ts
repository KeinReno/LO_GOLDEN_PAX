import { getCachedContent } from "./contentCatalog";

/**
 * Client mirror of server/techActions.mjs — keep in sync:
 * BASE_PROPERTIES, factionHasProperty, collectRequiredProperties, canBuildWithTech.
 */

export type TechEcoSlice = {
  techTiers?: Record<string, number>;
  unlockedProperties?: string[];
  unlockedLineages?: string[];
  roleScores?: Record<string, number>;
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
  requireProperties?: string[];
  requireRoleMilestone?: string;
  slots?: Array<{ fillOnly?: boolean; require?: { properties?: string[] } }>;
  effects?: Array<{ effect: string; args?: Record<string, unknown> }>;
  extra_effects?: Array<{ effect: string; args?: Record<string, unknown> }>;
};

/** Construction slots only; excludes fill-only slots and self-unlocks. */
export function collectRequiredProperties(
  buildingDef: BuildingDefLike,
): Set<string> {
  const props = new Set<string>();
  for (const p of buildingDef?.requireProperties || []) props.add(p);
  for (const slot of buildingDef?.slots || []) {
    if (slot.fillOnly) continue;
    for (const p of slot.require?.properties || []) props.add(p);
  }
  for (const e of [
    ...(buildingDef?.effects || []),
    ...(buildingDef?.extra_effects || []),
  ]) {
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

  const milestoneRole = buildingDef?.requireRoleMilestone;
  if (typeof milestoneRole === "string" && milestoneRole.trim()) {
    const roleId = milestoneRole.trim();
    const content = getCachedContent();
    const ms = content?.role_milestones?.[roleId];
    const need =
      Number(ms?.threshold) ||
      Number(content?.economy_schema?.role_score_pilot?.thresholds?.[roleId]) ||
      0;
    const score = Number(eco?.roleScores?.[roleId]) || 0;
    if (need > 0 && score < need) {
      const label = ms?.label || roleId;
      return {
        ok: false,
        error: `Нужен RoleScore «${label}»: ${score}/${need}`,
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

export type TechHint = {
  techId: string;
  techName: string;
  reason: string;
};

/**
 * Find a technology that would unlock building construction
 * (tier raise or missing property). Used for System → Science jump.
 */
export function techHintForBuilding(
  eco: TechEcoSlice | undefined,
  buildingDef: BuildingDefLike,
  technologies: Record<
    string,
    {
      id?: string;
      name?: string;
      catalogPending?: boolean;
      alchemyOnly?: boolean;
      effects?: Array<{ effect: string; args?: Record<string, unknown> }>;
    }
  >,
): TechHint | null {
  const gate = canBuildWithTech(eco, buildingDef);
  if (gate.ok) return null;

  const needTier: { category: string; to: number }[] = [];
  if (buildingDef?.category) {
    const need = Number(buildingDef.tier) || 1;
    const max = Math.max(3, factionMaxTier(eco, buildingDef.category) + 1);
    if (need > max) {
      needTier.push({
        category: buildingDef.category,
        to: Math.max(1, need - 1),
      });
    }
  }

  const missingProps = [...collectRequiredProperties(buildingDef)].filter(
    (p) => !factionHasProperty(eco, p),
  );

  for (const tech of Object.values(technologies || {})) {
    if (tech.catalogPending || tech.alchemyOnly) continue;
    for (const e of tech.effects || []) {
      if (e.effect === "unlock_tech_tier") {
        const cat = String(e.args?.category ?? "");
        const to = Number(e.args?.to ?? 0);
        if (
          needTier.some((n) => n.category === cat && to >= n.to)
        ) {
          return {
            techId: tech.id ?? "",
            techName: tech.name ?? "",
            reason: `Нужна технология: ${tech.name ?? "—"}`,
          };
        }
      }
      if (e.effect === "unlock_property") {
        const prop = String(e.args?.property ?? "");
        if (missingProps.includes(prop)) {
          return {
            techId: tech.id ?? "",
            techName: tech.name ?? "",
            reason: `Нужна технология: ${tech.name ?? "—"}`,
          };
        }
      }
    }
  }

  return {
    techId: "",
    techName: "",
    reason: gate.error || "Нужна технология",
  };
}
