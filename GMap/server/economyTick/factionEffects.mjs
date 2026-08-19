/**
 * Collect the full modifier-stack input list for one faction's economy tick:
 * taxes, race/culture/faith effects, deficit/pressure penalties, POI/loyalty/
 * revolt/tech/law effects, treaties, faction traits, logistics, NPC court
 * active-effects, depot upkeep penalty.
 * Extracted from ../economyTick.mjs.
 */
import {
  collectRaceEffects,
  resolvePlanetRaceComposition,
} from "../modifierStack.mjs";
import {
  collectPoiEffects,
  ownedDepotSystemIds,
} from "../narrative.mjs";
import { collectTreatyEffects } from "../opinionTick.mjs";
import { factionScopedActiveEffects } from "../courtGovernance.mjs";
import { collectLoyaltyTierEffects } from "../loyalty.mjs";
import { collectRevoltProductionEffects } from "../stabilityRevolt.mjs";
import { collectTechModifierEffects } from "../techActions.mjs";
import { collectLawModifierEffects } from "../civicPaths.mjs";
import { filterPowerGatedEffects } from "../powerPaths.mjs";
import {
  collectCultureEffects,
  collectFaithEffects,
  resolvePlanetCultureId,
  resolvePlanetFaithShares,
  primaryRaceFromComposition,
} from "../cultureFaith.mjs";
import { applyLogisticsEffects } from "../logistics.mjs";
import { pruneActiveEffects } from "./helpers.mjs";

export function collectFactionEffects(world, factionId, eco, content, turn = 0) {
  const effects = [];
  const faction = world.factions?.find((f) => f.id === factionId) ?? null;
  const raceOpts = { factionId, turn };

  for (const [slot, tierId] of Object.entries(eco.taxes || {})) {
    const def = content.taxes?.[slot];
    if (!def || def.hidden || def.aliasOf) continue;
    const tier = def?.tiers?.find((t) => t.id === tierId);
    for (const e of tier?.effects || []) {
      effects.push({
        ...e,
        source: { kind: "tax", id: `${slot}:${tierId}`, label: def?.name },
      });
    }
  }

  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    for (const p of sys.planets ?? []) {
      if ((p.population ?? 0) <= 0) continue;
      effects.push(
        ...collectRaceEffects(
          content.races,
          resolvePlanetRaceComposition(p, faction),
          raceOpts,
        ),
      );
      const composition = resolvePlanetRaceComposition(p, faction);
      const cultureId = resolvePlanetCultureId(p, faction);
      const primaryRace = primaryRaceFromComposition(composition);
      effects.push(
        ...collectCultureEffects(content, cultureId, { raceId: primaryRace }),
      );
      effects.push(
        ...collectFaithEffects(
          content,
          resolvePlanetFaithShares(p, faction),
          eco,
        ),
      );
    }
  }

  if (eco.deficit === "low" && content.rules?.deficit?.lowPenalty === "ap_minus_1") {
    effects.push({
      effect: "ap_add",
      args: { amount: -1 },
      source: { kind: "deficit", id: "low", label: "Дефицит" },
    });
  }
  if (eco.deficit === "empty") {
    effects.push({
      effect: "forbid_intent",
      args: { intentId: "intent.build" },
      source: { kind: "deficit", id: "empty", label: "Пустая казна" },
    });
  }

  for (const th of content.rules?.tax?.pressureThresholds || []) {
    if ((eco.pressure ?? 0) >= (th.min ?? 99)) {
      for (const e of th.effects || []) {
        effects.push({
          ...e,
          source: {
            kind: "pressure",
            id: `p${th.min}`,
            label: "Налоговое давление",
          },
        });
      }
    }
  }

  effects.push(...collectPoiEffects(world, factionId, content));
  effects.push(...collectLoyaltyTierEffects(world, factionId, content));
  effects.push(...collectRevoltProductionEffects(world, factionId, content));
  effects.push(...collectTechModifierEffects(eco, content));
  effects.push(...collectLawModifierEffects(eco, content));

  if (faction) {
    effects.push(...collectTreatyEffects(faction));
  }

  // Faction doctrine traits (A1)
  for (const trait of faction?.traits || []) {
    const traitId = typeof trait === "string" ? trait : trait.id;
    const fromCatalog =
      typeof trait === "string"
        ? content.faction_traits?.traits?.[trait]
        : null;
    const effectsList =
      fromCatalog?.effects ||
      (typeof trait === "object" ? trait.effects : null) ||
      [];
    const label =
      (typeof trait === "object" && trait.label) ||
      fromCatalog?.name ||
      traitId;
    for (const e of effectsList) {
      effects.push({
        ...e,
        source: {
          kind: "faction",
          id: traitId,
          label,
        },
      });
    }
  }

  effects.push(...applyLogisticsEffects(world, factionId, content));

  // Completed NPC court tasks / quest lasting effects (A10) — prune first
  // Only faction-scoped actives enter the realm ModifierStack; system-scoped
  // apply via npcProductionMultForSystem / loyalty.
  if (faction) pruneActiveEffects(faction, turn);
  for (const e of factionScopedActiveEffects(faction)) {
    if (!e?.effect) continue;
    effects.push({
      ...e,
      source: e.source || {
        kind: "npc_task",
        id: e.effect,
        label: "Эффект двора",
      },
    });
  }

  if (
    ownedDepotSystemIds(world, factionId).length === 0 &&
    content.rules?.depot?.noDepotUpkeepMult
  ) {
    effects.push({
      effect: "upkeep_mult",
      args: {
        resource: "currency.supply",
        mult: content.rules.depot.noDepotUpkeepMult,
      },
      source: { kind: "depot", id: "missing", label: "Нет депо" },
    });
  }

  return filterPowerGatedEffects(effects, faction, content, eco);
}
