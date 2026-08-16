/**
 * Internal blocs — display-only scoring.
 *
 * `recomputeInternalBlocs` is a verbatim port of GMap/server/courtGovernance.mjs
 * (weight-per-seat/leadership/posting, stance→support/threat, vacant
 * house/church/race_caucus pressure). Influence/support/threat are never
 * consumed by any mechanical system here either — GMap only clamped them
 * 0–100 for schema safety and showed them to the GM. Keeping blocs and
 * the (separate-spec) stability mechanic as independent concerns was an
 * explicit decision, not an oversight.
 *
 * `ensureInternalBlocs` seed is NEW: GMap only auto-inserted bloc.crown +
 * bloc.guest; this project seeds every template in
 * content/core/internal_blocs.json when a faction has none yet. Metadata
 * fill-from-catalog for existing ids is still the GMap behavior.
 */
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

export function ensureInternalBlocs(fac, content) {
  const catalog = content?.internal_blocs?.blocs || {};
  let blocs = Array.isArray(fac?.internalBlocs) ? fac.internalBlocs.map((b) => ({ ...b })) : [];
  if (blocs.length === 0 && Object.keys(catalog).length) {
    for (const def of Object.values(catalog)) {
      if (def?.id) blocs.push(blocFromCatalog(def));
    }
  }
  for (const bloc of blocs) {
    const def = catalog[bloc.id];
    if (!def) continue;
    if (!bloc.kind && def.kind) bloc.kind = def.kind;
    if (!bloc.raceIds && def.raceIds) bloc.raceIds = [...def.raceIds];
    if (!bloc.color && def.color) bloc.color = def.color;
    if (!bloc.description && def.description) bloc.description = def.description;
    if (!bloc.name && def.name) bloc.name = def.name;
    if (!bloc.stance && def.stance) bloc.stance = def.stance;
    if (!bloc.agenda && def.agenda) bloc.agenda = def.agenda;
  }
  return blocs;
}

function npcAvailable(npc) {
  return npc && npc.status !== "dead" && npc.status !== "hidden";
}

/**
 * @param {{ internalBlocs?: object[] }} faction
 * @param {object[]} npcs
 * @param {object} content
 */
export function recomputeInternalBlocs(faction, npcs, content) {
  const blocs = ensureInternalBlocs(faction, content);
  const byId = new Map(blocs.map((b) => [b.id, b]));
  for (const bloc of blocs) {
    bloc.influence = 0;
    bloc.support = 0;
    bloc.threat = 0;
    const leaders = (npcs ?? []).filter((n) => n.blocId === bloc.id && n.isBlocLeader && npcAvailable(n));
    if (leaders.length) {
      bloc.leaderNpcId = leaders[0].id;
    } else if (bloc.leaderNpcId) {
      const still = (npcs ?? []).find((n) => n.id === bloc.leaderNpcId && npcAvailable(n));
      if (!still) bloc.leaderNpcId = null;
    }
  }

  for (const npc of npcs ?? []) {
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
    if (npc.raceLeadership?.raceId) {
      for (const b of blocs) {
        if (b.id === npc.blocId) continue;
        if ((b.raceIds || []).includes(npc.raceLeadership.raceId)) {
          b.influence += 4;
        }
      }
    }
  }

  for (const bloc of blocs) {
    const needsLeader = bloc.kind === "house" || bloc.kind === "church" || bloc.kind === "race_caucus";
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
  return blocs;
}
