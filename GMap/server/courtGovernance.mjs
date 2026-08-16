/**
 * Court governance — scoped NPC effects, internal blocs, council seats.
 * Roster CRUD/posting live in courtRoster.mjs (extends this; does not replace it).
 *
 * Consumers: production_mult (economyTick + npcProductionMultForSystem),
 * stat_mult (combatResolve applyCourtStatMultToGroups), pop_growth_mult
 * (economyTick growth stack), npc_task_speed_mult (processNpcTasks via
 * npcTaskSpeedMult). Produced, not consumed here: loyalty_add (loyalty.mjs
 * already has a consumer), stability_add (stability.mjs), move_cost_mult
 * (movement spec).
 */
import { getContent } from "./contentLoader.mjs";
import { buildModifierStack } from "./modifierStack.mjs";

function cloneEffects(list) {
  if (!Array.isArray(list)) return [];
  return list.map((e) => ({
    effect: e.effect,
    args: e.args ? { ...e.args } : undefined,
  }));
}

export function npcAvailable(npc) {
  return npc && npc.status !== "dead" && npc.status !== "hidden";
}

/**
 * Player character always owns seat.ruler. Resolves rulerNpcId from
 * isPlayerRuler / seated ruler, then locks that NPC on the throne.
 */
export function ensurePlayerRulers(world) {
  for (const fac of world.factions ?? []) {
    if (!Array.isArray(fac.npcs)) continue;
    let rulerId =
      typeof fac.rulerNpcId === "string" && fac.rulerNpcId
        ? fac.rulerNpcId
        : null;
    if (rulerId) {
      const ok = fac.npcs.find((n) => n.id === rulerId && npcAvailable(n));
      if (!ok) rulerId = null;
    }
    if (!rulerId) {
      const marked = fac.npcs.find((n) => n.isPlayerRuler && npcAvailable(n));
      if (marked) rulerId = marked.id;
    }
    if (!rulerId) {
      const seated = fac.npcs.find(
        (n) => n.councilSeat === "seat.ruler" && npcAvailable(n),
      );
      if (seated) rulerId = seated.id;
    }
    if (!rulerId) {
      fac.rulerNpcId = null;
      continue;
    }
    fac.rulerNpcId = rulerId;
    for (const n of fac.npcs) {
      if (n.id === rulerId) {
        n.isPlayerRuler = true;
        n.councilSeat = "seat.ruler";
        if (!n.posting || n.posting.kind !== "court") {
          n.posting = {
            kind: "court",
            sinceTurn:
              typeof n.posting?.sinceTurn === "number" ? n.posting.sinceTurn : 0,
          };
        }
        if (n.status === "away") n.status = "active";
      } else {
        if (n.isPlayerRuler) n.isPlayerRuler = false;
        if (n.councilSeat === "seat.ruler") n.councilSeat = null;
      }
    }
  }
}

/** Default unlocked seats from content catalog. */
export function defaultUnlockedSeatIds(content = getContent()) {
  const seats = content?.council_seats?.seats || {};
  return Object.values(seats)
    .filter((s) => s?.defaultUnlocked !== false)
    .map((s) => s.id);
}

/** Ensure faction.council exists with unlocked seats. */
export function ensureFactionCouncil(fac, content = getContent()) {
  if (!fac.council || typeof fac.council !== "object") {
    fac.council = {
      unlockedSeatIds: defaultUnlockedSeatIds(content),
      lockedSeatIds: [],
      seatPortfolios: {},
    };
  }
  if (!Array.isArray(fac.council.unlockedSeatIds)) {
    fac.council.unlockedSeatIds = defaultUnlockedSeatIds(content);
  }
  if (!Array.isArray(fac.council.lockedSeatIds)) {
    fac.council.lockedSeatIds = [];
  }
  if (
    !fac.council.seatPortfolios ||
    typeof fac.council.seatPortfolios !== "object"
  ) {
    fac.council.seatPortfolios = {};
  }
  return fac.council;
}

/** Assigned portfolio or catalog default for a seat. */
export function resolveSeatPortfolioId(fac, seatId, content = getContent()) {
  const assigned = fac?.council?.seatPortfolios?.[seatId];
  if (typeof assigned === "string" && assigned) return assigned;
  const def = content?.council_seats?.seats?.[seatId];
  return def?.defaultPortfolio || null;
}

export function getPortfolioDef(portfolioId, content = getContent()) {
  if (!portfolioId) return null;
  return content?.council_seats?.portfolios?.[portfolioId] || null;
}

/** Effects + display label for an occupied seat (portfolio preferred). */
export function resolveOccupiedSeatBonus(fac, seatId, content = getContent()) {
  const seatDef = content?.council_seats?.seats?.[seatId] || null;
  const portfolioId = resolveSeatPortfolioId(fac, seatId, content);
  const portfolioDef = getPortfolioDef(portfolioId, content);
  const effects =
    portfolioDef?.factionEffects?.length > 0
      ? portfolioDef.factionEffects
      : seatDef?.factionEffects || [];
  const label =
    portfolioDef?.label ||
    seatDef?.label ||
    seatId;
  return { seatDef, portfolioId, portfolioDef, effects, label };
}

export function isSeatUnlocked(fac, seatId, content = getContent()) {
  const council = ensureFactionCouncil(fac, content);
  if (council.lockedSeatIds.includes(seatId)) return false;
  if (council.unlockedSeatIds.includes(seatId)) return true;
  const def = content?.council_seats?.seats?.[seatId];
  return def?.defaultUnlocked !== false;
}

export function unlockCouncilSeat(fac, seatId, content = getContent()) {
  const council = ensureFactionCouncil(fac, content);
  council.lockedSeatIds = council.lockedSeatIds.filter((id) => id !== seatId);
  if (!council.unlockedSeatIds.includes(seatId)) {
    council.unlockedSeatIds.push(seatId);
  }
  return council;
}

export function lockCouncilSeat(fac, seatId, content = getContent()) {
  const council = ensureFactionCouncil(fac, content);
  council.unlockedSeatIds = council.unlockedSeatIds.filter(
    (id) => id !== seatId,
  );
  if (!council.lockedSeatIds.includes(seatId)) {
    council.lockedSeatIds.push(seatId);
  }
  // Vacate seat
  for (const npc of fac.npcs ?? []) {
    if (npc.councilSeat === seatId) npc.councilSeat = null;
  }
  return council;
}

/** Seed internal blocs from catalog if missing. */
export function ensureInternalBlocs(fac, content = getContent()) {
  const catalog = content?.internal_blocs?.blocs || {};
  if (!Array.isArray(fac.internalBlocs)) fac.internalBlocs = [];
  if (fac.internalBlocs.length === 0 && Object.keys(catalog).length) {
    const defaults = ["bloc.crown", "bloc.guest"];
    for (const id of defaults) {
      const def = catalog[id];
      if (!def) continue;
      fac.internalBlocs.push(blocFromCatalog(def));
    }
  }
  // Fill missing metadata from catalog for existing ids
  for (const bloc of fac.internalBlocs) {
    const def = catalog[bloc.id];
    if (!def) continue;
    if (!bloc.kind && def.kind) bloc.kind = def.kind;
    if (!bloc.raceIds && def.raceIds) bloc.raceIds = [...def.raceIds];
    if (!bloc.color && def.color) bloc.color = def.color;
    if (!bloc.description && def.description) bloc.description = def.description;
  }
  return fac.internalBlocs;
}

function blocFromCatalog(def) {
  return {
    id: def.id,
    name: def.name,
    color: def.color,
    kind: def.kind,
    stance: def.stance || "neutral",
    agenda: def.agenda,
    description: def.description,
    raceIds: Array.isArray(def.raceIds) ? [...def.raceIds] : undefined,
    leaderNpcId: null,
    homeSystemId: def.homeSystemId,
    homeSystemName: def.homeSystemName,
    influence: 0,
    support: 0,
    threat: 0,
  };
}

/**
 * Recompute influence / support / threat for internal blocs from seats + postings + leaders.
 */
export function recomputeInternalBlocs(world) {
  const content = getContent();
  for (const fac of world.factions ?? []) {
    ensureInternalBlocs(fac, content);
    const byId = new Map(fac.internalBlocs.map((b) => [b.id, b]));
    for (const bloc of fac.internalBlocs) {
      bloc.influence = 0;
      bloc.support = 0;
      bloc.threat = 0;
      // Refresh leader from NPCs marked isBlocLeader (alive)
      const leaders = (fac.npcs ?? []).filter(
        (n) =>
          n.blocId === bloc.id &&
          n.isBlocLeader &&
          npcAvailable(n),
      );
      if (leaders.length) {
        bloc.leaderNpcId = leaders[0].id;
      } else if (bloc.leaderNpcId) {
        const still = (fac.npcs ?? []).find(
          (n) => n.id === bloc.leaderNpcId && npcAvailable(n),
        );
        if (!still) bloc.leaderNpcId = null;
      }
    }

    for (const npc of fac.npcs ?? []) {
      if (!npcAvailable(npc)) continue;
      const bloc = npc.blocId ? byId.get(npc.blocId) : null;
      if (bloc) {
        let w = 3;
        if (npc.councilSeat) w += 10;
        if (npc.isBlocLeader || bloc.leaderNpcId === npc.id) w += 12;
        if (npc.raceLeadership?.raceId) w += 8;
        const kind = npc.posting?.kind || "court";
        if (kind === "governor") w += 14;
        else if (kind === "commander" || kind === "admiral") w += 12;
        else if (kind === "court" && !npc.councilSeat) w += 1;
        bloc.influence += w;
      }
      // Race leadership without bloc still nudges matching blocs by raceIds
      if (npc.raceLeadership?.raceId) {
        for (const b of fac.internalBlocs) {
          if (b.id === npc.blocId) continue;
          if ((b.raceIds || []).includes(npc.raceLeadership.raceId)) {
            b.influence += 4;
          }
        }
      }
    }

    for (const bloc of fac.internalBlocs) {
      // Vacant house/church leadership → pressure
      const needsLeader =
        bloc.kind === "house" ||
        bloc.kind === "church" ||
        bloc.kind === "race_caucus";
      const vacant = needsLeader && !bloc.leaderNpcId;
      if (vacant) bloc.influence = Math.max(bloc.influence, 8);

      bloc.influence = Math.min(100, Math.round(bloc.influence));
      const stance = bloc.stance || "neutral";
      if (stance === "loyal") {
        bloc.support = bloc.influence;
        bloc.threat = Math.floor(bloc.influence * (vacant ? 0.35 : 0.12));
      } else if (stance === "ambitious") {
        bloc.support = Math.floor(bloc.influence * 0.55);
        bloc.threat = Math.floor(bloc.influence * (vacant ? 0.75 : 0.55));
      } else if (stance === "hostile") {
        bloc.support = Math.floor(bloc.influence * 0.15);
        bloc.threat = bloc.influence;
      } else {
        bloc.support = Math.floor(bloc.influence * 0.4);
        bloc.threat = Math.floor(bloc.influence * (vacant ? 0.45 : 0.28));
      }
    }
  }
}

function pushScoped(fac, effect, source, scope, targetId) {
  if (!effect?.effect) return;
  fac.activeEffects.push({
    effect: effect.effect,
    args: effect.args ? { ...effect.args } : undefined,
    scope: scope || "faction",
    ...(targetId ? { targetId } : {}),
    source,
  });
}

function postingTarget(npc) {
  const p = npc.posting;
  if (!p || p.kind === "court") return null;
  if (p.kind === "governor" && (p.systemId || p.targetId)) {
    return { scope: "system", targetId: p.systemId || p.targetId };
  }
  if (p.kind === "commander" && (p.legionId || p.forceId || p.targetId)) {
    return { scope: "legion", targetId: p.legionId || p.forceId || p.targetId };
  }
  if (p.kind === "admiral" && (p.fleetId || p.forceId || p.targetId)) {
    return { scope: "fleet", targetId: p.fleetId || p.forceId || p.targetId };
  }
  return null;
}

/**
 * Rebuild faction.activeEffects from NPC traits + postings + occupied seats.
 * Effects may carry scope: faction | system | legion | fleet (+ targetId).
 */
export function syncNpcPassiveEffects(world) {
  ensurePlayerRulers(world);
  const content = getContent();
  const traitCatalog = content.npc_traits?.traits || {};
  const postingCatalog = content.npc_postings?.postings || {};
  let n = 0;

  for (const fac of world.factions ?? []) {
    ensureFactionCouncil(fac, content);
    ensureInternalBlocs(fac, content);

    if (!Array.isArray(fac.activeEffects)) fac.activeEffects = [];
    fac.activeEffects = fac.activeEffects.filter(
      (e) =>
        e?.source?.kind !== "npc_trait" &&
        e?.source?.kind !== "npc_posting" &&
        e?.source?.kind !== "council_seat",
    );

    for (const npc of fac.npcs ?? []) {
      if (!npcAvailable(npc)) continue;
      const target = postingTarget(npc);

      for (const traitId of npc.traitIds ?? []) {
        const def = traitCatalog[traitId];
        if (!def) continue;
        const label = `${npc.name}: ${def.name || traitId}`;
        const source = {
          kind: "npc_trait",
          id: `${npc.id}:${traitId}`,
          label,
        };
        for (const e of cloneEffects(def.effects)) {
          pushScoped(fac, e, source, "faction", null);
          n++;
        }
        // Local posting copy when trait asks for both / has postingEffects
        if (
          target &&
          (def.scope === "both" || Array.isArray(def.postingEffects))
        ) {
          const local = cloneEffects(
            def.postingEffects?.length ? def.postingEffects : def.effects,
          );
          for (const e of local) {
            pushScoped(fac, e, source, target.scope, target.targetId);
            n++;
          }
        }
      }

      const posting = npc.posting;
      if (posting && posting.kind !== "court") {
        const postDef = postingCatalog[posting.kind];
        if (postDef) {
          const source = {
            kind: "npc_posting",
            id: `${npc.id}:${posting.kind}`,
            label: `${npc.name}: ${postDef.name || posting.kind}`,
          };
          const localKey =
            posting.kind === "governor"
              ? "systemEffects"
              : posting.kind === "commander"
                ? "legionEffects"
                : posting.kind === "admiral"
                  ? "fleetEffects"
                  : null;
          const localList = localKey ? postDef[localKey] : null;
          if (Array.isArray(localList) && localList.length && target) {
            for (const e of cloneEffects(localList)) {
              pushScoped(fac, e, source, target.scope, target.targetId);
              n++;
            }
          }
          const factionList = Array.isArray(postDef.factionEffects)
            ? postDef.factionEffects
            : Array.isArray(postDef.effects)
              ? postDef.effects
              : [];
          for (const e of cloneEffects(factionList)) {
            pushScoped(fac, e, source, "faction", null);
            n++;
          }
          // Legacy: only `effects`, no systemEffects — keep faction + mirror to target
          if (
            (!localList || !localList.length) &&
            Array.isArray(postDef.effects) &&
            postDef.effects.length &&
            target
          ) {
            for (const e of cloneEffects(postDef.effects)) {
              pushScoped(fac, e, source, target.scope, target.targetId);
              n++;
            }
          }
        }
      }

      // Occupied seat → realm passive from portfolio (or seat fallback)
      if (npc.councilSeat && isSeatUnlocked(fac, npc.councilSeat, content)) {
        const bonus = resolveOccupiedSeatBonus(fac, npc.councilSeat, content);
        if (bonus.effects.length) {
          const source = {
            kind: "council_seat",
            id: `${npc.id}:${npc.councilSeat}`,
            label: `${npc.name}: ${bonus.label}`,
          };
          for (const e of cloneEffects(bonus.effects)) {
            pushScoped(fac, e, source, "faction", null);
            n++;
          }
        }
      }
    }
  }

  recomputeInternalBlocs(world);
  return n;
}

/** True if an owned system has an active governor NPC. */
export function systemHasGovernor(world, systemId, factionId) {
  const fac = (world.factions ?? []).find((f) => f.id === factionId);
  if (!fac) return false;
  return (fac.npcs ?? []).some(
    (n) =>
      npcAvailable(n) &&
      n.posting?.kind === "governor" &&
      n.posting?.systemId === systemId,
  );
}

/**
 * Loyalty flat from faction.activeEffects scoped to this system,
 * plus ungoverned penalty.
 */
export function npcLoyaltyDeltaForSystem(world, system, factionId) {
  const fac = (world.factions ?? []).find((f) => f.id === factionId);
  if (!fac) return 0;
  let flat = 0;
  for (const e of fac.activeEffects ?? []) {
    if (e?.effect !== "loyalty_add") continue;
    if (e.scope === "system" && e.targetId === system.id) {
      flat += Number(e.args?.amount ?? 0);
    }
  }
  const content = getContent();
  const penalty = Number(
    content?.npc_postings?.postings?.governor?.ungovernedLoyaltyPenalty ?? 0,
  );
  if (
    penalty > 0 &&
    (system.ownerFactionId === factionId) &&
    !systemHasGovernor(world, system.id, factionId)
  ) {
    // Only penalize inhabited systems
    const pop = (system.planets ?? []).reduce(
      (s, p) => s + (p.population || 0),
      0,
    );
    if (pop > 0) flat -= penalty;
  }
  return flat;
}

/**
 * Production mult for a resource on a specific system from scoped NPC effects.
 * Returns multiplier (1 = none).
 */
export function npcProductionMultForSystem(world, factionId, systemId, resource) {
  const fac = (world.factions ?? []).find((f) => f.id === factionId);
  if (!fac) return 1;
  let mult = 1;
  for (const e of fac.activeEffects ?? []) {
    if (e?.effect !== "production_mult") continue;
    if (e.scope !== "system" || e.targetId !== systemId) continue;
    const res = e.args?.resource;
    if (res && res !== resource && res !== "*") continue;
    const m = Number(e.args?.mult ?? 1);
    if (Number.isFinite(m) && m > 0) mult *= m;
  }
  return mult;
}

/** Faction-scope effects only (for economy ModifierStack). */
export function factionScopedActiveEffects(faction) {
  return (faction?.activeEffects ?? []).filter((e) => {
    const scope = e?.scope || "faction";
    return scope === "faction";
  });
}

/** Direct npc_task_speed_mult (Part 5) — not via the general combat/econ consumers. */
export function npcTaskSpeedMult(faction) {
  const relevant = factionScopedActiveEffects(faction).filter(
    (e) => e?.effect === "npc_task_speed_mult",
  );
  if (!relevant.length) return 1;
  const ch = buildModifierStack(relevant).channels["npc_task:*"];
  const m = Number(ch?.mult ?? 1);
  return Number.isFinite(m) && m > 0 ? m : 1;
}

/** pop_growth_* from occupied seats / traits / postings (faction scope). */
export function courtPopGrowthEffects(faction) {
  return factionScopedActiveEffects(faction).filter(
    (e) => e?.effect === "pop_growth_mult" || e?.effect === "pop_growth_flat",
  );
}

/** Explain lines for UI: realm vs local for one NPC. */
export function explainNpcInfluence(npc, content = getContent(), fac = null) {
  if (!npc) return { realm: [], local: [] };
  const traitCatalog = content?.npc_traits?.traits || {};
  const postingCatalog = content?.npc_postings?.postings || {};
  const realm = [];
  const local = [];

  for (const traitId of npc.traitIds ?? []) {
    const def = traitCatalog[traitId];
    if (!def) continue;
    for (const e of def.effects || []) {
      realm.push({
        label: def.name || traitId,
        effect: e.effect,
        args: e.args,
      });
    }
    if (
      npc.posting &&
      npc.posting.kind !== "court" &&
      (def.scope === "both" || def.postingEffects)
    ) {
      for (const e of def.postingEffects || def.effects || []) {
        local.push({
          label: def.name || traitId,
          effect: e.effect,
          args: e.args,
        });
      }
    }
  }

  const posting = npc.posting;
  if (posting && posting.kind !== "court") {
    const postDef = postingCatalog[posting.kind];
    if (postDef) {
      const localKey =
        posting.kind === "governor"
          ? "systemEffects"
          : posting.kind === "commander"
            ? "legionEffects"
            : "fleetEffects";
      for (const e of postDef[localKey] || []) {
        local.push({
          label: postDef.name || posting.kind,
          effect: e.effect,
          args: e.args,
        });
      }
      for (const e of postDef.factionEffects || postDef.effects || []) {
        realm.push({
          label: `${postDef.name || posting.kind} (держава)`,
          effect: e.effect,
          args: e.args,
        });
      }
    }
  }

  if (npc.councilSeat) {
    const bonus = resolveOccupiedSeatBonus(fac, npc.councilSeat, content);
    for (const e of bonus.effects || []) {
      realm.push({
        label: bonus.label,
        effect: e.effect,
        args: e.args,
      });
    }
  }

  return { realm, local };
}
