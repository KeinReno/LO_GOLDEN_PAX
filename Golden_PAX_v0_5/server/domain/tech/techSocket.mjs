import { canAffordCost } from "./afford.mjs";
import { adjustStock } from "../economy/adjustStock.mjs";
import { resolveTechDef } from "./resolveTechDef.mjs";

/**
 * NOT a port — new design (notes/2026-08-14-tech-tree-redesign-grill.md Q7,
 * TECH_TREE_2_INTEGRATION_SPEC.md Priority 1). A researched tech may declare
 * a `socket` lookup (resource id → structural effect). Filling is instant,
 * one-time spend, permanent until replaced. Replacing with a different
 * resource costs the new option's price again — no ongoing drain.
 *
 * Socket state is per-tech on the faction techAccount (empire-wide), not
 * per-building/planet. First-pass fill cost is `currency.metal: 10` when
 * the option doesn't specify `fillCost` — revisit with content authoring.
 */

export const DEFAULT_SOCKET_FILL_COST = { "currency.metal": 10 };

export function socketOptions(def) {
  const socket = def?.socket;
  if (!socket || typeof socket !== "object" || Array.isArray(socket)) return null;
  return socket;
}

export function fillCostForOption(option) {
  if (option?.fillCost && typeof option.fillCost === "object") return option.fillCost;
  return DEFAULT_SOCKET_FILL_COST;
}

/**
 * Currently slotted structural effects for a faction. Callers (flow
 * contribution) consume this list — they should not re-read tech defs.
 */
export function activeSocketEffects(techAccount, content) {
  const out = [];
  const unlocked = new Set(techAccount?.unlockedTechs || []);
  for (const [techId, resourceId] of Object.entries(techAccount?.techSockets || {})) {
    if (!unlocked.has(techId) || !resourceId) continue;
    const def = resolveTechDef(content, techId);
    const option = socketOptions(def)?.[resourceId];
    if (!option) continue;
    out.push({ techId, resourceId, ...option });
  }
  return out;
}

function spendCost(factionId, stocks, cost, reason, techId) {
  let nextStocks = stocks;
  const journal = [];
  for (const [currencyId, amount] of Object.entries(cost || {})) {
    const n = Number(amount || 0);
    if (!n) continue;
    const result = adjustStock({ factionId, stocks: nextStocks }, currencyId, -n, { reason, intentId: techId });
    nextStocks = result.stocks;
    if (result.journalEntry) journal.push(result.journalEntry);
  }
  return { stocks: nextStocks, journal };
}

/**
 * Fill or replace a tech's resource socket. Overwrite is allowed (pay again).
 * @returns {{ ok: true, techAccount, stocks, journal } | { ok: false, error: string }}
 */
export function fillTechSocket(techAccount, techId, resourceId, stocks, content) {
  const def = resolveTechDef(content, techId);
  if (!def) return { ok: false, error: "unknown tech" };
  if (!(techAccount?.unlockedTechs || []).includes(techId)) {
    return { ok: false, error: "tech not researched" };
  }
  const options = socketOptions(def);
  if (!options) return { ok: false, error: "tech has no socket" };
  const option = options[resourceId];
  if (!option) return { ok: false, error: "resource is not a valid socket option" };

  const cost = fillCostForOption(option);
  const afford = canAffordCost(stocks, cost);
  if (!afford.ok) return afford;

  const spent = spendCost(techAccount.factionId, stocks, cost, "fill_tech_socket", techId);
  const techSockets = { ...(techAccount.techSockets || {}), [techId]: resourceId };
  return {
    ok: true,
    techAccount: { ...techAccount, techSockets },
    stocks: spent.stocks,
    journal: spent.journal,
  };
}
