/**
 * Cancel open engagements when participating fleets/legions disappear.
 * Uses tableStore readJson/writeJson so C4 SQLite backend stays in sync.
 * Path is local (not DATA_DIR from tableStore) to avoid TDZ on the circular import
 * tableStore → engagementReconcile → tableStore.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson } from "./tableStore.mjs";

const ENGAGEMENTS_PATH = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data"),
  "engagements.json",
);
const OPEN = new Set(["active", "commit", "contact"]);

function readList() {
  const raw = readJson(ENGAGEMENTS_PATH, []);
  return Array.isArray(raw) ? raw : [];
}

function writeList(list) {
  writeJson(ENGAGEMENTS_PATH, list);
}

function sideFleetIds(side) {
  if (!side) return [];
  const a = Array.isArray(side.fleetIds) ? side.fleetIds : [];
  const b = Array.isArray(side.fleets) ? side.fleets : [];
  return [...new Set([...a, ...b].filter(Boolean))];
}

function sideLegionIds(side) {
  if (!side) return [];
  const a = Array.isArray(side.legionIds) ? side.legionIds : [];
  const b = Array.isArray(side.legions) ? side.legions : [];
  return [...new Set([...a, ...b].filter(Boolean))];
}

/**
 * @param {object} world
 * @param {{ removedFleetIds?: string[], removedLegionIds?: string[], journal?: object[] }} [opts]
 */
export function cancelEngagementsMissingForces(world, opts = {}) {
  const removedFleets = new Set(opts.removedFleetIds || []);
  const removedLegions = new Set(opts.removedLegionIds || []);
  const liveFleets = new Set((world?.fleets || []).map((f) => f.id));
  const liveLegions = new Set((world?.legions || []).map((l) => l.id));
  const journal = opts.journal || null;
  const list = readList();
  const cancelledIds = [];

  for (const eng of list) {
    if (!eng || !OPEN.has(eng.status)) continue;
    const fleets = (eng.sides || []).flatMap(sideFleetIds);
    const legions = (eng.sides || []).flatMap(sideLegionIds);
    if (!fleets.length && !legions.length) continue;

    const forceRemoved =
      fleets.some((id) => removedFleets.has(id)) ||
      legions.some((id) => removedLegions.has(id));
    const forceMissing =
      fleets.some((id) => !liveFleets.has(id)) ||
      legions.some((id) => !liveLegions.has(id));
    const sideEmptied = (eng.sides || []).some((side) => {
      const sf = sideFleetIds(side);
      const sl = sideLegionIds(side);
      if (!sf.length && !sl.length) return false;
      return (
        sf.every((id) => removedFleets.has(id) || !liveFleets.has(id)) &&
        sl.every((id) => removedLegions.has(id) || !liveLegions.has(id))
      );
    });

    if (!forceRemoved && !forceMissing && !sideEmptied) continue;

    eng.status = "cancelled";
    eng.result = {
      ok: false,
      error: "force_removed",
      outcome: "cancelled",
      reason: forceRemoved
        ? "force_deleted"
        : forceMissing
          ? "force_missing"
          : "side_emptied",
    };
    if (eng.cardBattle && eng.cardBattle.status === "active") {
      eng.cardBattle.status = "resolved";
      eng.cardBattle.cancelReason = "force_removed";
    }
    cancelledIds.push(eng.id);
    if (journal) {
      journal.push({
        type: "engagement_cancelled",
        engagementId: eng.id,
        systemId: eng.systemId,
        reason: eng.result.reason,
        sides: (eng.sides || []).map((s) => s.factionId),
        message: "Бой отменён: участник (флот/легион) удалён",
      });
    }
  }

  if (cancelledIds.length) writeList(list);
  return { cancelled: cancelledIds.length, engagementIds: cancelledIds };
}
