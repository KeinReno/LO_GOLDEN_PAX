/**
 * Hybrid lineage rules — compatibility, id naming, optional stat merge.
 */
import { resolveRace } from "./raceRegistry.mjs";
import { resolvePlanetRaceComposition } from "./modifierStack.mjs";

function normRaceId(id) {
  return String(id || "").trim();
}

/** Weighted race share (%) across owned inhabited planets — mirror techActions. */
export function factionRaceSharePercent(world, factionId, raceId) {
  if (!world || !raceId) return 0;
  const faction = (world.factions || []).find((f) => f.id === factionId) ?? null;
  let weighted = 0;
  let popSum = 0;
  for (const sys of world.systems || []) {
    if (sys.ownerFactionId !== factionId) continue;
    for (const p of sys.planets || []) {
      const pop = Number(p.population || 0);
      if (pop <= 0) continue;
      popSum += pop;
      const mix = resolvePlanetRaceComposition(p, faction);
      for (const share of mix) {
        if (share.raceId === raceId) {
          weighted += pop * ((share.percent ?? 0) / 100);
        }
      }
    }
  }
  if (popSum <= 0) return 0;
  return (weighted / popSum) * 100;
}

/** Canonical hybrid race id from two parent species ids. */
export function hybridLineageId(raceA, raceB) {
  const a = normRaceId(raceA).replace(/^race_/, "");
  const b = normRaceId(raceB).replace(/^race_/, "");
  const [x, y] = [a, b].sort();
  return `race_hybrid.${x}_${y}`;
}

function rulesOf(content) {
  return content?.hybrid_rules || {};
}

/** Undirected pair check against compatibility map. */
export function canHybridizePair(content, raceA, raceB) {
  const rules = rulesOf(content);
  const map = rules.compatibility || {};
  const a = normRaceId(raceA);
  const b = normRaceId(raceB);
  if (a === b) {
    return { ok: false, error: "Нужны две разные расы" };
  }
  const listA = map[a];
  const listB = map[b];
  const okA = Array.isArray(listA) && listA.includes(b);
  const okB = Array.isArray(listB) && listB.includes(a);
  if (!okA && !okB) {
    const reason =
      rules.forbiddenReason?.[a] ||
      rules.forbiddenReason?.[b] ||
      "Эти расы не совместимы для гибридизации";
    return { ok: false, error: reason };
  }
  return { ok: true, lineageId: hybridLineageId(a, b) };
}

export function factionHasLineage(eco, lineageId) {
  return (eco?.unlockedLineages || []).includes(lineageId);
}

/**
 * Lineage available if unlocked on eco OR both parents meet min share empire-wide.
 */
export function factionCanUseLineage(world, factionId, lineageId, eco, content) {
  if (factionHasLineage(eco, lineageId)) return { ok: true, via: "unlocked" };
  const def = content?.races?.[lineageId];
  const parents = def?.hybridOf;
  if (!Array.isArray(parents) || parents.length !== 2) {
    return { ok: false, error: "Неизвестный линейдж" };
  }
  const min = Number(rulesOf(content).minParentSharePercent ?? 35);
  for (const pid of parents) {
    const share = factionRaceSharePercent(world, factionId, pid);
    if (share < min) {
      const name = content?.races?.[pid]?.name || pid;
      return {
        ok: false,
        error: `Нужно ≥${min}% «${name}» (сейчас ${Math.floor(share)}%)`,
      };
    }
  }
  return { ok: true, via: "population" };
}

/** Merge habitability / growth for procedural preview (optional). */
export function previewHybridStats(content, raceA, raceB) {
  const pair = canHybridizePair(content, raceA, raceB);
  if (!pair.ok) return pair;
  const rules = rulesOf(content);
  const fatigue = Number(rules.hybridFatigueHabitability ?? 0.1);
  const ra = resolveRace(raceA, content.races) || content.races?.[raceA];
  const rb = resolveRace(raceB, content.races) || content.races?.[raceB];
  if (!ra || !rb) return { ok: false, error: "Раса не найдена" };

  const climates = new Set([
    ...Object.keys(ra.habitability || {}),
    ...Object.keys(rb.habitability || {}),
  ]);
  const habitability = {};
  for (const c of climates) {
    const va = Number(ra.habitability?.[c] ?? 1);
    const vb = Number(rb.habitability?.[c] ?? 1);
    habitability[c] = Math.max(0, (va + vb) / 2 - fatigue);
  }
  const baseRate =
    (Number(ra.growth?.baseRate ?? 0.01) + Number(rb.growth?.baseRate ?? 0.01)) /
    2 *
    0.9;
  return {
    ok: true,
    lineageId: pair.lineageId,
    habitability,
    growth: {
      baseRate,
      crowdPenalty: Math.max(
        Number(ra.growth?.crowdPenalty ?? 0.3),
        Number(rb.growth?.crowdPenalty ?? 0.3),
      ),
    },
  };
}
