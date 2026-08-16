import { journalPush } from "./journal.mjs";
import { researchUpgrade, researchTech, setResearchQueue } from "../techActions.mjs";
import { transferTech } from "../techPool.mjs";
import {
  applyPlanetAction,
  setBuildQueue,
  pushSystemHistory,
  BUILD_QUEUE_MAX,
} from "../planetActions.mjs";
import { foundHybridLineage } from "../hybridActions.mjs";
import { grantPowerTouch } from "../powerPaths.mjs";
import { getContent } from "../contentLoader.mjs";
import {
  readLedger,
  writeLedger,
  ensureFactionEco,
} from "../ledger.mjs";

export function applyPlanetIntent(action) {
  return (world, intent, journal) => {
    const result = applyPlanetAction({
      world,
      factionId: intent.factionId,
      action,
      systemId: intent.payload?.systemId,
      planetId: intent.payload?.planetId,
      buildingId: intent.payload?.buildingId,
      instanceId: intent.payload?.instanceId,
      colonyType: intent.payload?.colonyType,
      sourcePlanetId: intent.payload?.sourcePlanetId,
      zone: intent.payload?.zone,
      note: intent.note || intent.payload?.note,
      persist: false,
      skipApCheck: true,
      skipIntentRecord: true,
    });
    if (!result.ok) {
      journalPush(journal, {
        type: "reject",
        intentId: intent.id,
        reason: result.error || "planet_action_failed",
        action,
      });
      return false;
    }
    journalPush(journal, {
      type: action,
      intentId: intent.id,
      factionId: intent.factionId,
      systemId: intent.payload?.systemId,
      planetId: intent.payload?.planetId,
      buildingId: intent.payload?.buildingId || result.building?.buildingId,
      colonyType: intent.payload?.colonyType,
    });
    return true;
  };
}

export function applyResearchUpgrade(world, intent, journal) {
  const techId = intent.payload?.techId;
  const upgradeId = intent.payload?.upgradeId;
  if (!techId || !upgradeId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "techId_upgradeId_required",
    });
    return false;
  }
  const result = researchUpgrade(intent.factionId, techId, upgradeId, {
    turn: world.meta?.turn ?? null,
    world,
    intentId: intent.id,
  });
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "research_upgrade",
    intentId: intent.id,
    factionId: intent.factionId,
    techId,
    upgradeId,
  });
  return true;
}

export function applySetResearchQueue(world, intent, journal) {
  const queue = intent.payload?.queue;
  if (!Array.isArray(queue)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "queue_required",
    });
    return false;
  }
  const result = setResearchQueue(intent.factionId, queue);
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "set_research_queue",
    intentId: intent.id,
    factionId: intent.factionId,
    queue: result.eco?.researchQueue ?? [],
  });
  return true;
}

export function applyTradeTech(world, intent, journal) {
  const techId = intent.payload?.techId;
  const targetFactionId = intent.payload?.targetFactionId;
  const price = intent.payload?.price || {};
  if (!techId || !targetFactionId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "techId_and_target_required",
    });
    return false;
  }
  const turn = world.meta?.turn ?? 0;
  const ledger = ensureAllFactions(readLedger(), world);
  const fromEco = ensureFactionEco(ledger, intent.factionId);
  const toEco = ensureFactionEco(ledger, targetFactionId);

  // Buyer (target) pays price to seller (intent faction) if price set
  for (const [cur, amt] of Object.entries(price)) {
    const n = Number(amt || 0);
    if (!n) continue;
    const buyerStock = toEco.stocks?.[cur] ?? 0;
    if (buyerStock < n) {
      journalPush(journal, {
        type: "reject",
        intentId: intent.id,
        reason: `buyer_cannot_afford_${cur}`,
      });
      return false;
    }
  }

  const result = transferTech(fromEco, toEco, techId, {
    turn,
    fromFactionId: intent.factionId,
    source: "trade",
  });
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }

  for (const [cur, amt] of Object.entries(price)) {
    const n = Number(amt || 0);
    if (!n) continue;
    adjustStock(ledger, targetFactionId, cur, -n, {
      turn,
      reason: "tech_trade_pay",
      intentId: intent.id,
    });
    adjustStock(ledger, intent.factionId, cur, n, {
      turn,
      reason: "tech_trade_recv",
      intentId: intent.id,
    });
  }
  writeLedger(ledger);
  journalPush(journal, {
    type: "trade_tech",
    intentId: intent.id,
    factionId: intent.factionId,
    targetFactionId,
    techId,
  });
  // Buyer learns tech fully; seller already owns it
  setKnowledgeLevel(targetFactionId, "tech", techId, 4, {
    source: "trade",
    turn,
  });
  setKnowledgeLevel(intent.factionId, "tech", techId, 4, {
    source: "own",
    turn,
  });
  updateIntelFromDiplomacy(world, intent.factionId, targetFactionId, "trade", {
    turn,
  });
  updateIntelFromDiplomacy(world, targetFactionId, intent.factionId, "trade", {
    turn,
  });
  return true;
}

export function applySetBuildQueue(world, intent, journal) {
  const queue = intent.payload?.queue;
  if (!Array.isArray(queue)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "queue_required",
    });
    return false;
  }
  if (queue.length > BUILD_QUEUE_MAX) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "queue_too_long",
    });
    return false;
  }
  const result = setBuildQueue(intent.factionId, queue);
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "set_build_queue",
    intentId: intent.id,
    factionId: intent.factionId,
    queue: result.eco?.buildQueue ?? [],
  });
  return true;
}

/**
 * After economy tick: try to build the first queued building per faction.
 * Leaves queue unchanged if unaffordable / blocked.
 */
export function applyAllBuildQueues(world, turn, journal) {
  const content = getContent();
  const apMax = content.rules?.apPerTurn ?? 9;

  for (const fac of world.factions ?? []) {
    const ledger = ensureAllFactions(readLedger(), world);
    const eco = ensureFactionEco(ledger, fac.id);
    const queue = eco.buildQueue || [];
    if (queue.length === 0) continue;
    const first = queue[0];
    if (!first?.systemId || !first?.planetId || !first?.buildingId) {
      eco.buildQueue = queue.slice(1);
      writeLedger(ledger);
      continue;
    }
    const result = applyPlanetAction({
      world,
      factionId: fac.id,
      action: "build",
      systemId: first.systemId,
      planetId: first.planetId,
      buildingId: first.buildingId,
      note: `queue:${fac.id}`,
      apMax,
    });
    if (!result.ok) continue;
    const led = readLedger();
    const ecoAfter = ensureFactionEco(led, fac.id);
    const q = ecoAfter.buildQueue || [];
    if (
      q[0]?.systemId === first.systemId &&
      q[0]?.planetId === first.planetId &&
      q[0]?.buildingId === first.buildingId
    ) {
      ecoAfter.buildQueue = q.slice(1);
    } else {
      ecoAfter.buildQueue = q.slice(1);
    }
    writeLedger(led);
    journalPush(journal, {
      type: "build_queue",
      factionId: fac.id,
      systemId: first.systemId,
      planetId: first.planetId,
      buildingId: first.buildingId,
      buildingName: result.building?.name ?? first.buildingId,
    });
  }
}

/**
 * After economy tick: try to research the first queued tech per faction.
 * Leaves queue unchanged if unaffordable / blocked.
 */
export function applyAllResearchQueues(world, turn, journal) {
  const ledger = ensureAllFactions(readLedger(), world);
  for (const fac of world.factions ?? []) {
    const eco = ensureFactionEco(ledger, fac.id);
    const queue = eco.researchQueue || [];
    if (queue.length === 0) continue;
    const firstTechId = queue[0];
    const result = researchTech(fac.id, firstTechId, {
      turn,
      world,
      intentId: firstTechId,
    });
    if (result.ok) {
      journalPush(journal, {
        type: "research_queue",
        factionId: fac.id,
        techId: firstTechId,
        techName: result.tech?.name ?? firstTechId,
      });
    }
  }
}

export function applyFoundHybridLineage(world, intent, journal) {
  const systemId = intent.payload?.systemId;
  const planetId = intent.payload?.planetId;
  const raceA = intent.payload?.raceA;
  const raceB = intent.payload?.raceB;
  if (!systemId || !planetId || !raceA || !raceB) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_planet_races_required",
    });
    return false;
  }
  const result = foundHybridLineage(
    intent.factionId,
    systemId,
    planetId,
    raceA,
    raceB,
    {
      turn: world.meta?.turn ?? null,
      world,
      intentId: intent.id,
    },
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
    type: "found_hybrid_lineage",
    intentId: intent.id,
    factionId: intent.factionId,
    systemId,
    planetId,
    lineageId: result.lineageId,
  });
  return true;
}

export function applyGrantPowerTouch(world, intent, journal) {
  const factionId = intent.payload?.factionId || intent.factionId;
  const powerPath = intent.payload?.powerPath;
  if (!factionId || !powerPath) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "factionId_powerPath_required",
    });
    return false;
  }
  const result = grantPowerTouch(factionId, powerPath, world);
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "grant_power_touch",
    intentId: intent.id,
    factionId,
    powerPath: result.powerPath,
    powerPaths: result.powerPaths,
  });
  return true;
}
