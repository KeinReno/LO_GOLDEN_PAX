/**
 * Internal blocs (houses/factions within a faction) — seed + influence/
 * support/threat recompute. Extracted from ../courtGovernance.mjs.
 */
import { getContent } from "../contentLoader.mjs";
import { npcAvailable } from "./council.mjs";

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
