/**
 * Narrative POI / refugees / timers / consequence presets (P6).
 * Extracted from ../narrative.mjs — see that file's re-export barrel.
 */
import { getContent } from "../contentLoader.mjs";
import { getRelation } from "../opinionTick.mjs";

const REFUGEE_ELIGIBLE_RELATIONS = new Set(["alliance", "migration_treaty"]);

/** Dest may receive refugees from moverFactionId (own / alliance / migration_treaty). */
export function isRefugeeEligibleDest(world, destSys, moverFactionId) {
  if (!destSys) return false;
  if (!moverFactionId) return true;
  const owner = destSys.ownerFactionId;
  if (owner === moverFactionId) return true;
  if (!owner) return false;
  return REFUGEE_ELIGIBLE_RELATIONS.has(getRelation(world, moverFactionId, owner));
}

/**
 * Blend incoming pop into planet.raceComposition (weighted by headcount).
 * @param {object} planet
 * @param {number} amount
 * @param {{ raceId: string, percent?: number }[]} [incomingComposition]
 */
export function addPopWithRaceComposition(planet, amount, incomingComposition) {
  if (!planet || !(amount > 0)) return;
  const before = Math.max(0, Number(planet.population) || 0);
  const add = Math.floor(amount);
  planet.population = before + add;

  const incoming = (incomingComposition || []).filter((s) => s?.raceId);
  if (!incoming.length) return;

  const byRace = new Map();
  for (const s of planet.raceComposition || []) {
    if (!s?.raceId) continue;
    const w = (before * (Number(s.percent) || 0)) / 100;
    byRace.set(s.raceId, (byRace.get(s.raceId) || 0) + w);
  }
  for (const s of incoming) {
    const w = (add * (Number(s.percent) || 0)) / 100;
    byRace.set(s.raceId, (byRace.get(s.raceId) || 0) + w);
  }
  const total = [...byRace.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) {
    planet.raceComposition = incoming.map((s) => ({
      raceId: s.raceId,
      percent: Number(s.percent) || 0,
    }));
    return;
  }
  const entries = [...byRace.entries()].map(([raceId, w]) => ({
    raceId,
    percent: Math.round((w / total) * 1000) / 10,
  }));
  const sum = entries.reduce((a, e) => a + e.percent, 0);
  if (entries.length && Math.abs(sum - 100) > 0.05) {
    entries[0].percent = Math.round((entries[0].percent + (100 - sum)) * 10) / 10;
  }
  planet.raceComposition = entries;
}

function planetDominantComposition(planet, faction) {
  if (planet?.raceComposition?.length) return planet.raceComposition;
  const raceId =
    faction?.primaryRaceId ||
    faction?.primaryRace ||
    faction?.dominantRaceId ||
    "race_human";
  return [{ raceId, percent: 100 }];
}

export function systemSpaceObjectTags(sys) {
  const raw = sys?.spaceObjects;
  if (Array.isArray(raw) && raw.length) {
    return [...new Set(raw.filter((t) => t && t !== "none"))];
  }
  if (sys?.poiType && sys.poiType !== "none") return [sys.poiType];
  return [];
}

export function addSpaceObject(sys, tag) {
  if (!tag || tag === "none") return;
  const set = new Set(systemSpaceObjectTags(sys));
  set.add(tag);
  sys.spaceObjects = [...set];
  if (!sys.poiType || sys.poiType === "none") sys.poiType = tag;
}

export function removeSpaceObject(sys, tag) {
  const next = systemSpaceObjectTags(sys).filter((t) => t !== tag);
  sys.spaceObjects = next;
  if (sys.poiType === tag) sys.poiType = next[0] || "none";
}

function neighborIds(world, systemId) {
  const out = [];
  for (const l of world.links ?? []) {
    if (l.fromId === systemId) out.push(l.toId);
    else if (l.toId === systemId) out.push(l.fromId);
  }
  return out;
}

/** BFS hop distance; Infinity if unreachable. */
export function hopDistance(world, fromId, toId) {
  if (!fromId || !toId) return Infinity;
  if (fromId === toId) return 0;
  const q = [[fromId, 0]];
  const seen = new Set([fromId]);
  while (q.length) {
    const [id, d] = q.shift();
    for (const n of neighborIds(world, id)) {
      if (seen.has(n)) continue;
      if (n === toId) return d + 1;
      seen.add(n);
      q.push([n, d + 1]);
    }
  }
  return Infinity;
}

export function collectPoiEffects(world, factionId, content) {
  const effects = [];
  const pois = content.pois || {};
  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    for (const tag of systemSpaceObjectTags(sys)) {
      const def = pois[tag] || pois[`poi.${tag}`];
      if (!def?.effects) continue;
      for (const e of def.effects) {
        effects.push({
          ...e,
          source: {
            kind: "poi",
            id: `${sys.id}:${tag}`,
            label: def.name || tag,
          },
        });
      }
    }
  }
  return effects;
}

/** Per-system POI effects (for pop growth / forbid on target). */
export function collectSystemPoiEffects(sys, content) {
  const effects = [];
  const pois = content.pois || {};
  for (const tag of systemSpaceObjectTags(sys)) {
    const def = pois[tag] || pois[`poi.${tag}`];
    if (!def?.effects) continue;
    for (const e of def.effects) {
      effects.push({
        ...e,
        source: {
          kind: "poi",
          id: `${sys.id}:${tag}`,
          label: def.name || tag,
        },
      });
    }
  }
  return effects;
}

export function isIntentForbiddenByEffects(effects, intentId) {
  return (effects || []).some(
    (e) => e.effect === "forbid_intent" && e.args?.intentId === intentId,
  );
}

export function ownedDepotSystemIds(world, factionId) {
  return (world.systems ?? [])
    .filter(
      (s) =>
        s.ownerFactionId === factionId &&
        systemSpaceObjectTags(s).includes("depot"),
    )
    .map((s) => s.id);
}

export function capitalSystemId(world, factionId) {
  const cap = (world.systems ?? []).find(
    (s) => s.ownerFactionId === factionId && s.isCapital,
  );
  return cap?.id || null;
}

/**
 * Attack range vs depot logistics.
 * @param {object} [payload] intent payload (fleetId / legionId for unit-origin range)
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function checkDepotAttackRange(world, factionId, toSystemId, payload) {
  const content = getContent();
  const rules = content.rules?.depot || {};
  const presentAtTarget =
    (world.fleets ?? []).some(
      (f) => f.factionId === factionId && f.systemId === toSystemId,
    ) ||
    (world.legions ?? []).some(
      (l) => l.factionId === factionId && l.systemId === toSystemId,
    );
  if (presentAtTarget) return { ok: true };

  const depots = ownedDepotSystemIds(world, factionId);
  const maxHops = depots.length
    ? rules.maxAttackHopsWithDepot ?? 5
    : rules.maxAttackHopsWithoutDepot ?? 2;
  const anchors = depots.length
    ? depots
    : [capitalSystemId(world, factionId)].filter(Boolean);
  if (!anchors.length) {
    return {
      ok: false,
      error: "Нет депо/столицы — дальняя атака запрещена",
    };
  }
  let best = Infinity;
  for (const a of anchors) {
    best = Math.min(best, hopDistance(world, a, toSystemId));
  }
  const fleetId = payload?.fleetId;
  if (fleetId) {
    const f = (world.fleets ?? []).find((x) => x.id === fleetId);
    if (f?.factionId === factionId && f.systemId) {
      if (f.systemId === toSystemId) return { ok: true };
      best = Math.min(best, hopDistance(world, f.systemId, toSystemId));
    }
  }
  const legionId = payload?.legionId;
  if (legionId) {
    const leg = (world.legions ?? []).find((x) => x.id === legionId);
    if (leg?.factionId === factionId && leg.systemId) {
      if (leg.systemId === toSystemId) return { ok: true };
      best = Math.min(best, hopDistance(world, leg.systemId, toSystemId));
    }
  }
  if (best > maxHops) {
    return {
      ok: false,
      error: `Цель дальше ${maxHops} прыжков от депо/столицы (сейчас ${best === Infinity ? "∞" : best})`,
    };
  }
  return { ok: true };
}

export function scheduleTimer(sys, { expiresTurn, action, label }) {
  if (!Array.isArray(sys.timers)) sys.timers = [];
  sys.timers.push({
    id: `tm_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    expiresTurn,
    action: action || { kind: "noop" },
    label: label || null,
  });
}

function applyTimerAction(world, sys, action, journal) {
  const kind = action?.kind;
  if (kind === "remove_poi" && action.poi) {
    removeSpaceObject(sys, action.poi);
    journal.push({
      type: "timer_remove_poi",
      systemId: sys.id,
      poi: action.poi,
    });
  } else if (kind === "add_poi" && action.poi) {
    addSpaceObject(sys, action.poi);
    journal.push({
      type: "timer_add_poi",
      systemId: sys.id,
      poi: action.poi,
    });
  } else if (kind === "clear_activity") {
    sys.activity = "none";
    journal.push({ type: "timer_clear_activity", systemId: sys.id });
  } else if (kind === "set_activity" && action.activity) {
    sys.activity = action.activity;
    journal.push({
      type: "timer_set_activity",
      systemId: sys.id,
      activity: action.activity,
    });
  }
}

export function processSystemTimers(world, turn, journal) {
  let n = 0;
  for (const sys of world.systems ?? []) {
    if (!Array.isArray(sys.timers) || sys.timers.length === 0) continue;
    const keep = [];
    for (const t of sys.timers) {
      // Missing expiresTurn must NOT fire immediately — keep until scheduled.
      if (t.expiresTurn == null || !Number.isFinite(Number(t.expiresTurn))) {
        keep.push(t);
        continue;
      }
      if (Number(t.expiresTurn) <= turn) {
        journal.push({
          type: "timer_fired",
          systemId: sys.id,
          systemName: sys.name,
          label: t.label || null,
          action: t.action?.kind || "noop",
        });
        applyTimerAction(world, sys, t.action, journal);
        n++;
      } else {
        keep.push(t);
      }
    }
    sys.timers = keep;
  }
  return n;
}

/**
 * Apply consequence or system preset to systems.
 */
export function applyPresetToSystems(world, systemIds, preset, turn, journal) {
  if (!preset) return { ok: false, error: "unknown preset" };
  const ids = new Set(systemIds || []);
  let touched = 0;
  for (const sys of world.systems ?? []) {
    if (!ids.has(sys.id)) continue;
    for (const tag of preset.remove || []) removeSpaceObject(sys, tag);
    for (const tag of preset.add || []) addSpaceObject(sys, tag);
    if (preset.activity != null) sys.activity = preset.activity;
    if (preset.gmNotes != null) sys.gmNotes = preset.gmNotes;
    if (preset.timerTurns && preset.timerAction) {
      scheduleTimer(sys, {
        expiresTurn: (turn ?? 0) + preset.timerTurns,
        action: preset.timerAction,
        label: preset.name,
      });
    }
    touched++;
    journal?.push({
      type: "preset_applied",
      systemId: sys.id,
      presetId: preset.id,
    });
  }
  return { ok: true, touched };
}

/**
 * Spawn / reinforce refugee camp on a neighbor after pop loss / combat.
 */
export function spawnRefugees(world, fromSystemId, amount, journal, opts = {}) {
  const content = getContent();
  const share = opts.share ?? content.rules?.population?.refugeeShare ?? 0.5;
  const moved = Math.max(1, Math.floor((amount || 1) * share));
  const from = (world.systems ?? []).find((s) => s.id === fromSystemId);
  if (!from) return null;

  const moverFactionId = opts.factionId || from.ownerFactionId || null;
  const fromFac = moverFactionId
    ? (world.factions ?? []).find((f) => f.id === moverFactionId)
    : null;
  const srcPlanet = (from.planets || []).find((p) => (p.population || 0) > 0);
  const incomingComp = planetDominantComposition(srcPlanet || from.planets?.[0], fromFac);

  const neighbors = neighborIds(world, fromSystemId)
    .map((id) => (world.systems ?? []).find((s) => s.id === id))
    .filter(Boolean);
  const eligible = neighbors.filter((s) =>
    isRefugeeEligibleDest(world, s, moverFactionId),
  );
  if (!eligible.length) {
    addSpaceObject(from, "refugees");
    journal?.push({
      type: "refugees_camp",
      systemId: from.id,
      amount: moved,
      note: neighbors.length ? "no_eligible_neighbor" : "no_neighbor",
    });
    return from.id;
  }

  // Prefer existing camp, else lowest pop neighbor, else first
  let dest =
    eligible.find((s) => systemSpaceObjectTags(s).includes("refugees")) ||
    [...eligible].sort(
      (a, b) =>
        (a.planets?.[0]?.population || 0) - (b.planets?.[0]?.population || 0),
    )[0];

  addSpaceObject(dest, "refugees");
  const planet = (dest.planets || [])[0];
  if (planet) {
    addPopWithRaceComposition(planet, moved, incomingComp);
  }
  journal?.push({
    type: "refugees_camp",
    fromSystemId,
    systemId: dest.id,
    amount: moved,
  });
  return dest.id;
}

/**
 * Move refugees along humanitarian corridor (intent).
 */
export function applyRefugeeConvoy(world, intent, journal) {
  const fromId = intent.payload?.fromSystemId;
  const toId = intent.payload?.toSystemId;
  const amount = Math.max(1, Math.floor(intent.payload?.amount || 5));
  const from = (world.systems ?? []).find((s) => s.id === fromId);
  const to = (world.systems ?? []).find((s) => s.id === toId);
  if (!from || !to) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "system_missing",
    });
    return false;
  }
  if (!systemSpaceObjectTags(from).includes("refugees")) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "no_refugee_camp",
    });
    return false;
  }
  const hops = hopDistance(world, fromId, toId);
  if (hops > 3) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "corridor_too_long",
    });
    return false;
  }

  const moverFactionId = intent.factionId || from.ownerFactionId || null;
  if (!isRefugeeEligibleDest(world, to, moverFactionId)) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "dest_not_own_or_allied",
    });
    return false;
  }

  const fromFac = moverFactionId
    ? (world.factions ?? []).find((f) => f.id === moverFactionId)
    : null;

  // drain pop from source if possible; track mix from first drained planet
  let left = amount;
  let incomingComp = null;
  for (const p of from.planets || []) {
    if (left <= 0) break;
    const take = Math.min(left, p.population || 0);
    if (take <= 0) continue;
    if (!incomingComp) {
      incomingComp = planetDominantComposition(p, fromFac);
    }
    p.population = Math.max(0, (p.population || 0) - take);
    left -= take;
  }
  const moved = amount - left;
  if (moved <= 0) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "no_pop",
    });
    return false;
  }

  const destPlanet = (to.planets || [])[0];
  if (destPlanet) {
    addPopWithRaceComposition(
      destPlanet,
      moved,
      incomingComp || [{ raceId: "race_human", percent: 100 }],
    );
  }
  addSpaceObject(to, "refugees");
  // clear empty camp if no pop left and small camp
  const srcPop = (from.planets || []).reduce(
    (s, p) => s + (p.population || 0),
    0,
  );
  if (srcPop <= 0) removeSpaceObject(from, "refugees");

  journal.push({
    type: "refugee_convoy",
    intentId: intent.id,
    fromSystemId: fromId,
    toSystemId: toId,
    amount: moved,
    factionId: intent.factionId,
  });
  return true;
}
