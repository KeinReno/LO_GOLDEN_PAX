/**
 * B6 — civic development paths (Trade + Culture).
 * Scores accumulate in eco.civicScores; unlocks via unlock_property + eco.laws.
 */
import { getContent } from "./contentLoader.mjs";
import { applyUnlockEffects } from "./techActions.mjs";

export function listCivicPathDefs(content) {
  const c = content || getContent();
  return Object.values(c.civic_paths?.paths || {});
}

export function getCivicPathDef(pathKey, content) {
  if (!pathKey) return null;
  const c = content || getContent();
  return c.civic_paths?.paths?.[pathKey] || null;
}

export function ensureCivicScores(eco) {
  if (!eco.civicScores || typeof eco.civicScores !== "object") {
    eco.civicScores = { trade: 0, culture: 0 };
  } else {
    if (eco.civicScores.trade == null) eco.civicScores.trade = 0;
    if (eco.civicScores.culture == null) eco.civicScores.culture = 0;
  }
  return eco.civicScores;
}

export function civicScoreForPath(eco, pathKey) {
  const key = getCivicPathDef(pathKey)?.scoreKey || pathKey;
  return Number(ensureCivicScores(eco)[key] || 0);
}

export function civicThresholdForUnlock(pathKey, unlockId, content) {
  const c = content || getContent();
  const th = c.civic_paths?.thresholds?.[pathKey]?.[unlockId];
  return Number(th) || 0;
}

export function isCivicUnlockGranted(eco, unlock) {
  if (!unlock) return false;
  if (unlock.kind === "law") {
    return Array.isArray(eco.laws) && eco.laws.includes(unlock.id);
  }
  if (unlock.kind === "building") {
    const prop =
      unlock.property ||
      getContent()?.civic_paths?.unlockProperties?.[unlock.id] ||
      unlock.id;
    return (eco.unlockedProperties || []).includes(prop);
  }
  return false;
}

/** Apply threshold unlocks for one civic path (idempotent). Returns journal entries. */
export function applyCivicPathUnlocks(eco, pathKey, content) {
  const c = content || getContent();
  const pathDef = getCivicPathDef(pathKey, c);
  if (!pathDef) return [];
  const score = civicScoreForPath(eco, pathKey);
  const journal = [];
  if (!Array.isArray(eco.laws)) eco.laws = [];
  if (!Array.isArray(eco.unlockedProperties)) eco.unlockedProperties = [];

  for (const unlock of pathDef.unlocks || []) {
    const need = civicThresholdForUnlock(pathKey, unlock.id, c);
    if (need > 0 && score < need) continue;
    if (isCivicUnlockGranted(eco, unlock)) continue;

    if (unlock.kind === "law") {
      eco.laws.push(unlock.id);
      journal.push({
        type: "civic_unlock",
        path: pathKey,
        unlockId: unlock.id,
        kind: "law",
        score,
        threshold: need,
      });
    } else if (unlock.kind === "building") {
      const prop =
        unlock.property ||
        c.civic_paths?.unlockProperties?.[unlock.id] ||
        unlock.id;
      applyUnlockEffects(eco, [
        { effect: "unlock_property", args: { property: prop } },
      ]);
      journal.push({
        type: "civic_unlock",
        path: pathKey,
        unlockId: unlock.id,
        kind: "building",
        property: prop,
        score,
        threshold: need,
      });
    }
  }
  return journal;
}

export function listLawUnlocks(content) {
  const out = [];
  for (const path of listCivicPathDefs(content)) {
    for (const u of path.unlocks || []) {
      if (u?.kind === "law" && u.id) out.push(u);
    }
  }
  return out;
}

/** Faction-wide modifiers from granted civic laws (content describes effects). */
export function collectLawModifierEffects(eco, content) {
  const have = new Set(eco?.laws || []);
  if (have.size === 0) return [];
  const effects = [];
  for (const unlock of listLawUnlocks(content)) {
    if (!have.has(unlock.id)) continue;
    for (const e of unlock.effects || []) {
      if (!e?.effect) continue;
      effects.push({
        ...e,
        source: { kind: "law", id: unlock.id, label: unlock.name || unlock.id },
      });
    }
  }
  return effects;
}

/** Player-facing civic path rows for economy API / B7 HUD. */
export function civicStatusPayload(eco, content) {
  const c = content || getContent();
  ensureCivicScores(eco);
  return listCivicPathDefs(c).map((p) => {
    const score = civicScoreForPath(eco, p.id);
    const unlocks = (p.unlocks || []).map((u) => {
      const threshold = civicThresholdForUnlock(p.id, u.id, c);
      const granted = isCivicUnlockGranted(eco, u);
      return {
        id: u.id,
        kind: u.kind,
        name: u.name,
        threshold,
        granted,
        ready: !granted && threshold > 0 && score >= threshold,
        progress:
          threshold > 0 ? Math.min(1, score / threshold) : granted ? 1 : 0,
      };
    });
    const nextThreshold = unlocks
      .filter((u) => !u.granted && u.threshold > 0)
      .map((u) => u.threshold)
      .sort((a, b) => a - b)[0];
    return {
      id: p.id,
      pathId: p.pathId || `civic.${p.id}`,
      name: p.name,
      icon: p.icon,
      scoreKey: p.scoreKey || p.id,
      feedsFrom: p.feedsFrom || [],
      score,
      unlocks,
      nextThreshold: nextThreshold ?? null,
      progress:
        nextThreshold != null && nextThreshold > 0
          ? Math.min(1, score / nextThreshold)
          : unlocks.every((u) => u.granted)
            ? 1
            : 0,
    };
  });
}
