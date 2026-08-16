/**
 * Civic development paths (Trade + Culture): scores accumulate, cross a
 * content-defined threshold, unlock a law or a building property. Ported
 * from GMap/server/civicPaths.mjs — reshaped from mutate-eco-in-place to
 * plain-data-in/out (CLAUDE.md rule 3), and from GMap's own
 * `applyUnlockEffects` import (server/techActions.mjs) to this project's
 * ported equivalent in domain/tech/unlockEffects.mjs — same function,
 * single source of truth for "what does unlock_property do" instead of
 * two copies. Parity verified in civicPaths.parity.test.mjs.
 */
import { applyUnlockEffects } from "../tech/unlockEffects.mjs";

export function listCivicPathDefs(content) {
  return Object.values(content?.civic_paths?.paths || {});
}

export function getCivicPathDef(pathKey, content) {
  if (!pathKey) return null;
  return content?.civic_paths?.paths?.[pathKey] || null;
}

export function civicScoreForPath(civicScores, pathKey, content) {
  const key = getCivicPathDef(pathKey, content)?.scoreKey || pathKey;
  return Number(civicScores?.[key] || 0);
}

export function civicThresholdForUnlock(pathKey, unlockId, content) {
  const th = content?.civic_paths?.thresholds?.[pathKey]?.[unlockId];
  return Number(th) || 0;
}

/** @param {string[]} laws @param {string[]} unlockedProperties */
export function isCivicUnlockGranted(laws, unlockedProperties, unlock, content) {
  if (!unlock) return false;
  if (unlock.kind === "law") {
    return Array.isArray(laws) && laws.includes(unlock.id);
  }
  if (unlock.kind === "building") {
    const prop = unlock.property || content?.civic_paths?.unlockProperties?.[unlock.id] || unlock.id;
    return (unlockedProperties || []).includes(prop);
  }
  return false;
}

/**
 * Apply threshold unlocks for one civic path (idempotent).
 * @param {number} score
 * @param {string[]} laws
 * @param {object} techAccount  see domain/tech/techAccount.mjs — unlockedProperties lives here
 * @param {string} pathKey
 * @param {object} content
 * @returns {{ laws: string[], techAccount: object, journal: object[] }}
 */
export function applyCivicPathUnlocks(score, laws, techAccount, pathKey, content) {
  const pathDef = getCivicPathDef(pathKey, content);
  if (!pathDef) return { laws, techAccount, journal: [] };

  let nextLaws = [...(laws || [])];
  let nextTechAccount = techAccount;
  const journal = [];

  for (const unlock of pathDef.unlocks || []) {
    const need = civicThresholdForUnlock(pathKey, unlock.id, content);
    if (need > 0 && score < need) continue;
    if (isCivicUnlockGranted(nextLaws, nextTechAccount.unlockedProperties, unlock, content)) continue;

    if (unlock.kind === "law") {
      nextLaws = [...nextLaws, unlock.id];
      journal.push({ type: "civic_unlock", path: pathKey, unlockId: unlock.id, kind: "law", score, threshold: need });
    } else if (unlock.kind === "building") {
      const prop = unlock.property || content?.civic_paths?.unlockProperties?.[unlock.id] || unlock.id;
      nextTechAccount = applyUnlockEffects(nextTechAccount, [{ effect: "unlock_property", args: { property: prop } }]);
      journal.push({ type: "civic_unlock", path: pathKey, unlockId: unlock.id, kind: "building", property: prop, score, threshold: need });
    }
  }

  return { laws: nextLaws, techAccount: nextTechAccount, journal };
}

/** Player-facing civic path rows for the HUD. */
export function civicStatusPayload(civicScores, laws, unlockedProperties, content) {
  return listCivicPathDefs(content).map((p) => {
    const score = civicScoreForPath(civicScores, p.id, content);
    const unlocks = (p.unlocks || []).map((u) => {
      const threshold = civicThresholdForUnlock(p.id, u.id, content);
      const granted = isCivicUnlockGranted(laws, unlockedProperties, u, content);
      return {
        id: u.id,
        kind: u.kind,
        name: u.name,
        threshold,
        granted,
        ready: !granted && threshold > 0 && score >= threshold,
        progress: threshold > 0 ? Math.min(1, score / threshold) : granted ? 1 : 0,
      };
    });
    const nextThreshold = unlocks.filter((u) => !u.granted && u.threshold > 0).map((u) => u.threshold).sort((a, b) => a - b)[0];
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
      progress: nextThreshold != null && nextThreshold > 0 ? Math.min(1, score / nextThreshold) : unlocks.every((u) => u.granted) ? 1 : 0,
    };
  });
}
