import type { Planet } from "./types";

export const STABILITY_START = 50;
export const STABILITY_MIN = 0;
export const STABILITY_MAX = 100;
export const STABILITY_STAGE1_THRESHOLD = 40;
export const STABILITY_STAGE2_THRESHOLD = 25;
export const STABILITY_STAGE3_DURATION_TURNS = 3;
export const STABILITY_STAGE1_PROD_MULT = 0.85;
export const STABILITY_STAGE2_PROD_MULT = 0.75;

export type RevoltStageNumber = 0 | 1 | 2 | 3;

export interface PlanetRevoltReadoutModel {
  stability: number;
  stage: RevoltStageNumber;
  stageLabel: string;
  stageName: string;
  productionMult: number;
  productionPenaltyPercent: number;
  productionPenaltyLabel: string;
  turnsToSecession: number | null;
  tone: "ok" | "warn" | "bad" | "critical";
  isRevoltActive: boolean;
}

export function planetStabilityValue(planet?: Planet | null): number {
  if (typeof planet?.stability === "number" && Number.isFinite(planet.stability)) {
    return Math.min(STABILITY_MAX, Math.max(STABILITY_MIN, Math.round(planet.stability)));
  }
  return STABILITY_START;
}

export function planetRevoltStage(planet?: Planet | null): RevoltStageNumber {
  if (!planet) return 0;
  if (planet.revoltStage === 3) return 3;
  const stab = planetStabilityValue(planet);
  if (stab < STABILITY_STAGE2_THRESHOLD || planet.revoltStage === 2) return 2;
  if (stab < STABILITY_STAGE1_THRESHOLD || planet.revoltStage === 1) return 1;
  return 0;
}

export function computePlanetRevoltReadout(
  planet?: Planet | null,
  currentTurn: number = 0,
): PlanetRevoltReadoutModel {
  const stability = planetStabilityValue(planet);
  const stage = planetRevoltStage(planet);

  let stageName = "Спокойствие";
  let productionMult = 1.0;
  let productionPenaltyPercent = 0;
  let productionPenaltyLabel = "0%";
  let turnsToSecession: number | null = null;
  let tone: "ok" | "warn" | "bad" | "critical" = "ok";

  if (stage === 0) {
    stageName = "Спокойствие";
    productionMult = 1.0;
    productionPenaltyPercent = 0;
    productionPenaltyLabel = "0%";
    tone = "ok";
  } else if (stage === 1) {
    stageName = "Волнения";
    productionMult = STABILITY_STAGE1_PROD_MULT;
    productionPenaltyPercent = 15;
    productionPenaltyLabel = "−15%";
    tone = "warn";
  } else if (stage === 2) {
    stageName = "Мятеж";
    productionMult = STABILITY_STAGE2_PROD_MULT;
    productionPenaltyPercent = 25;
    productionPenaltyLabel = "−25%";
    tone = "bad";

    const sinceTurn = planet?.revolt?.stage2SinceTurn ?? planet?.revoltStage2SinceTurn;
    if (sinceTurn != null && Number.isFinite(sinceTurn)) {
      turnsToSecession = Math.max(
        0,
        Number(sinceTurn) + STABILITY_STAGE3_DURATION_TURNS - Number(currentTurn),
      );
    } else {
      turnsToSecession = STABILITY_STAGE3_DURATION_TURNS;
    }
  } else if (stage === 3) {
    stageName = "Сецессия";
    productionMult = 0;
    productionPenaltyPercent = 100;
    productionPenaltyLabel = "−100%";
    tone = "critical";
    turnsToSecession = 0;
  }

  return {
    stability,
    stage,
    stageLabel: `Стадия ${stage}`,
    stageName,
    productionMult,
    productionPenaltyPercent,
    productionPenaltyLabel,
    turnsToSecession,
    tone,
    isRevoltActive: stage >= 2,
  };
}
