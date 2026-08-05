/**
 * Instant forces deck mutations: composition + stock deltas + force reserve.
 * Positive stock deltas are capped by composition diff (no free minting).
 */
import {
  adjustStock,
  ensureAllFactions,
  ensureFactionEco,
  getFactionPublicEco,
  publicEconomyPayload,
  readLedger,
  writeLedger,
} from "./ledger.mjs";
import { writeLiveBoard } from "./tableStore.mjs";
import { getContent } from "./contentLoader.mjs";
import { forgeMetalCost, disbandMetalRefund } from "./forceEconomy.mjs";

const METAL = "currency.metal";

/** Canonical id for composition/reserve counting (defId preferred, resolve display names). */
function resolveUnitKey(g) {
  if (!g || typeof g !== "object") return "";
  const raw = String(g.defId || g.type || "").trim();
  if (!raw) return "";
  if (g.defId) return raw;
  const content = getContent();
  const pools = [
    content.ships,
    content.units,
    content.ground_units,
  ];
  for (const pool of pools) {
    if (!pool) continue;
    if (pool[raw]) return raw;
    for (const def of Object.values(pool)) {
      if (!def || typeof def !== "object") continue;
      if (def.id === raw || def.name === raw) return String(def.id || raw);
    }
  }
  return raw;
}

function slotNeedForRole(group, role) {
  const content = getContent();
  const defId = group?.defId || group?.type;
  const def =
    content.ships?.[defId] ||
    content.units?.[defId] ||
    content.ground_units?.[defId];
  const slot = (def?.slots || []).find((s) => s.role === role);
  return Math.max(1, Number(slot?.count) || 1);
}

function normalizeGroup(g) {
  if (!g || typeof g !== "object") return null;
  const count = Math.max(0, Math.floor(Number(g.count) || 0));
  if (count <= 0) return null;
  const out = {
    type: String(g.type || g.defId || "unit"),
    count,
  };
  if (g.defId) out.defId = String(g.defId);
  if (g.hp != null && !isNaN(Number(g.hp))) out.hp = Math.max(0, Number(g.hp));
  if (g.xp != null && !isNaN(Number(g.xp))) out.xp = Math.max(0, Number(g.xp));
  if (g.level != null && !isNaN(Number(g.level))) out.level = Math.max(0, Number(g.level));
  if (g.filledSlots && typeof g.filledSlots === "object") {
    out.filledSlots = { ...g.filledSlots };
  }
  return out;
}

function normalizeComposition(composition) {
  if (!Array.isArray(composition)) return [];
  return composition.map(normalizeGroup).filter(Boolean);
}

function sumCount(comp) {
  return (comp || []).reduce((s, g) => s + (Number(g.count) || 0), 0);
}

function sumLevelUps(prev, next) {
  let ups = 0;
  const n = Math.max((prev || []).length, (next || []).length);
  for (let i = 0; i < n; i++) {
    const la = Number(prev?.[i]?.level) || 0;
    const lb = Number(next?.[i]?.level) || 0;
    if (lb > la) ups += lb - la;
  }
  return ups;
}

/** Count stacks whose HP was restored toward max (repair zone). */
function sumRepairs(prev, next) {
  let n = 0;
  const len = Math.max((prev || []).length, (next || []).length);
  for (let i = 0; i < len; i++) {
    const a = prev?.[i];
    const b = next?.[i];
    if (!a || !b) continue;
    const ha = a.hp;
    const hb = b.hp;
    if (ha == null || hb == null) continue;
    if (Number(hb) > Number(ha) + 0.5) n += 1;
  }
  return n;
}

/**
 * Veterancy is battle-earned only — clamp level/xp so clients cannot buy ranks.
 */
function clampVeterancy(prevComp, nextComp) {
  return (nextComp || []).map((g, i) => {
    const p = prevComp?.[i];
    if (!p) return g;
    const out = { ...g };
    const prevLv = Number(p.level) || 0;
    const prevXp = Number(p.xp) || 0;
    if ((Number(out.level) || 0) > prevLv) {
      out.level = prevLv;
      out.xp = prevXp;
    }
    if ((Number(out.xp) || 0) > prevXp && (Number(out.level) || 0) <= prevLv) {
      // Allow xp within same level only if not exceeding; keep prev if jumped with level buy
      if ((Number(g.level) || 0) > prevLv) out.xp = prevXp;
    }
    return out;
  });
}

/** Resource units locked in filledSlots (respects slot.count). */
function fillCounts(comp) {
  const bag = {};
  for (const g of comp || []) {
    for (const [role, v] of Object.entries(g.filledSlots || {})) {
      if (!v) continue;
      const id = String(v);
      const need = slotNeedForRole(g, role);
      bag[id] = (bag[id] || 0) + need;
    }
  }
  return bag;
}

function reserveAmt(eco, currencyId) {
  const raw = eco.stockReserves?.[currencyId];
  return Math.max(
    0,
    Math.floor(
      Number(raw?.amount ?? (typeof raw === "number" ? raw : 0)) || 0,
    ),
  );
}

/**
 * Validate / clamp client stockDeltas against composition change.
 * Allows spends; caps refunds to disband metal + unequipped modules.
 */
function sanitizeStockDeltas(prevComp, nextComp, prevReserve, nextReserve, clientDeltas) {
  const prevCounts = {};
  for (const g of [...prevComp, ...prevReserve]) {
    const id = resolveUnitKey(g);
    if (!id) continue;
    prevCounts[id] = (prevCounts[id] || 0) + (g.count || 0);
  }
  const nextCounts = {};
  for (const g of [...nextComp, ...nextReserve]) {
    const id = resolveUnitKey(g);
    if (!id) continue;
    nextCounts[id] = (nextCounts[id] || 0) + (g.count || 0);
  }
  
  let removed = 0;
  for (const [id, nextCount] of Object.entries(nextCounts)) {
    const prevCount = prevCounts[id] || 0;
    if (nextCount > prevCount) {
      return { ok: false, error: `Нельзя создавать юниты напрямую (${id})` };
    }
  }
  for (const [id, prevCount] of Object.entries(prevCounts)) {
    const nextCount = nextCounts[id] || 0;
    if (prevCount > nextCount) {
      removed += prevCount - nextCount;
    }
  }

  if (sumLevelUps(prevComp, nextComp) > 0) {
    return {
      ok: false,
      error: "Ранг ветерана только из боёв (нельзя купить металлом)",
    };
  }
  const repairs = sumRepairs(prevComp, nextComp);
  const prevFills = fillCounts(prevComp);
  const nextFills = fillCounts(nextComp);
  const maxRefund = { [METAL]: disbandMetalRefund() * removed };
  for (const id of Object.keys(prevFills)) {
    const d = (prevFills[id] || 0) - (nextFills[id] || 0);
    if (d > 0) maxRefund[id] = (maxRefund[id] || 0) + d;
  }
  const minSpend = { [METAL]: forgeMetalCost() * repairs };
  for (const id of Object.keys(nextFills)) {
    const d = (nextFills[id] || 0) - (prevFills[id] || 0);
    if (d > 0) minSpend[id] = (minSpend[id] || 0) + d;
  }

  const out = {};
  const src = clientDeltas && typeof clientDeltas === "object" ? clientDeltas : {};

  // Start from server-expected deltas
  for (const [k, v] of Object.entries(minSpend)) {
    if (v) out[k] = (out[k] || 0) - v;
  }
  for (const [k, v] of Object.entries(maxRefund)) {
    if (v) out[k] = (out[k] || 0) + v;
  }

  // Merge client: allow equal/lower refunds, allow spends matching or covered by stock check later
  for (const [currencyId, delta] of Object.entries(src)) {
    const d = Number(delta) || 0;
    if (!d) continue;
    if (d > 0) {
      const cap = Math.max(0, Number(maxRefund[currencyId] || 0));
      if (d > cap) {
        return {
          ok: false,
          error: `Недопустимый прирост ${currencyId.replace(/^currency\./, "")} (+${d})`,
        };
      }
      out[currencyId] = d; // client refund within cap
    } else {
      // Spend: prefer client value (equip/repair may batch)
      out[currencyId] = d;
    }
  }

  return { ok: true, deltas: out };
}

/**
 * @param {{
 *   world: object,
 *   factionId: string,
 *   kind: "fleet" | "legion",
 *   id: string,
 *   composition: object[],
 *   stockDeltas?: Record<string, number>,
 *   forceReserve?: object[] | null,
 * }} opts
 */
export function applyForcesMutate(opts) {
  const {
    world,
    factionId,
    kind,
    id,
    composition,
    stockDeltas = {},
    forceReserve = undefined,
  } = opts;
  if (!world) return { ok: false, error: "Нет мира" };
  if (!factionId) return { ok: false, error: "Нет фракции" };
  if (!id) return { ok: false, error: "Нет id флота/легиона" };
  if (kind !== "fleet" && kind !== "legion") {
    return { ok: false, error: "kind: fleet|legion" };
  }

  const listKey = kind === "fleet" ? "fleets" : "legions";
  const units = world[listKey] ?? [];
  const unit = units.find((u) => u.id === id);
  if (!unit) return { ok: false, error: `${kind} не найден` };
  if (unit.factionId !== factionId) {
    return { ok: false, error: "Чужой флот/легион" };
  }

  const prevComp = normalizeComposition(unit.composition || []);
  const nextRaw = normalizeComposition(composition);
  if (sumLevelUps(prevComp, nextRaw) > 0) {
    return {
      ok: false,
      error: "Ранг ветерана только из боёв (нельзя купить металлом)",
    };
  }
  const nextComp = clampVeterancy(prevComp, nextRaw);
  const turn = world.meta?.turn ?? 0;
  const ledger = ensureAllFactions(readLedger(), world);
  const eco = ensureFactionEco(ledger, factionId);

  const prevReserve = normalizeComposition(eco.forceReserve || []);
  const nextReserve = forceReserve !== undefined ? normalizeComposition(forceReserve || []) : prevReserve;

  const sanitized = sanitizeStockDeltas(prevComp, nextComp, prevReserve, nextReserve, stockDeltas);
  if (!sanitized.ok) return sanitized;
  const deltas = sanitized.deltas || {};

  for (const [currencyId, delta] of Object.entries(deltas)) {
    const d = Number(delta) || 0;
    if (d >= 0) continue;
    const stock = Number(eco.stocks?.[currencyId] ?? 0);
    const available = Math.max(0, stock - reserveAmt(eco, currencyId));
    if (available + d < 0) {
      return {
        ok: false,
        error: `Недостаточно ${currencyId.replace(/^currency\./, "")} (доступно ${available})`,
      };
    }
  }

  for (const [currencyId, delta] of Object.entries(deltas)) {
    const d = Number(delta) || 0;
    if (!d) continue;
    adjustStock(ledger, factionId, currencyId, d, {
      turn,
      reason: "forces_mutate",
      intentId: `${kind}:${id}`,
    });
  }

  if (forceReserve !== undefined) {
    eco.forceReserve = nextReserve;
  }

  unit.composition = nextComp;
  if (kind === "legion") {
    unit.strength = nextComp.reduce((s, g) => s + (g.count || 0), 0);
  }

  writeLedger(ledger);
  writeLiveBoard(world, { backup: false, reason: "forces_mutate" });

  const pub = getFactionPublicEco(factionId);
  return {
    ok: true,
    unit,
    kind,
    id,
    economy: publicEconomyPayload(pub),
    forceReserve: Array.isArray(pub.forceReserve)
      ? pub.forceReserve.map((g) => ({ ...g }))
      : [],
  };
}
