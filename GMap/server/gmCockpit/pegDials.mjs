/**
 * GM cockpit currency-peg multiplier dials.
 * Extracted from ../gmCockpit.mjs.
 */
import { readLiveBoard, writeLiveBoard } from "../tableStore.mjs";
import { getContent } from "../contentLoader.mjs";
import {
  applyGmPegMultiplier,
  gmPegMultiplier,
  normalizeGmPegMultipliers,
  pegCfg,
  resolveTreasuryPeg,
} from "../currencyPeg.mjs";
import { appendGmIntervention } from "./interventions.mjs";

function pegKnownIds(world, content) {
  const known = new Set();
  for (const fac of world?.factions || []) {
    const peg = resolveTreasuryPeg(fac, content);
    if (peg) known.add(peg);
  }
  const bindings = content?.faction_currency_bindings?.bindings || {};
  for (const bind of Object.values(bindings)) {
    if (typeof bind?.treasuryPeg === "string" && bind.treasuryPeg.trim()) {
      known.add(bind.treasuryPeg.trim());
    }
  }
  return known;
}

/** GM cockpit: current peg dials + picker options (strategic + live pegs). */
export function listGmPegMultipliers(world) {
  const content = getContent();
  const cfg = pegCfg(content);
  const stored = normalizeGmPegMultipliers(world?.meta?.gmPegMultipliers, content);
  const ids = new Set(pegKnownIds(world, content));
  for (const id of Object.keys(stored)) ids.add(id);
  for (const def of Object.values(content?.map_resources || {})) {
    if ((def?.rank === "strategic" || def?.strategic === true) && def.id) {
      ids.add(def.id);
    }
  }
  const peggedBy = {};
  for (const fac of world?.factions || []) {
    const peg = resolveTreasuryPeg(fac, content);
    if (!peg) continue;
    if (!peggedBy[peg]) peggedBy[peg] = [];
    peggedBy[peg].push(fac.id);
  }
  const resources = [...ids]
    .filter(Boolean)
    .sort()
    .map((id) => {
      const def = content?.map_resources?.[id];
      return {
        id,
        name: def?.name || id,
        multiplier: stored[id] ?? cfg.gmDefault,
        peggedBy: peggedBy[id] || [],
      };
    });
  return {
    ok: true,
    min: cfg.gmMin,
    max: cfg.gmMax,
    default: cfg.gmDefault,
    multipliers: stored,
    resources,
  };
}

/**
 * Persist one GM peg multiplier onto the live board.
 * Clamp is in `applyGmPegMultiplier` / `gmPegMultiplier`.
 */
export function setGmPegMultiplier(resourceId, multiplier) {
  const world = readLiveBoard();
  if (!world) return { ok: false, error: "Нет board" };
  const content = getContent();
  const id = typeof resourceId === "string" ? resourceId.trim() : "";
  const beforeRaw = world.meta?.gmPegMultipliers?.[id];
  const before =
    beforeRaw == null || beforeRaw === ""
      ? pegCfg(content).gmDefault
      : gmPegMultiplier(beforeRaw, content);
  const applied = applyGmPegMultiplier(world.meta, resourceId, multiplier, content, {
    knownIds: pegKnownIds(world, content),
  });
  if (!applied.ok) return applied;
  if (!world.meta) world.meta = {};
  world.meta.gmPegMultipliers = applied.gmPegMultipliers;
  const written = writeLiveBoard(world, {
    backup: false,
    reason: "gm_peg_multiplier",
  });
  if (!written?.ok) {
    return { ok: false, error: written?.error || "write failed" };
  }
  appendGmIntervention({
    actor: "gm",
    action: "set_peg_multiplier",
    before: { resourceId: applied.resourceId, multiplier: before },
    after: { resourceId: applied.resourceId, multiplier: applied.multiplier },
    detail: { gmPegMultipliers: applied.gmPegMultipliers },
  });
  return {
    ...applied,
    tableRevision: written.tableRevision,
    updatedAt: written.updatedAt,
  };
}
