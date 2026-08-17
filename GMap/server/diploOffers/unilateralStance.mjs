/**
 * applyUnilateralStance: war / embargo / break — applies immediately.
 * Extracted from ../diploOffers.mjs.
 */
import { bumpTableRevision, readLiveBoard, writeLiveBoard } from "../tableStore.mjs";
import { bumpOpinion, ensureFactionDiplomacy } from "../opinionTick.mjs";
import { getContent } from "../contentLoader.mjs";
import { updateIntelFromDiplomacy } from "../intel.mjs";
import {
  UNILATERAL_STANCES,
  getEdgeRelation,
  setDiplomacyRelation,
  cancelPendingOffersBetween,
} from "./helpers.mjs";

/**
 * Unilateral diplomatic act — applies immediately (no accept/reject).
 * stance: "war" | "embargo" | "break" (→ neutral, tears current treaty)
 *
 * @returns {{ ok: true, relation, previous } | { ok: false, error: string }}
 */
export function applyUnilateralStance({
  fromFactionId,
  toFactionId,
  stance,
  turn,
  knownOk,
}) {
  if (!fromFactionId || !toFactionId || fromFactionId === toFactionId) {
    return { ok: false, error: "некорректный адресат" };
  }
  if (knownOk === false) {
    return { ok: false, error: "держава неизвестна — нет контакта" };
  }
  const action = String(stance || "");
  if (!UNILATERAL_STANCES.has(action)) {
    return { ok: false, error: "неизвестное одностороннее действие" };
  }

  const world = readLiveBoard();
  if (!world) return { ok: false, error: "карта не опубликована" };

  const previous = getEdgeRelation(world, fromFactionId, toFactionId);
  let nextRelation = null;
  let opinionDelta = 0;
  let historyLabel = "";

  if (action === "war") {
    if (previous === "war") {
      return { ok: false, error: "война уже объявлена" };
    }
    nextRelation = "war";
    opinionDelta = -20;
    historyLabel =
      previous === "alliance"
        ? "Объявлена война (союз разорван)"
        : previous === "trade" || previous === "nap" || previous === "research_pact"
          ? `Объявлена война (договор ${previous} разорван)`
          : "Объявлена война";
  } else if (action === "embargo") {
    if (previous === "war") {
      return { ok: false, error: "при войне эмбарго избыточно" };
    }
    if (previous === "embargo") {
      return { ok: false, error: "эмбарго уже действует" };
    }
    nextRelation = "embargo";
    opinionDelta = -10;
    historyLabel = "Введено эмбарго";
  } else if (action === "break") {
    if (
      previous === "neutral" ||
      previous === "war" ||
      previous === "embargo"
    ) {
      return {
        ok: false,
        error: "нечего разрывать — нет дружественного договора",
      };
    }
    nextRelation = "neutral";
    const stances = getContent()?.diplomacy_stances || {};
    const decay = Number(stances[previous]?.trustDecayOnBreak ?? 10);
    opinionDelta = -Math.max(5, decay);
    historyLabel = `Разорван договор: ${previous}`;
  } else {
    return { ok: false, error: "неизвестное действие" };
  }

  setDiplomacyRelation(
    world,
    fromFactionId,
    toFactionId,
    nextRelation,
    turn ?? 0,
  );

  // Pending mutual deals between the pair become moot under hostility / break.
  cancelPendingOffersBetween(
    fromFactionId,
    toFactionId,
    turn,
    `diplo_unilateral_${action}`,
  );

  const fromFac = world.factions?.find((f) => f.id === fromFactionId);
  const toFac = world.factions?.find((f) => f.id === toFactionId);
  if (fromFac && toFac) {
    ensureFactionDiplomacy(fromFac);
    ensureFactionDiplomacy(toFac);
    bumpOpinion(toFac, fromFactionId, opinionDelta, turn, historyLabel);
    bumpOpinion(
      fromFac,
      toFactionId,
      Math.floor(opinionDelta / 2),
      turn,
      historyLabel,
    );
  }

  updateIntelFromDiplomacy(world, fromFactionId, toFactionId, nextRelation, {
    turn,
  });
  updateIntelFromDiplomacy(world, toFactionId, fromFactionId, nextRelation, {
    turn,
  });

  writeLiveBoard(world, { backup: false, reason: `diplo_${action}` });
  bumpTableRevision();

  return {
    ok: true,
    relation: nextRelation,
    previous,
    message: historyLabel,
  };
}
