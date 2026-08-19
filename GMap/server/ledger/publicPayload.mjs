/**
 * Player-facing economy payloads (login / view-refresh / planet actions).
 * Extracted from ../ledger.mjs.
 */
import { getContent } from "../contentLoader.mjs";
import { publicRoleScores } from "../roleScores.mjs";
import { readLedger, ensureFactionEco } from "./core.mjs";

export function getFactionPublicEco(factionId) {
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  const content = getContent();
  // Bias treasury rows (metal + commodity peg) — a single tick floods category
  // lines and used to push treasury out of a flat slice, zeroing budget UI.
  const factionEntries = ledger.entries.filter((e) => e.factionId === factionId);
  const isTreasuryRow = (e) =>
    e.currencyId === "currency.metal" ||
    e.reason === "treasury_income" ||
    e.reason === "treasury_upkeep";
  const metal = factionEntries.filter(isTreasuryRow).slice(-100);
  const other = factionEntries.filter((e) => !isTreasuryRow(e)).slice(-50);
  const seen = new Set();
  const merged = [];
  for (const e of [...metal, ...other]) {
    const key =
      e.id ||
      `${e.turn ?? ""}|${e.currencyId}|${e.delta}|${e.reason}|${e.intentId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(e);
  }
  merged.sort((a, b) => {
    const td = (b.turn ?? 0) - (a.turn ?? 0);
    if (td !== 0) return td;
    return String(b.at || b.createdAt || "").localeCompare(
      String(a.at || a.createdAt || ""),
    );
  });
  const recent = merged.slice(0, 120);
  return {
    ...eco,
    recent,
    currencies: content.currencies,
    taxDefs: content.taxes,
    economy_schema: content.economy_schema,
    rules: {
      apPerTurn: content.rules?.apPerTurn,
      forceAp: content.rules?.forceAp,
      deficit: content.rules?.deficit,
      tax: content.rules?.tax,
      population: content.rules?.population,
    },
  };
}

/** Player-facing economy slice (login / view-refresh / planet actions). */
export function publicEconomyPayload(eco) {
  const out = {
    stocks: eco.stocks,
    taxes: eco.taxes,
    pendingPolicy: eco.pendingPolicy,
    pressure: eco.pressure,
    deficit: eco.deficit,
    recent: eco.recent ?? [],
    techTiers: eco.techTiers,
    unlockedProperties: eco.unlockedProperties,
    unlockedTechs: eco.unlockedTechs,
    unlockedUpgrades: eco.unlockedUpgrades,
    techGrades:
      eco.techGrades && typeof eco.techGrades === "object" ? { ...eco.techGrades } : {},
    techSockets:
      eco.techSockets && typeof eco.techSockets === "object" ? { ...eco.techSockets } : {},
    unlockedLineages: Array.isArray(eco.unlockedLineages)
      ? [...eco.unlockedLineages]
      : [],
    acquiredTechs: Array.isArray(eco.acquiredTechs)
      ? eco.acquiredTechs.map((a) => ({ ...a }))
      : [],
    researchQueue: Array.isArray(eco.researchQueue) ? [...eco.researchQueue] : [],
    currentOffers:
      eco.currentOffers && typeof eco.currentOffers === "object"
        ? Object.fromEntries(
            Object.entries(eco.currentOffers).map(([axis, offer]) => [
              axis,
              {
                candidates: Array.isArray(offer?.candidates)
                  ? offer.candidates.map(String)
                  : [],
                rerolled: Boolean(offer?.rerolled),
              },
            ]),
          )
        : {},
    buildQueue: Array.isArray(eco.buildQueue)
      ? eco.buildQueue.map((q) => ({
          systemId: String(q.systemId || ""),
          planetId: String(q.planetId || ""),
          buildingId: String(q.buildingId || ""),
        }))
      : [],
    flowPriorities:
      eco.flowPriorities && typeof eco.flowPriorities === "object"
        ? { ...eco.flowPriorities }
        : {},
    stockReserves:
      eco.stockReserves && typeof eco.stockReserves === "object"
        ? { ...eco.stockReserves }
        : {},
    forceReserve: Array.isArray(eco.forceReserve)
      ? eco.forceReserve.map((g) => ({ ...g }))
      : [],
    economicPolicy: eco.economicPolicy ?? null,
    laws: Array.isArray(eco.laws) ? [...eco.laws] : [],
    alchemy: eco.alchemy
      ? {
          attemptsUsedThisTurn: Number(eco.alchemy.attemptsUsedThisTurn || 0),
          discoveredRecipes: Array.isArray(eco.alchemy.discoveredRecipes)
            ? [...eco.alchemy.discoveredRecipes]
            : [],
          lastExperimentTurn: eco.alchemy.lastExperimentTurn ?? null,
          journal: Array.isArray(eco.alchemy.journal)
            ? eco.alchemy.journal.slice(-10)
            : [],
        }
      : {
          attemptsUsedThisTurn: 0,
          discoveredRecipes: [],
          lastExperimentTurn: null,
          journal: [],
        },
  };
  if (eco.bottlenecks != null) out.bottlenecks = eco.bottlenecks;
  if (eco.explain != null) out.explain = eco.explain;
  out.roleScores = publicRoleScores(eco);
  out.openPaths = Array.isArray(eco.openPaths) ? [...eco.openPaths] : [];
  out.powerPaths = Array.isArray(eco.powerPaths) ? [...eco.powerPaths] : [];
  out.civicScores =
    eco.civicScores && typeof eco.civicScores === "object"
      ? {
          trade: Number(eco.civicScores.trade) || 0,
          culture: Number(eco.civicScores.culture) || 0,
        }
      : { trade: 0, culture: 0 };
  return out;
}
