/**
 * RoleScore — lifetime Σ(extracted × max(1, tier)). Never spent.
 * Closed ids match ECONOMY_TECH_REDESIGN_SPEC §6. Thresholds: role_milestones.json
 * (first-pass 5000 — see docs/ROLE_SCORE_THRESHOLDS.md).
 */
export const ROLE_IDS = Object.freeze([
  "structural",
  "energy",
  "offensive",
  "defensive",
  "mobility",
  "cognitive",
  "biological",
  "exotic",
]);

const ROLE_SET = new Set(ROLE_IDS);

export function emptyRoleScores() {
  const out = {};
  for (const id of ROLE_IDS) out[id] = 0;
  return out;
}

export function ensureRoleScores(eco) {
  if (!eco || typeof eco !== "object") return emptyRoleScores();
  if (!eco.roleScores || typeof eco.roleScores !== "object") {
    eco.roleScores = emptyRoleScores();
  } else {
    for (const id of ROLE_IDS) {
      if (eco.roleScores[id] == null) eco.roleScores[id] = 0;
    }
  }
  return eco.roleScores;
}

export function publicRoleScores(eco) {
  const src =
    eco?.roleScores && typeof eco.roleScores === "object" ? eco.roleScores : {};
  const out = {};
  for (const id of ROLE_IDS) out[id] = Number(src[id]) || 0;
  return out;
}

function floor(n) {
  return Math.floor(Number(n) || 0);
}

/** Linear tier weight: weight = max(1, tier). Same as B2 pilot. */
export function roleTierWeight(tier) {
  return Math.max(1, Number(tier) || 1);
}

function rolesForResource(resourceId, def, schemaRoles) {
  const roleSet = new Set();
  for (const r of Array.isArray(def?.roles) ? def.roles : []) {
    if (ROLE_SET.has(r)) roleSet.add(r);
  }
  if (schemaRoles && typeof schemaRoles === "object") {
    for (const [roleId, ids] of Object.entries(schemaRoles)) {
      if (!ROLE_SET.has(roleId)) continue;
      if (Array.isArray(ids) && ids.includes(resourceId)) roleSet.add(roleId);
    }
  }
  return roleSet;
}

/**
 * Accumulate RoleScore from one tick's extraction map. Call once per faction
 * per tick (roleExtraction: bulk + strategic). Never decreases.
 * Dual-tagged resources add once per role (Set), not twice.
 */
export function applyRoleScores(eco, content, extraction) {
  ensureRoleScores(eco);
  const resources = content?.map_resources || {};
  const schemaRoles = content?.economy_schema?.role_score_pilot?.roles;
  const delta = emptyRoleScores();

  for (const [resourceId, raw] of Object.entries(extraction || {})) {
    const amt = floor(raw);
    if (amt <= 0) continue;
    const def = resources[resourceId];
    const add = amt * roleTierWeight(def?.tier);
    for (const roleId of rolesForResource(resourceId, def, schemaRoles)) {
      delta[roleId] += add;
    }
  }
  for (const roleId of ROLE_IDS) {
    if (delta[roleId] <= 0) continue;
    eco.roleScores[roleId] = floor((eco.roleScores[roleId] || 0) + delta[roleId]);
  }
  return eco.roleScores;
}
