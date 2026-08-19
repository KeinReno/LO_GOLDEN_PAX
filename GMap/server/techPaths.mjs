/**
 * v0.6 A6 pilot — development paths gated by RoleScore + breakthrough tech.
 * Untagged techs remain researchable. Path-gated techs set researchPath / opensPath.
 */
import { getContent } from "./contentLoader.mjs";

export function listPathDefs(content) {
  const c = content || getContent();
  return Object.values(c.tech_paths?.paths || {});
}

export function getPathDef(pathId, content) {
  if (!pathId) return null;
  const c = content || getContent();
  return c.tech_paths?.paths?.[pathId] || null;
}

export function ensureOpenPaths(eco) {
  if (!Array.isArray(eco.openPaths)) eco.openPaths = [];
  return eco.openPaths;
}

export function isPathOpen(eco, pathId) {
  if (!pathId) return true;
  return ensureOpenPaths(eco).includes(pathId);
}

/** Path def, or a RoleScore stub so all 8 roles gate even if tech_paths omits the id. */
export function resolvePathDef(pathId, content) {
  const c = content || getContent();
  const existing = getPathDef(pathId, c);
  if (existing) return existing;
  if (!pathId) return null;
  const ms = c.role_milestones?.[pathId];
  return {
    id: pathId,
    roleScoreKey: pathId,
    label: ms?.label || pathId,
    breakthroughTechId: null,
  };
}

/** Breakthrough id only if the technology exists and is not a catalog stub. */
export function liveBreakthroughTechId(pathDef, content) {
  const id = pathDef?.breakthroughTechId;
  if (!id) return null;
  const c = content || getContent();
  const def = c?.technologies?.[id];
  if (!def || def.catalogPending) return null;
  return id;
}

export function roleScoreForPath(eco, pathDef, content) {
  const key =
    pathDef?.roleScoreKey ||
    pathDef?.id ||
    null;
  if (!key) return 0;
  return Number(eco?.roleScores?.[key] || 0);
}

export function roleThresholdForPath(pathDef, content) {
  const c = content || getContent();
  const key = pathDef?.roleScoreKey || pathDef?.id;
  const fromMs = c.role_milestones?.[key]?.threshold;
  if (fromMs != null && Number.isFinite(Number(fromMs))) {
    return Number(fromMs) || 0;
  }
  const th = c.economy_schema?.role_score_pilot?.thresholds?.[key];
  return Number(th) || 0;
}

export function pathOpensFromTech(def) {
  if (!def) return null;
  if (typeof def.opensPath === "string" && def.opensPath.trim()) {
    return def.opensPath.trim();
  }
  for (const e of def.effects || []) {
    if (e?.effect === "open_path" && e.args?.pathId) {
      return String(e.args.pathId);
    }
  }
  return null;
}

/** Required open path for gated techs. Breakthrough openers are not gated here. */
export function techRequiredPath(def) {
  if (!def) return null;
  if (pathOpensFromTech(def)) return null;
  if (typeof def.researchPath === "string" && def.researchPath.trim()) {
    return def.researchPath.trim();
  }
  return null;
}

/**
 * Gate for canQueue / research.
 * - Breakthrough that opens a path: needs RoleScore ≥ threshold, path not already open.
 * - Tech with researchPath: that path must be open.
 */
export function checkPathGate(def, eco, content) {
  const c = content || getContent();
  const opens = pathOpensFromTech(def);
  if (opens) {
    if (isPathOpen(eco, opens)) {
      return { ok: false, error: `Путь «${getPathDef(opens, c)?.label || opens}» уже открыт` };
    }
    const pathDef = resolvePathDef(opens, c);
    const score = roleScoreForPath(eco, pathDef, c);
    const need = roleThresholdForPath(pathDef, c);
    if (need > 0 && score < need) {
      return {
        ok: false,
        error: `RoleScore ${pathDef?.label || opens}: ${score}/${need}`,
      };
    }
    return { ok: true };
  }

  const required = techRequiredPath(def);
  if (required && !isPathOpen(eco, required)) {
    const label = getPathDef(required, c)?.label || required;
    return { ok: false, error: `Нужен открытый путь: ${label}` };
  }
  return { ok: true };
}

export function applyOpenPathEffect(eco, pathId) {
  if (!pathId) return;
  const list = ensureOpenPaths(eco);
  if (!list.includes(pathId)) list.push(pathId);
}

/** Rebuild openPaths from unlocked techs (idempotent). */
export function recomputeOpenPaths(eco, content) {
  const c = content || getContent();
  eco.openPaths = [];
  for (const id of eco.unlockedTechs || []) {
    const def = c.technologies?.[id];
    const opens = pathOpensFromTech(def);
    if (opens) applyOpenPathEffect(eco, opens);
    for (const e of def?.effects || []) {
      if (e?.effect === "open_path" && e.args?.pathId) {
        applyOpenPathEffect(eco, String(e.args.pathId));
      }
    }
  }
}

/** Path id relevant to this tech (required path or path being opened). */
export function techPathContext(def) {
  return pathOpensFromTech(def) || techRequiredPath(def) || null;
}

function normalizeRaceId(raw) {
  if (!raw) return null;
  const s = String(raw);
  return s.startsWith("race_") ? s : `race_${s.replace(/^race\./, "")}`;
}

/** Primary race of faction for affinity (world faction fields). */
export function factionPrimaryRaceId(faction) {
  return normalizeRaceId(
    faction?.primaryRaceId ||
      faction?.primaryRace ||
      faction?.dominantRaceId ||
      faction?.raceId ||
      null,
  );
}

/**
 * Cheaper (or same) research cost from tech_paths.raceAffinity — never a lock.
 * @returns {{ cost: object, affinityMult: number, pathId: string|null }}
 */
export function applyPathResearchAffinity(cost, def, faction, content) {
  const c = content || getContent();
  const pathId = techPathContext(def);
  const out = { ...(cost || {}) };
  if (!pathId) {
    return { cost: out, affinityMult: 1, pathId: null };
  }
  const raceId = factionPrimaryRaceId(faction);
  const table = c.tech_paths?.raceAffinity || {};
  const mult = Number(raceId && table[raceId]?.[pathId]);
  if (!Number.isFinite(mult) || mult <= 0 || mult === 1) {
    return { cost: out, affinityMult: 1, pathId };
  }
  for (const [k, v] of Object.entries(out)) {
    const val = Number(v || 0);
    if (val > 0) out[k] = Math.max(1, Math.ceil(val * mult));
  }
  return { cost: out, affinityMult: mult, pathId };
}

/** Player-facing path status rows for payload / UI. */
export function pathStatusPayload(eco, content) {
  const c = content || getContent();
  return listPathDefs(c).map((p) => {
    const score = roleScoreForPath(eco, p, c);
    const threshold = roleThresholdForPath(p, c);
    const open = isPathOpen(eco, p.id);
    const breakthroughTechId = liveBreakthroughTechId(p, c);
    return {
      id: p.id,
      label: p.label,
      description: p.description || "",
      iconTag: p.iconTag || null,
      roleScoreKey: p.roleScoreKey || p.id,
      breakthroughTechId,
      score,
      threshold,
      open,
      ready: !open && Boolean(breakthroughTechId) && threshold > 0 && score >= threshold,
      progress:
        threshold > 0 ? Math.min(1, score / threshold) : open ? 1 : 0,
    };
  });
}
