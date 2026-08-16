import { adjustStock } from "../economy/adjustStock.mjs";
import { resolveTechDef } from "./resolveTechDef.mjs";
import { firstMissingPrerequisite } from "./prerequisites.mjs";
import { canAffordCost } from "./afford.mjs";
import { applyUnlockEffects } from "./unlockEffects.mjs";
import { checkTechLocks } from "./techLocks.mjs";
import {
  OFFER_BYPASS_COGNITIO_MULT,
  ensureOffers,
  regenerateDirectionOffer,
  techInOffer,
} from "./techOffers.mjs";

/**
 * Research a technology for a faction: check it isn't already unlocked,
 * check prerequisites, check race/property locks, check it's not a
 * placeholder, check affordability, spend cognitio (and any other listed
 * cost currency) via the same adjustStock used by domain/economy, unlock
 * the tech, apply its tier/property effects.
 *
 * Scoped like domain/economy's runEconomyTick (see that folder's README):
 * this is GMap's real researchTech flow with the parts that need the
 * unported world/faction-effects model removed — no tech/civic-path
 * gating (checkPathGate/RoleScore), no research_cost_mult modifier stack,
 * no hybrid-lineage checks, no world mutation for unit_upgrade effects,
 * no factionTraitLock (no `faction.traits` data source yet). Costs are the
 * raw content costs. race/property locks restored 2026-08-14 (see
 * techLocks.mjs and notes/2026-08-14-tech-tree-audit.md) — this project's
 * own audit found the tree had been fully open to every faction since the
 * port, not just missing the trait-lock piece.
 *
 * The `catalogPending` block is NOT a port — GMap itself ships 387 of 432
 * techs (89.6%) as auto-generated placeholder stubs (identical 1.02x
 * multipliers, `balanceBudget: 0`, flavor text literally saying "заглушка
 * до балансировки"). Their effect types (`production_mult`/`production_
 * flat`/`upkeep_mult`) are only ever consumed by GMap's real
 * `modifierStack.mjs`, which isn't ported here — meaning researching one
 * right now would spend real cognitio for a verified zero mechanical
 * effect. Refusing them outright (rather than silently letting them be a
 * no-op sink) until either the modifier stack lands or they get hand-
 * redesigned is a deliberate content decision, not a technical limitation
 * — see the audit notes for the alternatives considered.
 *
 * Offer/bypass (NOT a port — Tech Tree 2.0 Priority 3): a tech with a
 * `direction` tag is the efficient path when it's in that direction's
 * current 3-candidate offer; researching it outside the offer is still
 * allowed (prereqs permitting) at OFFER_BYPASS_COGNITIO_MULT (1.5,
 * first-pass) on the cognitio portion only. Techs with no `direction` are
 * not in the offer system and keep their listed cost. After a successful
 * research of a directed tech, that direction's offer regenerates.
 *
 * @param {{ unlockedTechs: string[], techTiers: object, unlockedProperties: string[] }} techAccount
 * @param {Record<string, number>} stocks
 * @param {string} techId
 * @param {object} content
 * @param {{ turn?: number, factionPlanets?: object[], rng?: () => number }} [meta]
 * @returns {{ ok: boolean, error?: string, techAccount?: object, stocks?: Record<string, number>, journal?: object[], offerBypass?: boolean }}
 */
export function researchTech(techAccount, stocks, techId, content, meta = {}) {
  const def = resolveTechDef(content, techId);
  if (!def) return { ok: false, error: "unknown tech" };

  if ((techAccount.unlockedTechs || []).includes(techId)) {
    return { ok: false, error: "already researched" };
  }

  const missingPre = firstMissingPrerequisite(def, techAccount.unlockedTechs);
  if (missingPre) {
    const preName = content.technologies?.[missingPre]?.name || missingPre;
    return { ok: false, error: `requires tech: ${preName}` };
  }

  const locks = checkTechLocks(def, techAccount, meta.factionPlanets, content);
  if (!locks.ok) return locks;

  if (def.catalogPending) {
    return { ok: false, error: "not yet available: placeholder tech pending redesign" };
  }

  let account = techAccount;
  if (def.direction) {
    account = ensureOffers(account, content, { rng: meta.rng, factionPlanets: meta.factionPlanets }).techAccount;
  }
  const inOffer = techInOffer(account, techId, def.direction);
  const offerBypass = Boolean(def.direction) && !inOffer;
  const cost = researchCost(def, offerBypass);

  const afford = canAffordCost(stocks, cost);
  if (!afford.ok) return afford;

  let nextStocks = stocks;
  const journal = [];
  for (const [currencyId, amount] of Object.entries(cost)) {
    const n = Number(amount || 0);
    if (!n) continue;
    const result = adjustStock(
      { factionId: account.factionId, stocks: nextStocks },
      currencyId,
      -n,
      { turn: meta.turn, reason: "research_spend", intentId: techId },
    );
    nextStocks = result.stocks;
    if (result.journalEntry) journal.push(result.journalEntry);
  }

  let nextAccount = {
    ...account,
    unlockedTechs: [...(account.unlockedTechs || []), techId],
  };
  nextAccount = applyUnlockEffects(nextAccount, def.effects);
  if (def.direction) {
    nextAccount = regenerateDirectionOffer(nextAccount, content, def.direction, meta.rng, meta.factionPlanets);
  }

  return { ok: true, techAccount: nextAccount, stocks: nextStocks, journal, tech: def, offerBypass };
}

function researchCost(def, offerBypass) {
  const cost = { ...(def.cost || {}) };
  if (!offerBypass) return cost;
  const cogn = Number(cost["currency.cognitio"] || 0);
  if (cogn) cost["currency.cognitio"] = Math.ceil(cogn * OFFER_BYPASS_COGNITIO_MULT);
  return cost;
}
