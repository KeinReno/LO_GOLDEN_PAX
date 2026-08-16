/**
 * B6 — civic score tick (Trade + Culture).
 * Called after economy + loyalty so culture inputs are fresh.
 */
import { getContent } from "./contentLoader.mjs";
import {
  readLedger,
  writeLedger,
  ensureAllFactions,
  ensureFactionEco,
} from "./ledger.mjs";
import { getRelation } from "./opinionTick.mjs";
import {
  resolvePlanetCultureId,
  resolvePlanetFaithShares,
} from "./cultureFaith.mjs";
import {
  applyCivicPathUnlocks,
  civicStatusPayload,
  ensureCivicScores,
} from "./civicPaths.mjs";

function floor(n) {
  return Math.floor(Number(n) || 0);
}

function marketVolumeThisTurn(ledger, factionId, turn) {
  let vol = 0;
  for (const e of ledger.entries || []) {
    if (e.factionId !== factionId) continue;
    if (e.turn !== turn) continue;
    if (e.reason !== "market_convert_in") continue;
    vol += Math.max(0, Number(e.delta) || 0);
  }
  return vol;
}

function countActiveTreaties(world, factionId, treatyTypes) {
  const allowed = new Set(treatyTypes || []);
  const seen = new Set();
  let count = 0;

  for (const other of world.factions || []) {
    if (other.id === factionId) continue;
    const rel = getRelation(world, factionId, other.id);
    if (!allowed.has(rel)) continue;
    const key = [factionId, other.id].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    count++;
  }
  return count;
}

function factionCultureMetrics(world, faction) {
  const dominantCulture = faction.defaultCultureId || "culture.baseline";
  const primaryFaith = faction.primaryFaith || "faith.secular";
  let totalPop = 0;
  let matchingCulturePop = 0;
  let faithWeighted = 0;
  let loyaltyWeighted = 0;

  for (const sys of world.systems || []) {
    if (sys.ownerFactionId !== faction.id) continue;
    for (const p of sys.planets || []) {
      const pop = Number(p.population || 0);
      if (pop <= 0) continue;
      totalPop += pop;
      const cultureId = resolvePlanetCultureId(p, faction);
      if (cultureId === dominantCulture) matchingCulturePop += pop;
      const loyalty = Number(p.loyalty ?? 50);
      loyaltyWeighted += loyalty * pop;
      const shares = resolvePlanetFaithShares(p, faction);
      let faithPct = 0;
      for (const row of shares) {
        const fid = row.faithId || row.id;
        if (fid === primaryFaith) {
          faithPct += Number(row.percent ?? row.share ?? 0);
        }
      }
      faithWeighted += (faithPct / 100) * pop;
    }
  }

  return {
    cultureShare: totalPop > 0 ? matchingCulturePop / totalPop : 0,
    faithShare: totalPop > 0 ? faithWeighted / totalPop : 0,
    avgLoyalty: totalPop > 0 ? loyaltyWeighted / totalPop : 0,
    totalPop,
  };
}

function tradeDelta(world, ledger, factionId, turn, scoring) {
  const marketVol = marketVolumeThisTurn(ledger, factionId, turn);
  const treaties = countActiveTreaties(
    world,
    factionId,
    scoring?.treatyTypes,
  );
  const marketW = Number(scoring?.marketVolumeWeight) || 1;
  const treatyW = Number(scoring?.treatyWeight) || 0;
  return {
    delta: floor(marketVol * marketW + treaties * treatyW),
    marketVol,
    treaties,
  };
}

function cultureDelta(world, faction, scoring) {
  const m = factionCultureMetrics(world, faction);
  const cultureW = Number(scoring?.cultureShareWeight) || 0;
  const loyaltyW = Number(scoring?.loyaltyWeight) || 0;
  const faithW = Number(scoring?.faithShareWeight) || 0;
  const sharePts = floor(m.cultureShare * 100 * cultureW);
  const loyaltyPts = floor(m.avgLoyalty * loyaltyW);
  const faithPts = floor(m.faithShare * 100 * faithW);
  return {
    delta: sharePts + loyaltyPts + faithPts,
    metrics: m,
    components: { sharePts, loyaltyPts, faithPts },
  };
}

/**
 * @returns {{ journal: object[], breakdowns: Record<string, object> }}
 */
export function runCivicTick(world, turn) {
  const content = getContent();
  const scoring = content.civic_paths?.scoring || {};
  const ledger = readLedger();
  ensureAllFactions(ledger, world);

  const journal = [];
  const breakdowns = {};

  for (const fac of world.factions || []) {
    const eco = ensureFactionEco(ledger, fac.id);
    ensureCivicScores(eco);
    const beforeTrade = eco.civicScores.trade;
    const beforeCulture = eco.civicScores.culture;

    const trade = tradeDelta(world, ledger, fac.id, turn, scoring.trade);
    const culture = cultureDelta(world, fac, scoring.culture);

    if (trade.delta > 0) {
      eco.civicScores.trade = floor(beforeTrade + trade.delta);
    }
    if (culture.delta > 0) {
      eco.civicScores.culture = floor(beforeCulture + culture.delta);
    }

    for (const pathKey of ["trade", "culture"]) {
      for (const entry of applyCivicPathUnlocks(eco, pathKey, content)) {
        journal.push({ factionId: fac.id, turn, ...entry });
      }
    }

    breakdowns[fac.id] = {
      civicScores: { ...eco.civicScores },
      tradeTick: trade,
      cultureTick: culture,
      paths: civicStatusPayload(eco, content),
    };

    if (
      eco.civicScores.trade !== beforeTrade ||
      eco.civicScores.culture !== beforeCulture
    ) {
      journal.push({
        type: "civic_score",
        factionId: fac.id,
        turn,
        trade: {
          from: beforeTrade,
          to: eco.civicScores.trade,
          delta: eco.civicScores.trade - beforeTrade,
          ...trade,
        },
        culture: {
          from: beforeCulture,
          to: eco.civicScores.culture,
          delta: eco.civicScores.culture - beforeCulture,
          ...culture,
        },
      });
    }
  }

  writeLedger(ledger);
  return { journal, breakdowns };
}
