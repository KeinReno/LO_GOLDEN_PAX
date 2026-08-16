import { journalPush } from "./journal.mjs";
import {
  queueTaxChange,
  transferResources,
  marketConvert,
} from "../economyTick.mjs";
import { ECONOMIC_POLICY_PRESETS } from "../economyPending.mjs";
import {
  placeMarketOffer,
  cancelMarketOffer,
} from "../marketOrders.mjs";
import { breakTreaty, bumpOpinion } from "../opinionTick.mjs";
import { createDiploOffer } from "../diploOffers.mjs";
import {
  readLedger,
  writeLedger,
  ensureFactionEco,
  ensureAllFactions,
  adjustStock,
} from "../ledger.mjs";
import {
  getKnownFactionIds,
  getTradePartnerIds,
} from "../factionIntel.mjs";
import { resolveVisibleWithFog, readFog } from "../fogStore.mjs";
import { getContent } from "../contentLoader.mjs";
import { hopPath } from "../pathfinding.mjs";

export function applySetTax(world, intent, journal) {
  const slot = intent.payload?.taxSlot;
  const tierId = intent.payload?.tierId;
  const result = queueTaxChange(intent.factionId, slot, tierId);
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "set_tax_queued",
    intentId: intent.id,
    factionId: intent.factionId,
    taxSlot: slot,
    tierId,
    note: "применится со следующего тика",
  });
  return true;
}

const FLOW_CATS = new Set(["A", "B", "C", "D", "E", "F"]);

export function applySetFlowPriority(world, intent, journal) {
  const from = String(intent.payload?.from || "").toUpperCase();
  const to = String(intent.payload?.to || "").toUpperCase();
  const systemId = intent.payload?.systemId
    ? String(intent.payload.systemId)
    : "_faction";
  if (!FLOW_CATS.has(from) || !FLOW_CATS.has(to) || from === to) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "нужны разные категории A–F (from→to)",
    });
    return false;
  }
  if (systemId !== "_faction") {
    const sys = (world.systems ?? []).find((s) => s.id === systemId);
    if (!sys || sys.ownerFactionId !== intent.factionId) {
      journalPush(journal, {
        type: "reject",
        intentId: intent.id,
        reason: "система не принадлежит фракции",
      });
      return false;
    }
  }
  const ledger = ensureAllFactions(readLedger(), world);
  const eco = ensureFactionEco(ledger, intent.factionId);
  if (!eco.flowPriorities) eco.flowPriorities = {};
  eco.flowPriorities[systemId] = { from, to, edge: `${from}->${to}` };
  writeLedger(ledger);
  journalPush(journal, {
    type: "set_flow_priority",
    intentId: intent.id,
    factionId: intent.factionId,
    systemId,
    from,
    to,
  });
  return true;
}

export function applySendCaravan(world, intent, journal) {
  const currencyId = String(intent.payload?.currencyId || "");
  const amount = Math.floor(Number(intent.payload?.amount) || 0);
  const toSystemId = String(intent.payload?.toSystemId || "");
  let fromSystemId = String(intent.payload?.fromSystemId || "");
  if (!fromSystemId) {
    const cap = (world.systems ?? []).find(
      (s) => s.isCapital && s.ownerFactionId === intent.factionId,
    );
    fromSystemId = cap?.id ?? "";
    if (!fromSystemId) {
      const owned = (world.systems ?? []).find(
        (s) => s.ownerFactionId === intent.factionId,
      );
      fromSystemId = owned?.id ?? "";
    }
  }
  const to = (world.systems ?? []).find((s) => s.id === toSystemId);
  const from = (world.systems ?? []).find((s) => s.id === fromSystemId);
  if (!currencyId || amount <= 0 || !to || !from) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "нужны ресурс, количество и системы",
    });
    return false;
  }
  if (fromSystemId === toSystemId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "та же система",
    });
    return false;
  }
  const ownsDest =
    to.ownerFactionId === intent.factionId ||
    (to.coOwnerFactionIds ?? []).includes(intent.factionId);
  if (!ownsDest) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "доставка только в свою систему",
    });
    return false;
  }
  const ledger = ensureAllFactions(readLedger(), world);
  const eco = ensureFactionEco(ledger, intent.factionId);
  const stock = Number(eco.stocks?.[currencyId] ?? 0);
  if (amount > stock) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: `недостаточно запаса (есть ${stock})`,
    });
    return false;
  }
  adjustStock(ledger, intent.factionId, currencyId, -amount, {
    turn: world.meta?.turn ?? 0,
    reason: "caravan",
    intentId: intent.id,
  });
  writeLedger(ledger);
  if (!world.caravans) world.caravans = [];
  world.caravans.push({
    id: intent.id,
    name: "Караван",
    fromSystemId,
    toSystemId,
    progress: 0,
    factionId: intent.factionId,
    cargo: { [currencyId]: amount },
  });
  journalPush(journal, {
    type: "send_caravan",
    intentId: intent.id,
    factionId: intent.factionId,
    currencyId,
    amount,
    fromSystemId,
    toSystemId,
  });
  return true;
}

export function applyReserveStock(world, intent, journal) {
  const currencyId = String(intent.payload?.currencyId || "");
  const amount = Math.floor(Number(intent.payload?.amount) || 0);
  const label = String(intent.payload?.label || "резерв").slice(0, 48);
  if (!currencyId || amount < 0) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "нужны currencyId и amount ≥ 0",
    });
    return false;
  }
  const ledger = ensureAllFactions(readLedger(), world);
  const eco = ensureFactionEco(ledger, intent.factionId);
  const stock = Number(eco.stocks?.[currencyId] ?? 0);
  if (!eco.stockReserves) eco.stockReserves = {};
  if (amount === 0) {
    delete eco.stockReserves[currencyId];
  } else {
    if (amount > stock) {
      journalPush(journal, {
        type: "reject",
        intentId: intent.id,
        reason: `недостаточно запаса (есть ${stock})`,
      });
      return false;
    }
    eco.stockReserves[currencyId] = { amount, label };
  }
  writeLedger(ledger);
  journalPush(journal, {
    type: "reserve_stock",
    intentId: intent.id,
    factionId: intent.factionId,
    currencyId,
    amount,
    label,
  });
  return true;
}

export function applySetEconomicPolicy(world, intent, journal) {
  const policyId = String(intent.payload?.policyId || "");
  const preset = ECONOMIC_POLICY_PRESETS[policyId];
  if (!preset) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "неизвестная доктрина (military|trade|growth)",
    });
    return false;
  }
  for (const [slot, tierId] of Object.entries(preset.taxes)) {
    const result = queueTaxChange(intent.factionId, slot, tierId);
    if (!result.ok) {
      journalPush(journal, {
        type: "reject",
        intentId: intent.id,
        reason: result.error || `налог ${slot}`,
      });
      return false;
    }
  }
  const ledger = ensureAllFactions(readLedger(), world);
  const eco = ensureFactionEco(ledger, intent.factionId);
  eco.economicPolicy = policyId;
  writeLedger(ledger);
  journalPush(journal, {
    type: "set_economic_policy",
    intentId: intent.id,
    factionId: intent.factionId,
    policyId,
    label: preset.label,
    taxes: preset.taxes,
    note: "налоги в очереди на следующий тик",
  });
  return true;
}

export function applyTransfer(world, intent, journal) {
  const toId = intent.payload?.toFactionId;
  const visible = resolveVisibleWithFog(world, intent.factionId, readFog());
  const known = getKnownFactionIds(world, intent.factionId, [...visible]);
  if (!toId || !known.has(toId)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "получатель неизвестен (нет контакта)",
    });
    return false;
  }
  const result = transferResources(
    intent.factionId,
    toId,
    intent.payload?.currencyId || "currency.metal",
    intent.payload?.amount,
    world.meta?.turn,
    intent.id,
  );
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "transfer",
    intentId: intent.id,
    factionId: intent.factionId,
    toFactionId: intent.payload?.toFactionId,
    currencyId: intent.payload?.currencyId,
    amount: intent.payload?.amount,
  });
  const fromFac = (world.factions ?? []).find((f) => f.id === intent.factionId);
  const toFac = (world.factions ?? []).find((f) => f.id === toId);
  const turn = world.meta?.turn ?? 0;
  if (fromFac && toFac) {
    bumpOpinion(toFac, intent.factionId, 2, turn, "Получен перевод");
    bumpOpinion(fromFac, toId, 1, turn, "Отправлен перевод");
  }
  return true;
}

export function applyBreakTreaty(world, intent, journal) {
  const withId = intent.payload?.withFactionId;
  if (!withId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "withFactionId_missing",
    });
    return false;
  }
  const turn = world.meta?.turn ?? 0;
  breakTreaty(world, intent.factionId, withId, turn, getContent()?.diplomacy_stances);
  // Reset edge to neutral
  const [x, y] =
    intent.factionId < withId
      ? [intent.factionId, withId]
      : [withId, intent.factionId];
  const list = world.diplomacy ?? [];
  const idx = list.findIndex(
    (d) => d.aId === x && d.bId === y && (!d.track || d.track === "political"),
  );
  if (idx >= 0) {
    list[idx] = { ...list[idx], relation: "neutral" };
  }
  world.diplomacy = list;
  journalPush(journal, {
    type: "break_treaty",
    intentId: intent.id,
    factionId: intent.factionId,
    withFactionId: withId,
    treatyType: intent.payload?.treatyType ?? null,
  });
  return true;
}

export function applyMarketOffer(world, intent, journal) {
  const venue =
    intent.payload?.venue === "common" ? "common" : "contacts";
  if (venue === "contacts") {
    const visible = resolveVisibleWithFog(world, intent.factionId, readFog());
    const known = getKnownFactionIds(world, intent.factionId, [...visible]);
    const partners = getTradePartnerIds(world, intent.factionId, known);
    if (partners.length === 0) {
      journalPush(journal, {
        type: "reject",
        intentId: intent.id,
        reason: "нет торговых партнёров (нужен договор trade/alliance)",
      });
      return false;
    }
  }
  const result = placeMarketOffer(
    intent.factionId,
    intent.payload?.side,
    intent.payload?.giveCurrency,
    intent.payload?.giveAmount,
    intent.payload?.wantCurrency,
    intent.payload?.wantAmount,
    world.meta?.turn,
    intent.id,
    venue,
  );
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "market_offer",
    intentId: intent.id,
    factionId: intent.factionId,
    offerId: result.offer.id,
    side: result.offer.side,
    giveCurrency: result.offer.giveCurrency,
    giveAmount: result.offer.giveAmount,
    wantCurrency: result.offer.wantCurrency,
    wantAmount: result.offer.wantAmount,
  });
  return true;
}

export function applyMarketCancel(world, intent, journal) {
  const result = cancelMarketOffer(
    intent.payload?.offerId,
    intent.factionId,
    world.meta?.turn,
    intent.id,
  );
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "market_cancel",
    intentId: intent.id,
    factionId: intent.factionId,
    offerId: result.offer.id,
  });
  return true;
}

export function applyMarketConvert(world, intent, journal) {
  const result = marketConvert(
    intent.factionId,
    intent.payload?.fromCurrency,
    intent.payload?.toCurrency,
    intent.payload?.amountFrom,
    intent.payload?.amountTo,
    world.meta?.turn,
    intent.id,
  );
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "market_convert",
    intentId: intent.id,
    factionId: intent.factionId,
    fromCurrency: intent.payload?.fromCurrency,
    toCurrency: intent.payload?.toCurrency,
    amountFrom: result.amountFrom,
    amountTo: result.amountTo,
  });
  return true;
}

export function applyMakeDiploOffer(world, intent, journal) {
  const toFactionId = intent.payload?.toFactionId;
  if (!toFactionId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "toFactionId_required",
    });
    return false;
  }
  const visible = resolveVisibleWithFog(world, intent.factionId, readFog());
  const known = getKnownFactionIds(world, intent.factionId, [...visible]);
  const result = createDiploOffer({
    fromFactionId: intent.factionId,
    toFactionId,
    give: intent.payload?.give,
    want: intent.payload?.want,
    note: intent.payload?.note || intent.note,
    turn: world.meta?.turn ?? 0,
    knownOk: known.has(toFactionId),
  });
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error || "diplo_offer_failed",
    });
    return false;
  }
  journalPush(journal, {
    type: "make_diplo_offer",
    intentId: intent.id,
    factionId: intent.factionId,
    toFactionId,
    offerId: result.offer?.id,
  });
  return true;
}

export function advanceCaravans(world) {
  const ledger = ensureAllFactions(readLedger(), world);
  const turn = world.meta?.turn ?? 0;
  let ledgerDirty = false;
  const remaining = [];
  for (const c of world.caravans ?? []) {
    c.progress = Math.min(1, (c.progress ?? 0) + 0.15);
    if (c.progress < 1) {
      remaining.push(c);
      continue;
    }
    // Arrived at destination — deliver cargo once, then despawn (no ping-pong).
    const cargo = c.cargo && typeof c.cargo === "object" ? c.cargo : null;
    if (cargo && c.factionId) {
      for (const [cur, amt] of Object.entries(cargo)) {
        const n = Number(amt) || 0;
        if (!n) continue;
        adjustStock(ledger, c.factionId, cur, n, {
          turn,
          reason: "caravan_delivery",
          intentId: c.id,
        });
        ledgerDirty = true;
      }
    }
  }
  world.caravans = remaining;
  if (ledgerDirty) writeLedger(ledger);
}
