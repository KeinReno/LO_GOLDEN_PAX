import { journalPush } from "./journal.mjs";
import {
  setEngagementStance,
  requestCardBattle,
  playEngagementCard,
} from "../engagements.mjs";
import { getContent } from "../contentLoader.mjs";
import { pushSystemHistory } from "../planetActions.mjs";
import { applyMoveFleet, applyMoveLegion } from "./movement.mjs";

export function applyClaim(world, intent, journal) {
  const toId = intent.payload?.toSystemId;
  const sys = (world.systems ?? []).find((s) => s.id === toId);
  if (!sys) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_missing",
    });
    return false;
  }
  const hasPresence =
    (world.fleets ?? []).some(
      (f) => f.factionId === intent.factionId && f.systemId === toId,
    ) ||
    (world.legions ?? []).some(
      (l) => l.factionId === intent.factionId && l.systemId === toId,
    );
  if (!hasPresence) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "no_presence",
      systemId: toId,
    });
    return false;
  }
  const prev = sys.ownerFactionId;
  if (prev && prev !== intent.factionId) {
    sys.contested = true;
    sys.coOwnerFactionIds = Array.from(
      new Set([...(sys.coOwnerFactionIds ?? []), intent.factionId, prev]),
    );
    journalPush(journal, {
      type: "claim_contested",
      intentId: intent.id,
      systemId: toId,
      factionId: intent.factionId,
      previousOwner: prev,
    });
  } else {
    sys.ownerFactionId = intent.factionId;
    sys.contested = false;
    pushSystemHistory(sys, {
      turn: world.meta?.turn ?? 0,
      type: "capture",
      description: `Система захвачена`,
    });
    journalPush(journal, {
      type: "claim_system",
      intentId: intent.id,
      systemId: toId,
      factionId: intent.factionId,
    });
  }
  return true;
}

export function applyAttackMarker(world, intent, journal) {
  const toId = intent.payload?.toSystemId;
  const sys = (world.systems ?? []).find((s) => s.id === toId);
  if (!sys) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_missing",
    });
    return false;
  }
  // Move into theater; Engagement created after all intents, then resolved
  if (intent.payload?.fleetId) {
    if (!applyMoveFleet(world, intent, journal)) return false;
    const fleet = (world.fleets ?? []).find(
      (f) => f.id === intent.payload.fleetId,
    );
    if (fleet) fleet.pendingAttackSystemId = toId;
  }
  if (intent.payload?.legionId) {
    if (!applyMoveLegion(world, intent, journal)) return false;
    const legion = (world.legions ?? []).find(
      (l) => l.id === intent.payload.legionId,
    );
    if (legion) legion.pendingAttackSystemId = toId;
  }
  sys.activity = "battle";
  journalPush(journal, {
    type: "attack_committed",
    intentId: intent.id,
    systemId: toId,
    factionId: intent.factionId,
    theater: intent.payload?.theater || "space",
    stance: intent.payload?.stance || "assault",
  });
  return true;
}

export function applyCombatStance(world, intent, journal) {
  const engagementId = intent.payload?.engagementId;
  const stance = intent.payload?.stance;
  if (!engagementId || !stance) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "missing_engagement_or_stance",
    });
    return false;
  }
  const result = setEngagementStance(engagementId, intent.factionId, stance);
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "combat_stance",
    intentId: intent.id,
    engagementId,
    factionId: intent.factionId,
    stance,
  });
  return true;
}

export function applyRequestCardBattle(world, intent, journal) {
  const engagementId = intent.payload?.engagementId;
  if (!engagementId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "missing_engagement",
    });
    return false;
  }
  const result = requestCardBattle(engagementId, intent.factionId, world);
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "request_card_battle",
    intentId: intent.id,
    engagementId,
    factionId: intent.factionId,
    mutual: !!result.mutual,
    mode: result.engagement?.mode ?? result.mode,
  });
  return true;
}

export function applyPlayCard(world, intent, journal) {
  const engagementId = intent.payload?.engagementId;
  const cardId = intent.payload?.cardId;
  if (!engagementId || !cardId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "missing_engagement_or_card",
    });
    return false;
  }
  const result = playEngagementCard(
    engagementId,
    intent.factionId,
    cardId,
    world,
  );
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  for (const e of result.journal || []) journalPush(journal, e);
  journalPush(journal, {
    type: "play_card",
    intentId: intent.id,
    engagementId,
    factionId: intent.factionId,
    cardId,
    battleStatus: result.engagement?.cardBattle?.status,
  });
  return true;
}
