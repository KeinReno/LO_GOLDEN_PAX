/**
 * Quest one-shot effect costing + application (stocks, loyalty, intel,
 * recipes, tech grants, lasting activeEffects).
 * Extracted from ../questEngine.mjs.
 */
import { getContent } from "../contentLoader.mjs";
import { adjustStock, ensureFactionEco, readLedger, writeLedger } from "../ledger.mjs";
import { setKnowledgeLevel } from "../intel.mjs";
import { grantRecipe } from "../alchemyActions.mjs";
import { applyUnlockEffects } from "../techActions.mjs";
import { factionById } from "./queryHelpers.mjs";

/**
 * Compute negative stock spends required by quest effects.
 */
export function stockCostsFromEffects(effects) {
  /** @type {Record<string, number>} */
  const need = {};
  for (const e of effects || []) {
    if (
      (e.effect === "upkeep_flat" || e.effect === "production_flat") &&
      e.args?.resource
    ) {
      const delta = Number(e.args.amount || 0);
      if (delta < 0) {
        const id = String(e.args.resource);
        need[id] = (need[id] || 0) + Math.abs(delta);
      }
    }
  }
  return need;
}

function canAffordQuestCosts(factionId, effects) {
  const need = stockCostsFromEffects(effects);
  const keys = Object.keys(need);
  if (!keys.length) return { ok: true };
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  for (const [currencyId, amt] of Object.entries(need)) {
    const stock = Number(eco.stocks?.[currencyId] ?? 0);
    if (stock < amt) {
      return {
        ok: false,
        error: `Недостаточно ${currencyId.replace(/^currency\./, "")} (нужно ${amt}, есть ${stock})`,
      };
    }
  }
  return { ok: true };
}

/**
 * Apply one-shot quest effects (stocks + soft loyalty). Continuous stack channels
 * are recorded on faction.activeEffects for A3/economy consumers.
 */
export function applyQuestEffects(world, factionId, effects, meta = {}) {
  const afford = canAffordQuestCosts(factionId, effects);
  if (!afford.ok) return { applied: [], notes: [], error: afford.error, ok: false };
  const list = Array.isArray(effects) ? effects : [];
  if (!list.length) return { applied: [], notes: [] };
  const faction = factionById(world, factionId);
  const turn = meta.turn ?? world.meta?.turn ?? 0;
  const ledger = readLedger();
  ensureFactionEco(ledger, factionId);
  const applied = [];
  const notes = [];

  for (const e of list) {
    if (!e?.effect) continue;
    const args = e.args || {};
    if (e.effect === "loyalty_add") {
      if (faction) {
        if (!faction.loyaltyByRace || typeof faction.loyaltyByRace !== "object") {
          faction.loyaltyByRace = {};
        }
        const key = args.raceId || "*";
        const prev = Number(faction.loyaltyByRace[key] ?? faction.loyalty ?? 50);
        const next = Math.max(0, Math.min(100, prev + Number(args.amount || 0)));
        faction.loyaltyByRace[key] = next;
        if (!args.raceId) faction.loyalty = next;
        applied.push(e);
        notes.push(`loyalty ${key}: ${prev}→${next}`);
      }
      continue;
    }
    if (e.effect === "grant_intel") {
      const entityType = args.entityType || args.type || "faction";
      const entityId = args.entityId || args.id;
      const level = Number(args.level ?? 2);
      if (entityId) {
        setKnowledgeLevel(factionId, entityType, entityId, level, {
          source: "quest",
          turn,
        });
        applied.push(e);
        notes.push(`intel ${entityType}:${entityId}→${level}`);
      }
      continue;
    }
    if (e.effect === "grant_recipe") {
      const recipeId = args.recipeId || args.id;
      if (recipeId) {
        const gr = grantRecipe(factionId, recipeId, { ledger });
        if (gr.ok) {
          applied.push(e);
          notes.push(
            gr.added
              ? `рецепт «${gr.recipe.name}»`
              : `рецепт «${gr.recipe.name}» (уже был)`,
          );
        } else {
          notes.push(`рецепт: ${gr.error}`);
        }
      }
      continue;
    }
    if (e.effect === "grant_tech") {
      const techId = args.techId || args.id;
      if (techId) {
        const content = getContent();
        const def =
          content.technologies?.[techId] || content.tech_combos?.[techId];
        const eco = ensureFactionEco(ledger, factionId);
        if (!def) {
          notes.push(`tech неизвестен: ${techId}`);
        } else if ((eco.unlockedTechs || []).includes(techId)) {
          applied.push(e);
          notes.push(`tech уже есть: ${def.name}`);
        } else {
          if (!Array.isArray(eco.unlockedTechs)) eco.unlockedTechs = [];
          eco.unlockedTechs.push(techId);
          applyUnlockEffects(eco, def.effects || []);
          applied.push(e);
          notes.push(`tech «${def.name}»`);
        }
      }
      continue;
    }
    if (
      (e.effect === "upkeep_flat" || e.effect === "production_flat") &&
      args.resource
    ) {
      const delta =
        e.effect === "upkeep_flat"
          ? Number(args.amount || 0)
          : Number(args.amount || 0);
      // upkeep_flat amount negative in catalog = spend; positive production = grant
      adjustStock(ledger, factionId, args.resource, delta, {
        turn,
        reason: meta.reason || "quest_effect",
        intentId: meta.intentId || null,
      });
      applied.push(e);
      notes.push(`${args.resource} ${delta >= 0 ? "+" : ""}${delta}`);
      continue;
    }
    // Lasting / unknown — stash on faction for ModifierStack consumers
    if (faction) {
      if (!Array.isArray(faction.activeEffects)) faction.activeEffects = [];
      faction.activeEffects.push({
        ...e,
        expiresTurn:
          e.expiresTurn != null
            ? Number(e.expiresTurn)
            : turn + 10,
        source: {
          kind: "quest",
          id: meta.questId || "quest",
          label: meta.label || "Квест",
        },
      });
      applied.push(e);
      notes.push(`activeEffect:${e.effect}`);
    }
  }

  writeLedger(ledger);
  return { applied, notes };
}
