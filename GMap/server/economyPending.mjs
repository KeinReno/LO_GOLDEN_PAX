/**
 * Merge queued economy intents into the public economy slice so refresh
 * does not wipe optimistic tax / doctrine / flow / reserve UI.
 */
import { readIntents } from "./intents.mjs";
import { readLiveBoard } from "./tableStore.mjs";

export const ECONOMIC_POLICY_PRESETS = {
  military: {
    label: "Военная экономика",
    taxes: {
      "tax.materia": "high",
      "tax.energia": "low",
      "tax.bios": "none",
    },
  },
  trade: {
    label: "Торговая экспансия",
    taxes: {
      "tax.materia": "low",
      "tax.energia": "none",
      "tax.bios": "none",
    },
  },
  growth: {
    label: "Мирный рост",
    taxes: {
      "tax.materia": "none",
      "tax.energia": "none",
      "tax.bios": "none",
    },
  },
};

/**
 * @param {string} factionId
 * @param {number | null | undefined} currentTurn — only intents for this turn
 * @returns {{
 *   taxes: Record<string, string>,
 *   economicPolicy: string | null,
 *   flowPriorities: Record<string, { from: string, to: string, edge: string }>,
 *   stockReserves: Record<string, { amount: number, label: string, _clear?: boolean }>,
 * }}
 */
export function pendingEconomyFromIntents(factionId, currentTurn) {
  const taxes = {};
  let economicPolicy = null;
  const flowPriorities = {};
  const stockReserves = {};

  const turn =
    currentTurn != null
      ? Number(currentTurn)
      : (readLiveBoard()?.meta?.turn ?? null);

  for (const intent of readIntents()) {
    if (intent.factionId !== factionId || intent.status !== "pending") continue;
    // Match processTurn filter — ignore zombie intents from other turns.
    if (turn != null && intent.turn != null && Number(intent.turn) !== turn) {
      continue;
    }
    const p = intent.payload || {};

    if (intent.defId === "intent.set_tax") {
      const slot = String(p.taxSlot || "");
      const tierId = String(p.tierId || "");
      if (slot && tierId) taxes[slot] = tierId;
    }

    if (intent.defId === "intent.set_economic_policy") {
      const policyId = String(p.policyId || "");
      const preset = ECONOMIC_POLICY_PRESETS[policyId];
      if (preset) {
        economicPolicy = policyId;
        Object.assign(taxes, preset.taxes);
      }
    }

    if (intent.defId === "intent.set_flow_priority") {
      const from = String(p.from || "").toUpperCase();
      const to = String(p.to || "").toUpperCase();
      const systemId = p.systemId ? String(p.systemId) : "_faction";
      if (from && to && from !== to) {
        flowPriorities[systemId] = { from, to, edge: `${from}->${to}` };
      }
    }

    if (intent.defId === "intent.reserve_stock") {
      const currencyId = String(p.currencyId || "");
      const amount = Math.floor(Number(p.amount) || 0);
      const label = String(p.label || "резерв").slice(0, 48);
      if (currencyId) {
        if (amount <= 0) {
          stockReserves[currencyId] = { amount: 0, label, _clear: true };
        } else {
          stockReserves[currencyId] = { amount, label };
        }
      }
    }
  }

  return { taxes, economicPolicy, flowPriorities, stockReserves };
}

/** Overlay pending intent state onto a publicEconomyPayload result. */
export function enrichEconomyWithPendingIntents(factionId, economy, currentTurn) {
  if (!economy || !factionId) return economy;
  const pending = pendingEconomyFromIntents(factionId, currentTurn);
  const taxes = {
    ...(economy.pendingPolicy?.taxes || {}),
    ...pending.taxes,
  };
  const flowPriorities = {
    ...(economy.flowPriorities || {}),
    ...pending.flowPriorities,
  };
  const stockReserves = { ...(economy.stockReserves || {}) };
  for (const [id, row] of Object.entries(pending.stockReserves)) {
    if (row._clear || row.amount <= 0) delete stockReserves[id];
    else stockReserves[id] = { amount: row.amount, label: row.label };
  }

  return {
    ...economy,
    pendingPolicy: {
      ...(economy.pendingPolicy || {}),
      taxes,
    },
    flowPriorities,
    stockReserves,
    economicPolicy: pending.economicPolicy ?? economy.economicPolicy ?? null,
  };
}
