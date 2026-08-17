import { journalPush } from "./journal.mjs";
import { addPermanentReveal } from "../fogStore.mjs";
import { resolveVisibleWithFog, readFog } from "../fogStore.mjs";
import {
  bumpSystemIntel,
  canEspionage,
  getIntelRules,
  getLevel,
  markEspionageUsed,
  setKnowledgeLevel,
} from "../intel.mjs";
import { getContent } from "../contentLoader.mjs";
import {
  readLedger,
  writeLedger,
  ensureFactionEco,
  ensureAllFactions,
  adjustStock,
} from "../ledger.mjs";
import { bumpOpinion } from "../opinionTick.mjs";

export function applyScoutReveal(world, intent, journal) {
  const systemId = intent.payload?.systemId || intent.payload?.toSystemId;
  if (!systemId || !(world.systems ?? []).some((s) => s.id === systemId)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_missing",
    });
    return false;
  }
  if (!factionHasScoutPresence(world, intent.factionId, systemId)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "scout_presence_required",
    });
    return false;
  }
  addPermanentReveal(intent.factionId, systemId);
  journalPush(journal, {
    type: "scout_reveal",
    intentId: intent.id,
    systemId,
    factionId: intent.factionId,
  });
  return true;
}

/** Owned fleet/legion in target system or adjacent via hyperlane. */
export function factionHasScoutPresence(world, factionId, systemId) {
  const near = new Set([systemId]);
  for (const l of world.links ?? []) {
    if (l.fromId === systemId) near.add(l.toId);
    else if (l.toId === systemId) near.add(l.fromId);
  }
  for (const f of world.fleets ?? []) {
    if (f.factionId === factionId && near.has(f.systemId)) return true;
  }
  for (const l of world.legions ?? []) {
    if (l.factionId === factionId && near.has(l.systemId)) return true;
  }
  return false;
}

export function applyScoutWorld(world, intent, journal) {
  const systemId =
    intent.payload?.targetSystemId ||
    intent.payload?.systemId ||
    intent.payload?.toSystemId;
  const fleetId = intent.payload?.fleetId;
  const legionId = intent.payload?.legionId;
  if (!systemId || !(world.systems ?? []).some((s) => s.id === systemId)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_missing",
    });
    return false;
  }
  const unit =
    (fleetId && (world.fleets ?? []).find((f) => f.id === fleetId)) ||
    (legionId && (world.legions ?? []).find((l) => l.id === legionId));
  if (!unit || unit.factionId !== intent.factionId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "unit_required",
    });
    return false;
  }
  if (unit.systemId !== systemId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "unit_not_in_system",
    });
    return false;
  }
  const rules = getIntelRules();
  const turn = world.meta?.turn ?? 0;
  bumpSystemIntel(world, intent.factionId, systemId, rules.scoutWorldIntel, {
    source: "scout",
    turn,
  });
  journalPush(journal, {
    type: "scout_world",
    intentId: intent.id,
    systemId,
    factionId: intent.factionId,
    intel: rules.scoutWorldIntel,
  });
  return true;
}

const ESPIONAGE_CATEGORIES = new Set([
  "tech",
  "building",
  "unit",
  "faction",
  "race",
]);

export function applyEspionage(world, intent, journal) {
  const targetFactionId = intent.payload?.targetFactionId;
  const category = String(intent.payload?.intelCategory || "faction");
  if (!targetFactionId || targetFactionId === intent.factionId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "target_required",
    });
    return false;
  }
  if (!ESPIONAGE_CATEGORIES.has(category)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "bad_category",
    });
    return false;
  }
  const turn = world.meta?.turn ?? 0;
  if (!canEspionage(intent.factionId, targetFactionId, turn)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "espionage_cooldown",
    });
    return false;
  }
  const rules = getIntelRules();
  const ledger = ensureAllFactions(readLedger(), world);
  const eco = ensureFactionEco(ledger, intent.factionId);
  const cost = rules.espionageCognitioCost ?? 10;
  const have = eco.stocks?.["currency.cognitio"] ?? 0;
  if (have < cost) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "need_cognitio",
    });
    return false;
  }
  adjustStock(ledger, intent.factionId, "currency.cognitio", -cost, {
    turn,
    reason: "espionage",
    intentId: intent.id,
  });
  writeLedger(ledger);

  const detected = Math.random() < rules.espionageDetectionChance;
  markEspionageUsed(intent.factionId, targetFactionId, turn);

  // Raise knowledge for category entities related to target
  const curFactionLevel = getLevel(intent.factionId, "faction", targetFactionId);
  setKnowledgeLevel(
    intent.factionId,
    "faction",
    targetFactionId,
    Math.max(curFactionLevel, 1) + (category === "faction" ? 1 : 0),
    { source: "espionage", turn },
  );

  if (category === "tech") {
    const partnerEco = ensureFactionEco(readLedger(), targetFactionId);
    for (const tid of partnerEco.unlockedTechs ?? []) {
      const lv = getLevel(intent.factionId, "tech", tid);
      setKnowledgeLevel(intent.factionId, "tech", tid, lv + 1, {
        source: "espionage",
        turn,
      });
    }
  } else if (category === "race") {
    const partner = (world.factions ?? []).find((f) => f.id === targetFactionId);
    for (const r of partner?.races ?? []) {
      const rid = typeof r === "string" ? r : r?.id;
      if (!rid) continue;
      const lv = getLevel(intent.factionId, "race", rid);
      setKnowledgeLevel(intent.factionId, "race", rid, lv + 1, {
        source: "espionage",
        turn,
      });
    }
  } else if (category === "unit") {
    const seed = (uid) => {
      if (!uid || typeof uid !== "string") return;
      const lv = getLevel(intent.factionId, "unit", uid);
      setKnowledgeLevel(intent.factionId, "unit", uid, lv + 1, {
        source: "espionage",
        turn,
      });
    };
    for (const f of world.fleets ?? []) {
      if (f.factionId !== targetFactionId) continue;
      seed(f.unitDefId ?? f.templateId ?? f.classId);
      for (const g of f.composition ?? []) {
        seed(g?.defId || g?.type);
      }
    }
    for (const l of world.legions ?? []) {
      if (l.factionId !== targetFactionId) continue;
      seed(l.unitDefId ?? l.templateId ?? l.classId);
      for (const g of l.composition ?? []) {
        seed(g?.defId || g?.type);
      }
    }
  } else if (category === "building") {
    for (const sys of world.systems ?? []) {
      if (sys.ownerFactionId !== targetFactionId) continue;
      for (const p of sys.planets ?? []) {
        const lists = [
          ...(p.buildings ?? []),
          ...(p.surfaceBuildings ?? []),
          ...(p.orbitalBuildings ?? []),
        ];
        for (const b of lists) {
          const bid = typeof b === "string" ? b : b?.buildingId ?? b?.id;
          if (!bid) continue;
          const lv = getLevel(intent.factionId, "building", bid);
          setKnowledgeLevel(intent.factionId, "building", bid, lv + 1, {
            source: "espionage",
            turn,
          });
        }
      }
    }
  }

  if (detected) {
    const target = (world.factions ?? []).find((f) => f.id === targetFactionId);
    const spy = (world.factions ?? []).find((f) => f.id === intent.factionId);
    if (target) {
      bumpOpinion(target, intent.factionId, -12, turn, "Разоблачённый шпионаж");
    }
    if (spy) {
      bumpOpinion(spy, targetFactionId, -4, turn, "Провал шпионажа");
    }
  }

  journalPush(journal, {
    type: "espionage",
    intentId: intent.id,
    factionId: intent.factionId,
    targetFactionId,
    category,
    detected,
    cognitioSpent: cost,
  });
  return true;
}
