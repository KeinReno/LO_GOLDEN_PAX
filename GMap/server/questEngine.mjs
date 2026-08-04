/**
 * Quest engine (A9): yearly rolls, choice/dice resolution, one-shot effects.
 */
import { getContent } from "./contentLoader.mjs";
import {
  formatDiceMessage,
  logDiceToRp,
  rollDice,
  rollRecurringQuests,
  rollSuccess,
} from "./dice.mjs";
import {
  adjustStock,
  ensureFactionEco,
  readLedger,
  writeLedger,
} from "./ledger.mjs";
import { setKnowledgeLevel } from "./intel.mjs";

function nowIso() {
  return new Date().toISOString();
}

function ensureMeta(world) {
  if (!world.meta || typeof world.meta !== "object") world.meta = {};
  if (!world.meta.yearlyQuestRolls || typeof world.meta.yearlyQuestRolls !== "object") {
    world.meta.yearlyQuestRolls = {};
  }
  if (!Array.isArray(world.quests)) world.quests = [];
  return world.meta;
}

function factionById(world, factionId) {
  return (world.factions ?? []).find((f) => f.id === factionId) || null;
}

function ownedSystems(world, factionId) {
  return (world.systems ?? []).filter((s) => s.ownerFactionId === factionId);
}

function warCount(world, factionId) {
  let n = 0;
  for (const d of world.diplomacy ?? []) {
    const a = d.aId || d.aFactionId || d.fromFactionId;
    const b = d.bId || d.bFactionId || d.toFactionId;
    if (a !== factionId && b !== factionId) continue;
    if (d.status === "war" || d.relation === "war" || d.state === "war") n += 1;
  }
  return n;
}

function hasRefugees(world, factionId) {
  for (const s of ownedSystems(world, factionId)) {
    for (const p of s.planets ?? []) {
      if ((p.refugees ?? 0) > 0) return true;
      if (p.tags?.includes?.("refugees")) return true;
    }
  }
  return (world.caravans ?? []).some(
    (c) => c.kind === "refugee" && c.toFactionId === factionId,
  );
}

function hasRace(world, factionId, raceId) {
  for (const s of ownedSystems(world, factionId)) {
    for (const p of s.planets ?? []) {
      const comp = p.raceComposition || p.races || [];
      if (Array.isArray(comp)) {
        for (const row of comp) {
          const id = typeof row === "string" ? row : row.raceId || row.id;
          if (id === raceId) return true;
        }
      } else if (comp && typeof comp === "object" && comp[raceId]) {
        return true;
      }
    }
  }
  return false;
}

function hasBuilding(world, factionId, buildingId) {
  for (const s of ownedSystems(world, factionId)) {
    for (const p of s.planets ?? []) {
      const lists = [
        ...(p.buildings ?? []),
        ...(p.surfaceBuildings ?? []),
        ...(p.orbitalBuildings ?? []),
      ];
      for (const b of lists) {
        const bid =
          typeof b === "string" ? b : b?.buildingId ?? b?.kind ?? b?.id;
        if (bid === buildingId) return true;
      }
    }
  }
  return false;
}

function lowLoyaltyRace(faction, raceId) {
  const map = faction?.loyaltyByRace || {};
  if (raceId && Number.isFinite(map[raceId])) return map[raceId] < 40;
  if (Number.isFinite(faction?.loyalty)) return faction.loyalty < 40;
  // Soft default until A3 lands: treat as matching (allow filtered quests).
  return true;
}

function borderWithWar(world, factionId) {
  if (warCount(world, factionId) <= 0) return false;
  const owned = new Set(ownedSystems(world, factionId).map((s) => s.id));
  for (const link of world.links ?? []) {
    const a = link.fromId || link.a || link.fromSystemId;
    const b = link.toId || link.b || link.toSystemId;
    if (!owned.has(a) && !owned.has(b)) continue;
    const otherId = owned.has(a) ? b : a;
    const other = (world.systems ?? []).find((s) => s.id === otherId);
    if (!other?.ownerFactionId || other.ownerFactionId === factionId) continue;
    // Neighbor owned by someone we are at war with
    for (const d of world.diplomacy ?? []) {
      const x = d.aId || d.aFactionId || d.fromFactionId;
      const y = d.bId || d.bFactionId || d.toFactionId;
      const pair =
        (x === factionId && y === other.ownerFactionId) ||
        (y === factionId && x === other.ownerFactionId);
      if (pair && (d.status === "war" || d.relation === "war" || d.state === "war")) {
        return true;
      }
    }
  }
  return false;
}

function arcActive(world, factionId, arcId) {
  if (!arcId) return false;
  return (world.quests ?? []).some(
    (q) =>
      q.sourceFactionId === factionId &&
      q.status === "active" &&
      (q.catalogId === arcId || q.arc?.id === arcId || q.id === arcId),
  );
}

/**
 * @param {object} filterBy
 * @param {object} ctx
 */
export function matchesFilter(filterBy, ctx) {
  const f = filterBy || {};
  if (f.minEra != null && (ctx.era ?? 1) < Number(f.minEra)) return false;
  if (f.maxWarCount != null && ctx.warCount > Number(f.maxWarCount)) return false;
  if (f.hasRefugees && !ctx.hasRefugees) return false;
  if (f.borderWithWar && !ctx.borderWithWar) return false;
  if (f.requiresRace && !ctx.hasRace(f.requiresRace)) return false;
  if (f.requiresBuilding && !ctx.hasBuilding(f.requiresBuilding)) return false;
  if (f.lowLoyaltyRace && !ctx.lowLoyaltyRace(f.lowLoyaltyRace)) return false;
  if (f.excludeIfArcActive && ctx.arcActive(f.excludeIfArcActive)) return false;
  return true;
}

function buildFilterContext(world, factionId) {
  const faction = factionById(world, factionId);
  return {
    era: world.meta?.era ?? 1,
    warCount: warCount(world, factionId),
    hasRefugees: hasRefugees(world, factionId),
    borderWithWar: borderWithWar(world, factionId),
    hasRace: (raceId) => hasRace(world, factionId, raceId),
    hasBuilding: (buildingId) => hasBuilding(world, factionId, buildingId),
    lowLoyaltyRace: (raceId) => lowLoyaltyRace(faction, raceId),
    arcActive: (arcId) => arcActive(world, factionId, arcId),
  };
}

function pickSystemId(world, factionId) {
  const owned = ownedSystems(world, factionId);
  if (!owned.length) return null;
  return owned[Math.floor(Math.random() * owned.length)]?.id ?? null;
}

function catalogQuestToInstance(def, factionId, systemId, turn, expiresTurn) {
  return {
    id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    catalogId: def.id,
    name: def.name,
    summary: def.summary,
    detail: def.detail || "",
    systemId,
    sourceSystemId: systemId,
    sourceFactionId: factionId,
    status: "active",
    type: "yearly",
    history: [
      {
        at: nowIso(),
        turn,
        kind: "message",
        body: "Квест появился в ежходном пуле.",
      },
    ],
    choices: Array.isArray(def.choices) ? structuredClone(def.choices) : [],
    diceRequired: Array.isArray(def.diceRequired)
      ? structuredClone(def.diceRequired)
      : undefined,
    expiresTurn,
  };
}

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
function applyQuestEffects(world, factionId, effects, meta = {}) {
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

function pushHistory(quest, entry) {
  if (!Array.isArray(quest.history)) quest.history = [];
  quest.history.push(entry);
}

function currentChoices(quest) {
  if (quest.arc?.stages?.length) {
    const stage = quest.arc.stages[quest.arc.currentStage] || quest.arc.stages[0];
    if (stage?.choices?.length) return stage.choices;
  }
  return quest.choices || [];
}

function findChoice(quest, choiceId) {
  return currentChoices(quest).find((c) => c.id === choiceId) || null;
}

/**
 * Roll 1d6 and spawn that many filtered yearly quests for a faction.
 */
export function rollYearlyQuests(factionId, world, content, opts = {}) {
  ensureMeta(world);
  const turn = world.meta?.turn ?? 0;
  if (world.meta.yearlyQuestRolls[factionId] === turn && !opts.force) {
    return { ok: false, error: "Кубик ежходных квестов уже брошен в этом ходу" };
  }

  const { count, roll } = rollRecurringQuests();
  const pack = content || getContent();
  const catalog = pack.yearly_quests || {};
  const defs = Object.values(catalog);
  const ctx = buildFilterContext(world, factionId);

  const matched = defs.filter((d) => matchesFilter(d.filterBy, ctx));
  const neutrals = defs.filter((d) => d.neutral || !d.filterBy || !Object.keys(d.filterBy).length);

  const pool = [...matched];
  while (pool.length < count) {
    const filler = neutrals[pool.length % Math.max(1, neutrals.length)];
    if (!filler) break;
    if (!pool.includes(filler)) pool.push(filler);
    else pool.push(filler);
    if (pool.length > defs.length + count) break;
  }

  // Shuffle lightly
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const picked = pool.slice(0, count);
  const expiresTurn = turn + 1;
  const created = [];
  for (const def of picked) {
    const systemId = pickSystemId(world, factionId);
    const q = catalogQuestToInstance(def, factionId, systemId, turn, expiresTurn);
    world.quests.push(q);
    created.push(q);
  }

  world.meta.yearlyQuestRolls[factionId] = turn;

  const faction = factionById(world, factionId);
  const body = formatDiceMessage(
    { count: 1, sides: 6, label: "1d6 ежходных квестов" },
    [roll],
    null,
    faction?.name || "Игрок",
  );
  logDiceToRp(factionId, `${body} → ${created.length} квест(ов)`);

  return {
    ok: true,
    roll,
    count: created.length,
    quests: created,
    message: body,
  };
}

export function hasRolledYearlyQuests(world, factionId) {
  ensureMeta(world);
  const turn = world.meta?.turn ?? 0;
  return world.meta.yearlyQuestRolls[factionId] === turn;
}

/**
 * Expire yearly quests whose expiresTurn has arrived.
 */
export function expireQuests(world, turn, journal = []) {
  ensureMeta(world);
  for (const q of world.quests) {
    if (q.status !== "active") continue;
    if (q.expiresTurn == null) continue;
    if (Number(q.expiresTurn) > turn) continue;
    q.status = "expired";
    pushHistory(q, {
      at: nowIso(),
      turn,
      kind: "message",
      body: "Срок истёк — квест закрыт без решения.",
      outcome: "expired",
    });
    journal.push({ type: "quest_expired", questId: q.id, name: q.name });
  }
}

export function resolveQuestChoice(questId, choiceId, world, content, opts = {}) {
  ensureMeta(world);
  const quest = (world.quests ?? []).find((q) => q.id === questId);
  if (!quest) return { ok: false, error: "Квест не найден" };
  if (quest.status !== "active") return { ok: false, error: "Квест уже закрыт" };

  const choice = findChoice(quest, choiceId);
  if (!choice) return { ok: false, error: "Выбор не найден" };

  if (choice.diceRequired?.length) {
    return {
      ok: false,
      error: "Сначала нужен бросок кубика",
      needsDice: true,
      diceRequired: choice.diceRequired,
    };
  }

  const factionId = opts.factionId || quest.sourceFactionId;
  if (!factionId) return { ok: false, error: "Нет фракции квеста" };
  if (opts.factionId && quest.sourceFactionId && opts.factionId !== quest.sourceFactionId) {
    return { ok: false, error: "Чужой квест" };
  }

  const turn = world.meta?.turn ?? 0;
  const effectResult = applyQuestEffects(world, factionId, choice.effects || [], {
    turn,
    questId: quest.id,
    label: quest.name,
    intentId: opts.intentId,
    reason: "quest_choice",
  });
  if (effectResult.error) {
    return { ok: false, error: effectResult.error };
  }

  pushHistory(quest, {
    at: nowIso(),
    turn,
    kind: "choice",
    body: `Выбор: ${choice.label}`,
    authorName: opts.authorName,
    outcome: effectResult.notes.join("; ") || "ok",
  });

  if (choice.nextStageId && quest.arc?.stages?.length) {
    const idx = quest.arc.stages.findIndex((s) => s.id === choice.nextStageId);
    if (idx >= 0) {
      quest.arc.currentStage = idx;
      pushHistory(quest, {
        at: nowIso(),
        turn,
        kind: "stage_change",
        body: `Стадия: ${quest.arc.stages[idx].label}`,
      });
    } else {
      quest.status = "done";
    }
  } else if (quest.type === "yearly" || !quest.arc) {
    quest.status = "done";
  }

  if (effectResult.notes.length) {
    pushHistory(quest, {
      at: nowIso(),
      turn,
      kind: "reward",
      body: effectResult.notes.join("; "),
    });
  }

  return { ok: true, quest, choice, effects: effectResult };
}

export function resolveQuestDice(questId, specIndex, world, content, opts = {}) {
  ensureMeta(world);
  const quest = (world.quests ?? []).find((q) => q.id === questId);
  if (!quest) return { ok: false, error: "Квест не найден" };
  if (quest.status !== "active") return { ok: false, error: "Квест уже закрыт" };

  const factionId = opts.factionId || quest.sourceFactionId;
  if (!factionId) return { ok: false, error: "Нет фракции квеста" };
  if (opts.factionId && quest.sourceFactionId && opts.factionId !== quest.sourceFactionId) {
    return { ok: false, error: "Чужой квест" };
  }

  const choiceId = opts.choiceId || null;
  const choice = choiceId ? findChoice(quest, choiceId) : null;

  let specs = [];
  if (choice?.diceRequired?.length) specs = choice.diceRequired;
  else if (quest.diceRequired?.length) specs = quest.diceRequired;
  else if (quest.arc?.stages?.[quest.arc.currentStage]?.diceRequired?.length) {
    specs = quest.arc.stages[quest.arc.currentStage].diceRequired;
  }

  const idx = Math.max(0, Math.floor(Number(specIndex) || 0));
  const spec = specs[idx];
  if (!spec) return { ok: false, error: "Нет спецификации кубика" };

  const rolls = rollDice(spec);
  const success = rollSuccess(spec, rolls);
  const faction = factionById(world, factionId);
  const turn = world.meta?.turn ?? 0;
  const message = formatDiceMessage(spec, rolls, success, faction?.name || "Игрок");
  logDiceToRp(factionId, message);

  pushHistory(quest, {
    at: nowIso(),
    turn,
    kind: "dice",
    body: message,
    authorName: opts.authorName || faction?.name,
    outcome: success === true ? "success" : success === false ? "fail" : "roll",
  });

  let effectResult = { applied: [], notes: [] };
  if (choice) {
    const effects =
      success === true
        ? choice.onSuccess || []
        : success === false
          ? choice.onFail || []
          : [];
    effectResult = applyQuestEffects(world, factionId, effects, {
      turn,
      questId: quest.id,
      label: quest.name,
      intentId: opts.intentId,
      reason: "quest_dice",
    });
    if (effectResult.error) {
      return { ok: false, error: effectResult.error, rolls, success, message };
    }
    // Consume choice after dice resolution for yearly quests
    if (quest.type === "yearly" || !quest.arc) {
      quest.status = "done";
    } else if (choice.nextStageId && quest.arc?.stages?.length) {
      const sidx = quest.arc.stages.findIndex((s) => s.id === choice.nextStageId);
      if (sidx >= 0) quest.arc.currentStage = sidx;
    }
    if (effectResult.notes.length) {
      pushHistory(quest, {
        at: nowIso(),
        turn,
        kind: "reward",
        body: effectResult.notes.join("; "),
        outcome: success === true ? "success" : "fail",
      });
    }
  }

  return {
    ok: true,
    quest,
    rolls,
    success,
    message,
    spec,
    effects: effectResult,
  };
}

/**
 * Normalize a raw quest object (migration helper).
 */
export function normalizeQuest(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    ...raw,
    id: String(raw.id || `q_${Math.random().toString(36).slice(2, 8)}`),
    name: String(raw.name || "Квест"),
    summary: String(raw.summary || ""),
    detail: raw.detail,
    systemId: raw.systemId ?? null,
    status: raw.status || "active",
    type: raw.type || "side",
    sourceFactionId: raw.sourceFactionId ?? null,
    sourceSystemId: raw.sourceSystemId ?? raw.systemId ?? null,
    sourceNpcId: raw.sourceNpcId ?? null,
    arc: raw.arc,
    history: Array.isArray(raw.history) ? raw.history : [],
    choices: Array.isArray(raw.choices) ? raw.choices : undefined,
    diceRequired: Array.isArray(raw.diceRequired) ? raw.diceRequired : undefined,
    expiresTurn: raw.expiresTurn ?? null,
    catalogId: raw.catalogId ?? null,
  };
}
