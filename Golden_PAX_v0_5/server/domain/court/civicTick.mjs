import { applyCivicPathUnlocks, civicScoreForPath, civicStatusPayload } from "./civicPaths.mjs";

/**
 * Civic score deltas for one faction's turn. Ported from GMap/server/
 * civicTick.mjs's tradeDelta/cultureDelta — module-private there
 * (behavior-tested here, re-derived from source), same weighted-scoring
 * math. Reshaped like domain/economy's categoryIncome: GMap computes
 * marketVol/treaty-count/culture-share-etc. by walking the full world +
 * ledger; here they're caller-supplied inputs, since that world model
 * isn't ported yet (see README.md "Status").
 */
function floor(n) {
  return Math.floor(Number(n) || 0);
}

export function tradeDelta(marketVol, treatyCount, scoring) {
  const marketW = Number(scoring?.marketVolumeWeight) || 1;
  const treatyW = Number(scoring?.treatyWeight) || 0;
  return { delta: floor(marketVol * marketW + treatyCount * treatyW), marketVol, treaties: treatyCount };
}

/** @param {{ cultureShare: number, avgLoyalty: number, faithShare: number }} metrics */
export function cultureDelta(metrics, scoring) {
  const cultureW = Number(scoring?.cultureShareWeight) || 0;
  const loyaltyW = Number(scoring?.loyaltyWeight) || 0;
  const faithW = Number(scoring?.faithShareWeight) || 0;
  const sharePts = floor(metrics.cultureShare * 100 * cultureW);
  const loyaltyPts = floor(metrics.avgLoyalty * loyaltyW);
  const faithPts = floor(metrics.faithShare * 100 * faithW);
  return { delta: sharePts + loyaltyPts + faithPts, metrics, components: { sharePts, loyaltyPts, faithPts } };
}

/**
 * One faction's civic tick: accumulate trade/culture score, apply any
 * newly-crossed unlock thresholds.
 *
 * @param {{ civicScores: {trade:number, culture:number}, laws: string[] }} civicAccount
 * @param {object} techAccount  see domain/tech/techAccount.mjs
 * @param {{ marketVol: number, treatyCount: number, cultureMetrics: object }} inputs
 * @param {object} content
 */
export function tickFactionCivic(civicAccount, techAccount, inputs, content) {
  const scoring = content?.civic_paths?.scoring || {};
  const beforeTrade = civicAccount.civicScores.trade;
  const beforeCulture = civicAccount.civicScores.culture;

  const trade = tradeDelta(inputs.marketVol, inputs.treatyCount, scoring.trade);
  const culture = cultureDelta(inputs.cultureMetrics, scoring.culture);

  const nextScores = {
    trade: trade.delta > 0 ? floor(beforeTrade + trade.delta) : beforeTrade,
    culture: culture.delta > 0 ? floor(beforeCulture + culture.delta) : beforeCulture,
  };

  let laws = civicAccount.laws;
  let nextTechAccount = techAccount;
  const journal = [];
  for (const pathKey of ["trade", "culture"]) {
    const score = civicScoreForPath(nextScores, pathKey, content);
    const result = applyCivicPathUnlocks(score, laws, nextTechAccount, pathKey, content);
    laws = result.laws;
    nextTechAccount = result.techAccount;
    journal.push(...result.journal);
  }

  const nextCivicAccount = { ...civicAccount, civicScores: nextScores, laws };
  const breakdown = {
    civicScores: nextScores,
    tradeTick: trade,
    cultureTick: culture,
    paths: civicStatusPayload(nextScores, laws, nextTechAccount.unlockedProperties, content),
  };

  if (nextScores.trade !== beforeTrade || nextScores.culture !== beforeCulture) {
    journal.push({
      type: "civic_score",
      trade: { from: beforeTrade, to: nextScores.trade, delta: nextScores.trade - beforeTrade, ...trade },
      culture: { from: beforeCulture, to: nextScores.culture, delta: nextScores.culture - beforeCulture, ...culture },
    });
  }

  return { civicAccount: nextCivicAccount, techAccount: nextTechAccount, journal, breakdown };
}

/**
 * Civic tick for every faction. Does not assume a fixed number of factions.
 * @param {{ id: string, civicAccount: object, techAccount: object, inputs: object }[]} factions
 * @param {object} content
 */
export function runCivicTick(factions, content) {
  const journal = [];
  const breakdowns = {};
  const nextFactions = factions.map((f) => {
    const result = tickFactionCivic(f.civicAccount, f.techAccount, f.inputs, content);
    breakdowns[f.id] = result.breakdown;
    for (const entry of result.journal) journal.push({ factionId: f.id, ...entry });
    return { ...f, civicAccount: result.civicAccount, techAccount: result.techAccount };
  });
  return { factions: nextFactions, journal, breakdowns };
}
