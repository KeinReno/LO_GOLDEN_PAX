/**
 * stability_add → planet loyalty (loyalty.mjs). Occupation `planet.stability`
 * is a separate revolt meter (stabilityRevolt.mjs) and is not added here.
 * Formula: loyalty += sum(stability_add.amount) on this planet (clamp 0–100).
 */
import {
  buildModifierStack,
  collectRaceEffects,
  resolvePlanetRaceComposition,
} from "./modifierStack.mjs";
import {
  collectCultureEffects,
  primaryRaceFromComposition,
  resolvePlanetCultureId,
} from "./cultureFaith.mjs";
import { collectSystemPoiEffects } from "./narrative.mjs";

const EFFECT = "stability_add";

function onlyStability(list) {
  return (list || []).filter((e) => e?.effect === EFFECT);
}

function planetBuildings(planet) {
  return [
    ...(planet?.surfaceBuildings ?? []),
    ...(planet?.orbitalBuildings ?? []),
    ...(planet?.buildings ?? []),
  ];
}

function buildingDef(content, inst) {
  const id = inst?.buildingId || inst?.kind || inst?.id;
  if (!id) return null;
  const buildings = content?.buildings || {};
  const raw = buildings[id];
  if (!raw) return null;
  if (raw.base && buildings[raw.base]) {
    return {
      ...buildings[raw.base],
      ...raw,
      id: raw.id || id,
      effects: [
        ...(buildings[raw.base].effects || []),
        ...(raw.extra_effects || []),
        ...(raw.effects || []),
      ],
    };
  }
  return raw;
}

function traitCatalogEntry(content, traitId) {
  return (
    content?.faction_traits?.traits?.[traitId] ||
    content?.faction_traits?.[traitId] ||
    null
  );
}

/**
 * Planet-scoped + faction-scoped stability_add instances for one world.
 * System-scoped court/quest actives apply only when targetId matches.
 */
export function collectPlanetStabilityEffects(world, system, planet, content) {
  const ownerId = planet?.ownerFactionId || system?.ownerFactionId || null;
  const faction = ownerId
    ? (world.factions ?? []).find((f) => f.id === ownerId) ?? null
    : null;
  const turn = world?.meta?.turn ?? 0;
  const effects = [];

  const composition = resolvePlanetRaceComposition(planet, faction);
  effects.push(
    ...onlyStability(
      collectRaceEffects(content?.races, composition, {
        factionId: ownerId || undefined,
        turn,
      }),
    ),
  );

  const cultureId = resolvePlanetCultureId(planet, faction);
  effects.push(
    ...onlyStability(
      collectCultureEffects(content, cultureId, {
        raceId: primaryRaceFromComposition(composition),
      }),
    ),
  );

  for (const b of planetBuildings(planet)) {
    const def = buildingDef(content, b);
    if (!def?.effects?.length) continue;
    for (const e of def.effects) {
      if (e?.effect !== EFFECT) continue;
      effects.push({
        ...e,
        source: {
          kind: "building",
          id: def.id || b.buildingId || b.kind,
          label: def.name || def.id,
        },
      });
    }
  }

  effects.push(...onlyStability(collectSystemPoiEffects(system, content)));

  for (const trait of faction?.traits || []) {
    const traitId = typeof trait === "string" ? trait : trait.id;
    const fromCatalog =
      typeof trait === "string" ? traitCatalogEntry(content, trait) : null;
    const list =
      fromCatalog?.effects ||
      (typeof trait === "object" ? trait.effects : null) ||
      [];
    const label = fromCatalog?.name || traitId;
    for (const e of list) {
      if (e?.effect !== EFFECT) continue;
      effects.push({
        ...e,
        source: { kind: "faction_trait", id: traitId, label },
      });
    }
  }

  for (const e of faction?.activeEffects ?? []) {
    if (e?.effect !== EFFECT) continue;
    const scope = e.scope || "faction";
    if (scope === "legion" || scope === "fleet") continue;
    if (scope === "system" && e.targetId !== system.id) continue;
    if (scope !== "faction" && scope !== "system") continue;
    effects.push(e);
  }

  return effects;
}

/** Flat loyalty delta from stacked stability_add. 1 amount = 1 loyalty. */
export function stabilityLoyaltyDelta(world, system, planet, content) {
  const stack = buildModifierStack(
    collectPlanetStabilityEffects(world, system, planet, content),
  );
  const n = Number(stack.channels?.stability?.flat ?? 0);
  return Number.isFinite(n) ? n : 0;
}
