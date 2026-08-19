/**
 * Race/faction normalization: traits, diplomacy treaty migration/backfill,
 * NPC posting/council/internal-bloc shapes.
 * Extracted from ../normalizeWorld.mjs.
 */
import { loadDiplomacyStances } from "./helpers.mjs";

export function normalizeRaces(raw) {
  return (raw.races ?? []).map((r) => ({
    ...r,
    traits: Array.isArray(r?.traits) ? r.traits : [],
    xenorelations:
      r?.xenorelations && typeof r.xenorelations === "object"
        ? r.xenorelations
        : {},
    tags: Array.isArray(r?.tags) ? r.tags : [],
  }));
}

/**
 * @param {object} raw
 * @param {object} meta - already-built meta (used for npc posting sinceTurn fallback)
 * @param {Array} diplomacyEdges
 */
export function normalizeFactions(raw, meta, diplomacyEdges) {
  return (raw.factions ?? []).map((f) => {
    const diplo =
      f?.diplomacy && typeof f.diplomacy === "object"
        ? {
            opinions:
              f.diplomacy.opinions && typeof f.diplomacy.opinions === "object"
                ? f.diplomacy.opinions
                : {},
            treaties: Array.isArray(f.diplomacy.treaties)
              ? f.diplomacy.treaties
              : [],
            history: Array.isArray(f.diplomacy.history)
              ? f.diplomacy.history
              : [],
            lastBrokenTreatyTurn:
              typeof f.diplomacy.lastBrokenTreatyTurn === "number"
                ? f.diplomacy.lastBrokenTreatyTurn
                : null,
          }
        : { opinions: {}, treaties: [], history: [] };

    if (diplo.treaties.length === 0 && diplomacyEdges.length > 0) {
      const stances = loadDiplomacyStances();
      for (const edge of diplomacyEdges) {
        if (!edge || edge.relation === "neutral") continue;
        let otherId = null;
        if (edge.aId === f.id) otherId = edge.bId;
        else if (edge.bId === f.id) otherId = edge.aId;
        if (!otherId) continue;
        const stance = stances[edge.relation] || {};
        const asymmetric =
          stance.asymmetric === true ||
          edge.relation === "vassal" ||
          Array.isArray(stance.effectsSubject) ||
          Array.isArray(stance.effectsOverlord);
        let effects = Array.isArray(stance.effects)
          ? stance.effects.map((e) => ({ ...e }))
          : [];
        if (asymmetric) {
          const subjectId =
            edge.subjectFactionId || edge.vassalFactionId || null;
          const overlordId = edge.overlordFactionId || null;
          if (!subjectId && !overlordId) {
            // Undirected edge — skip rather than apply bilaterally.
            effects = [];
          } else if (f.id === subjectId) {
            effects = Array.isArray(stance.effectsSubject)
              ? stance.effectsSubject.map((e) => ({ ...e }))
              : effects;
          } else if (f.id === overlordId || (subjectId && f.id !== subjectId)) {
            effects = Array.isArray(stance.effectsOverlord)
              ? stance.effectsOverlord.map((e) => ({ ...e }))
              : [];
          } else {
            effects = [];
          }
        }
        diplo.treaties.push({
          id: edge.id || `treaty_${f.id}_${otherId}_${edge.relation}`,
          type: edge.relation,
          withFactionId: otherId,
          startedTurn: raw.meta?.turn ?? 0,
          expiresTurn: null,
          effects,
          track: edge.track === "economic" ? "economic" : "political",
          ...(edge.subjectFactionId || edge.vassalFactionId
            ? {
                subjectFactionId:
                  edge.subjectFactionId || edge.vassalFactionId,
              }
            : {}),
          ...(edge.overlordFactionId
            ? { overlordFactionId: edge.overlordFactionId }
            : {}),
        });
      }
    } else {
      // Backfill empty effects from stance catalog (legacy migrated treaties).
      const stances = loadDiplomacyStances();
      diplo.treaties = diplo.treaties.map((t) => {
        // Respect explicit empty effects (e.g. vassal overlord side).
        if (Array.isArray(t.effects)) return t;
        const stance = stances[t.type] || {};
        const asymmetric =
          stance.asymmetric === true ||
          t.type === "vassal" ||
          Array.isArray(stance.effectsSubject) ||
          Array.isArray(stance.effectsOverlord);
        if (asymmetric) {
          const subjectId = t.subjectFactionId || null;
          if (subjectId && f.id !== subjectId) {
            return {
              ...t,
              effects: Array.isArray(stance.effectsOverlord)
                ? stance.effectsOverlord.map((e) => ({ ...e }))
                : [],
            };
          }
        }
        return {
          ...t,
          effects: Array.isArray(stance.effects)
            ? stance.effects.map((e) => ({ ...e }))
            : [],
        };
      });
    }

    return {
      ...f,
      traits: Array.isArray(f?.traits) ? f.traits : [],
      capitalSystemId: f?.capitalSystemId ?? null,
      primaryRaceId: f?.primaryRaceId ?? f?.primaryRace ?? null,
      defaultCultureId: f?.defaultCultureId ?? "culture.baseline",
      primaryFaith: f?.primaryFaith ?? "faith.secular",
      dominantIdeology: f?.dominantIdeology ?? undefined,
      fxCurrencyId: f?.fxCurrencyId ?? null,
      treasuryPeg: f?.treasuryPeg ?? null,
      pegChangedTurn:
        f?.pegChangedTurn == null || !Number.isFinite(Number(f.pegChangedTurn))
          ? null
          : Number(f.pegChangedTurn),
      lastTreasuryPeg:
        typeof f?.lastTreasuryPeg === "string" && f.lastTreasuryPeg.trim()
          ? f.lastTreasuryPeg.trim()
          : null,
      activeEffects: Array.isArray(f?.activeEffects) ? f.activeEffects : [],
      diplomacy: diplo,
      npcs: Array.isArray(f?.npcs)
        ? f.npcs.map((n) => {
            const postingRaw = n.posting;
            const postingKind =
              postingRaw &&
              typeof postingRaw === "object" &&
              ["court", "governor", "commander", "admiral"].includes(
                postingRaw.kind,
              )
                ? postingRaw.kind
                : "court";
            const posting = {
              kind: postingKind,
              sinceTurn:
                typeof postingRaw?.sinceTurn === "number"
                  ? postingRaw.sinceTurn
                  : (meta?.turn ?? 0),
              ...(postingKind === "governor" &&
              (postingRaw?.systemId || postingRaw?.targetId)
                ? { systemId: postingRaw.systemId || postingRaw.targetId }
                : {}),
              ...(postingKind === "commander"
                ? {
                    ...(postingRaw?.legionId || postingRaw?.forceId
                      ? {
                          legionId: postingRaw.legionId || postingRaw.forceId,
                          forceId: postingRaw.forceId || postingRaw.legionId,
                        }
                      : {}),
                  }
                : {}),
              ...(postingKind === "admiral"
                ? {
                    ...(postingRaw?.fleetId || postingRaw?.forceId
                      ? {
                          fleetId: postingRaw.fleetId || postingRaw.forceId,
                          forceId: postingRaw.forceId || postingRaw.fleetId,
                        }
                      : {}),
                  }
                : {}),
            };
            return {
              ...n,
              raceId:
                typeof n.raceId === "string" && n.raceId ? n.raceId : n.raceId ?? null,
              traitIds: Array.isArray(n.traitIds)
                ? n.traitIds.filter((id) => typeof id === "string")
                : [],
              posting,
              councilSeat:
                typeof n.councilSeat === "string" && n.councilSeat
                  ? n.councilSeat
                  : null,
              blocId:
                typeof n.blocId === "string" && n.blocId ? n.blocId : null,
              isBlocLeader: n.isBlocLeader === true,
              isPlayerRuler: n.isPlayerRuler === true,
              raceLeadership:
                n.raceLeadership &&
                typeof n.raceLeadership === "object" &&
                typeof n.raceLeadership.raceId === "string" &&
                n.raceLeadership.raceId
                  ? {
                      raceId: n.raceLeadership.raceId,
                      ...(typeof n.raceLeadership.title === "string" &&
                      n.raceLeadership.title
                        ? { title: n.raceLeadership.title }
                        : {}),
                    }
                  : null,
              currentTask: n.currentTask ?? undefined,
              relationships:
                n.relationships && typeof n.relationships === "object"
                  ? n.relationships
                  : undefined,
            };
          })
        : [],
      rulerNpcId:
        typeof f?.rulerNpcId === "string" && f.rulerNpcId
          ? f.rulerNpcId
          : null,
      internalBlocs: Array.isArray(f?.internalBlocs)
        ? f.internalBlocs.map((b) => ({
            id: String(b.id || ""),
            name: String(b.name || b.id || ""),
            color: typeof b.color === "string" ? b.color : undefined,
            kind: [
              "house",
              "church",
              "military",
              "guild",
              "race_caucus",
              "guest",
            ].includes(b.kind)
              ? b.kind
              : undefined,
            stance: ["loyal", "ambitious", "hostile", "neutral"].includes(
              b.stance,
            )
              ? b.stance
              : "neutral",
            agenda: typeof b.agenda === "string" ? b.agenda : undefined,
            description:
              typeof b.description === "string" ? b.description : undefined,
            raceIds: Array.isArray(b.raceIds)
              ? b.raceIds.filter((id) => typeof id === "string")
              : undefined,
            leaderNpcId:
              typeof b.leaderNpcId === "string" && b.leaderNpcId
                ? b.leaderNpcId
                : null,
            homeSystemId:
              typeof b.homeSystemId === "string" ? b.homeSystemId : undefined,
            homeSystemName:
              typeof b.homeSystemName === "string"
                ? b.homeSystemName
                : undefined,
            influence: Math.max(0, Math.min(100, Number(b.influence) || 0)),
            support: Math.max(0, Math.min(100, Number(b.support) || 0)),
            threat: Math.max(0, Math.min(100, Number(b.threat) || 0)),
          }))
        : [],
      council:
        f?.council && typeof f.council === "object"
          ? {
              unlockedSeatIds: Array.isArray(f.council.unlockedSeatIds)
                ? f.council.unlockedSeatIds.filter((id) => typeof id === "string")
                : [],
              lockedSeatIds: Array.isArray(f.council.lockedSeatIds)
                ? f.council.lockedSeatIds.filter((id) => typeof id === "string")
                : [],
              seatLabels:
                f.council.seatLabels && typeof f.council.seatLabels === "object"
                  ? Object.fromEntries(
                      Object.entries(f.council.seatLabels).filter(
                        ([k, v]) => typeof k === "string" && typeof v === "string",
                      ),
                    )
                  : undefined,
              seatPortfolios:
                f.council.seatPortfolios &&
                typeof f.council.seatPortfolios === "object"
                  ? Object.fromEntries(
                      Object.entries(f.council.seatPortfolios).filter(
                        ([k, v]) => typeof k === "string" && typeof v === "string",
                      ),
                    )
                  : undefined,
              extraSeats: Array.isArray(f.council.extraSeats)
                ? f.council.extraSeats
                    .filter((s) => s && typeof s.id === "string")
                    .map((s) => ({
                      id: s.id,
                      label:
                        typeof s.label === "string" && s.label
                          ? s.label
                          : "Советник",
                      roles: Array.isArray(s.roles) ? s.roles : undefined,
                      angleDeg:
                        typeof s.angleDeg === "number" ? s.angleDeg : undefined,
                    }))
                : undefined,
            }
          : undefined,
    };
  });
}

/**
 * Weighted majority of owned planet raceComposition → faction.primaryRaceId.
 * Does not overwrite a race already set on the faction.
 */
export function inferPrimaryRaceId(world, factionId) {
  const counts = new Map();
  for (const s of world.systems || []) {
    if (s.ownerFactionId !== factionId) continue;
    for (const p of s.planets || []) {
      const pop = Number(p.population) || 1;
      for (const row of p.raceComposition || []) {
        const id = typeof row === "string" ? row : row?.raceId;
        const pct = typeof row === "object" ? Number(row.percent) || 0 : 100;
        if (!id) continue;
        counts.set(id, (counts.get(id) || 0) + pct * pop);
      }
    }
  }
  let best = null;
  let bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id;
      bestN = n;
    }
  }
  return best;
}

export function hintRaceFromFaction(faction, racesContent) {
  const id = String(faction?.id || "");
  const races = racesContent || {};
  const aliases = {
    faction_federation: "race_corinfad",
    faction_north_swarm: "race_swarm",
    faction_south_swarm: "race_swarm",
  };
  if (aliases[id] && races[aliases[id]]) return aliases[id];
  const slug = id.replace(/^faction_/, "");
  const keyed = `race_${slug}`;
  if (slug && races[keyed]) return keyed;
  return null;
}

export function stampFactionPrimaryRaces(world, racesContent) {
  for (const f of world.factions || []) {
    if (f.primaryRaceId || f.raceId) {
      if (!f.primaryRaceId && f.raceId) f.primaryRaceId = f.raceId;
      continue;
    }
    const hinted = hintRaceFromFaction(f, racesContent);
    if (hinted) {
      f.primaryRaceId = hinted;
      continue;
    }
    const inferred = inferPrimaryRaceId(world, f.id);
    if (inferred) f.primaryRaceId = inferred;
  }
  return world;
}
