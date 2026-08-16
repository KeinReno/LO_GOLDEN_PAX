/**
 * Collect court-origin modifier effects (occupied seats + active postings +
 * NPC traits + optional ungoverned-system loyalty penalty + non-expired
 * npc_task activeEffects).
 *
 * Collection shape is a plain-data port of GMap/server/courtGovernance.mjs
 * `syncNpcPassiveEffects` (clone + source attribution + scope/targetId).
 * This project does not write them onto a mutable `faction.activeEffects`
 * bag — callers feed the returned list into `buildModifierStack`.
 *
 * Consumers in this pass (see COURT_AND_NPC_ROSTER_SPEC.md Part 4):
 *   production_mult  → domain/planets/flowIncome.mjs Pass 4 (faction-scope)
 *   stat_mult        → domain/combat/resolveExchange.mjs (before rolePower)
 *   pop_growth_mult  → domain/economy/populationGrowth.mjs
 *   npc_task_speed_mult → domain/court/npcTasks.mjs (read directly)
 *   stability_add    → domain/court/stability.mjs
 *   move_cost_mult   → domain/forces/movement.mjs (opts.effects)
 *
 * Produced but NOT consumed (honest scope cut, not a silent ignore):
 *   loyalty_add   — no loyalty accumulator exists (schema.sql has zero
 *                   loyalty columns; cultureFaith.mjs only produces a
 *                   plain effect list). Includes governor
 *                   ungovernedLoyaltyPenalty.
 */
import { npcAvailable } from "./npcRoster.mjs";
import { isSeatUnlocked, resolveOccupiedSeatBonus } from "./councilSeats.mjs";
import { postingEffects, postingTarget, systemHasGovernor } from "./postings.mjs";

function cloneEffects(list) {
  if (!Array.isArray(list)) return [];
  return list.map((e) => ({
    effect: e.effect,
    args: e.args ? { ...e.args } : undefined,
  }));
}

export function factionScopeEffects(effects) {
  return (effects ?? []).filter((e) => (e.scope || "faction") === "faction");
}

/**
 * @param {{ council?: object, activeEffects?: object[], rulerNpcId?: string }} faction
 * @param {object[]} npcs
 * @param {object} content
 * @param {{ systems?: object[], turn?: number }} [opts]
 */
export function collectCourtActiveEffects(faction, npcs, content, opts = {}) {
  const traitCatalog = content?.npc_traits?.traits || {};
  const turn = opts.turn;
  const out = [];

  for (const npc of npcs ?? []) {
    if (!npcAvailable(npc)) continue;
    const target = postingTarget(npc);

    for (const traitId of npc.traitIds ?? []) {
      const def = traitCatalog[traitId];
      if (!def) continue;
      const source = {
        kind: "npc_trait",
        id: `${npc.id}:${traitId}`,
        label: `${npc.name}: ${def.name || traitId}`,
      };
      for (const e of cloneEffects(def.effects)) {
        out.push({ ...e, source, scope: "faction" });
      }
      if (target && (def.scope === "both" || Array.isArray(def.postingEffects))) {
        const local = cloneEffects(def.postingEffects?.length ? def.postingEffects : def.effects);
        for (const e of local) {
          out.push({ ...e, source, scope: target.scope, targetId: target.targetId });
        }
      }
    }

    if (npc.posting && npc.posting.kind !== "court") {
      out.push(...postingEffects(npc, content));
    }

    if (npc.councilSeat && isSeatUnlocked(faction, npc.councilSeat, content)) {
      const bonus = resolveOccupiedSeatBonus(faction, npc.councilSeat, content);
      if (bonus.effects.length) {
        const source = {
          kind: "council_seat",
          id: `${npc.id}:${npc.councilSeat}`,
          label: `${npc.name}: ${bonus.label}`,
        };
        for (const e of cloneEffects(bonus.effects)) {
          out.push({ ...e, source, scope: "faction" });
        }
      }
    }
  }

  // Ungoverned penalty: produced, not consumed (loyalty_add — see header).
  const penalty = Number(content?.npc_postings?.postings?.governor?.ungovernedLoyaltyPenalty ?? 0);
  if (penalty > 0 && opts.systems) {
    const factionId = opts.factionId ?? faction?.id;
    for (const sys of opts.systems) {
      if (factionId && sys.ownerFactionId !== factionId) continue;
      const pop = (sys.planets ?? []).reduce((s, p) => s + (p.population || 0), 0);
      if (pop <= 0) continue;
      if (systemHasGovernor(npcs, sys.id)) continue;
      out.push({
        effect: "loyalty_add",
        args: { amount: -penalty },
        scope: "system",
        targetId: sys.id,
        source: { kind: "ungoverned", id: sys.id, label: `ungoverned:${sys.id}` },
      });
    }
  }

  for (const e of faction?.activeEffects ?? []) {
    const kind = e?.source?.kind;
    if (kind === "npc_trait" || kind === "npc_posting" || kind === "council_seat" || kind === "ungoverned") {
      continue;
    }
    if (turn != null && e.expiresTurn != null && Number(e.expiresTurn) <= turn) continue;
    out.push(e);
  }

  return out;
}
