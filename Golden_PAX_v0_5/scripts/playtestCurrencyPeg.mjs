/**
 * Live HTTP check for CURRENCY_PEG_SPEC.
 * Proves: (1) pegged extraction earns metal beyond the untouched legacy
 * floor; (2) barter, exchange-deal settlement, and currency-union are
 * three distinct outcomes for two factions on different pegs.
 *
 * Usage: node server/serve.mjs  (then, other terminal)
 *        node scripts/playtestCurrencyPeg.mjs
 */
import { createSmokeClient } from "./smokeHttp.mjs";

const { call: rawCall, seatPlayer } = createSmokeClient();

async function call(method, path, { actor, body } = {}) {
  const res = await rawCall(method, path, { actor, body });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(res.json)}`);
  return res.json;
}

function stocksOf(state, factionId) {
  return state.factions.find((row) => row.faction.id === factionId).economy.stocks;
}

async function main() {
  console.log("=== Currency peg live check ===\n");

  const tag = `p${Date.now().toString(36)}`;
  const pegged = `pegged.${tag}`;
  const steelpeg = `steelpeg.${tag}`;
  const flooronly = `flooronly.${tag}`;
  const sysP = `sys.p.${tag}`;
  const sysS = `sys.s.${tag}`;
  const sysF = `sys.f.${tag}`;
  const planetP = `p.home.${tag}`;
  const planetS = `s.home.${tag}`;
  const planetF = `f.home.${tag}`;

  const campaign = await call("POST", "/api/campaign", { actor: "gm", body: { name: `Peg live check ${tag}` } });
  await call("POST", `/api/campaign/${campaign.id}/factions`, {
    actor: "gm",
    body: { id: pegged, name: "Pegged", raceId: "race_human", colorHex: "#2266cc" },
  });
  await call("POST", `/api/campaign/${campaign.id}/factions`, {
    actor: "gm",
    body: { id: steelpeg, name: "Steel Peg", raceId: "race_human", colorHex: "#8899aa" },
  });
  await call("POST", `/api/campaign/${campaign.id}/factions`, {
    actor: "gm",
    body: { id: flooronly, name: "Floor Only", raceId: "race_human", colorHex: "#cc3322" },
  });
  await seatPlayer(campaign.id, pegged);
  await seatPlayer(campaign.id, steelpeg);
  await seatPlayer(campaign.id, flooronly);

  await call("POST", `/api/campaign/${campaign.id}/systems`, { actor: "gm", body: { id: sysP, name: "Peg Sys", ownerFactionId: pegged } });
  await call("POST", `/api/campaign/${campaign.id}/systems`, { actor: "gm", body: { id: sysS, name: "Steel Sys", ownerFactionId: steelpeg } });
  await call("POST", `/api/campaign/${campaign.id}/systems`, { actor: "gm", body: { id: sysF, name: "Floor Sys", ownerFactionId: flooronly } });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysP}/planets`, {
    actor: "gm",
    body: { id: planetP, name: "Peg Home", type: "rocky", climate: "temperate", resources: ["map.titan"] },
  });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysS}/planets`, {
    actor: "gm",
    body: { id: planetS, name: "Steel Home", type: "rocky", climate: "temperate", resources: ["map.glasssteel"] },
  });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysF}/planets`, {
    actor: "gm",
    body: { id: planetF, name: "Floor Home", type: "rocky", climate: "temperate", resources: ["map.titan"] },
  });

  await call("POST", `/api/campaign/${campaign.id}/systems/${sysP}/planets/${planetP}/colonize`, { actor: pegged, body: { colonyType: "colony" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysS}/planets/${planetS}/colonize`, { actor: steelpeg, body: { colonyType: "colony" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysF}/planets/${planetF}/colonize`, { actor: flooronly, body: { colonyType: "colony" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysP}/planets/${planetP}/build`, { actor: pegged, body: { buildingId: "building.mine" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysS}/planets/${planetS}/build`, { actor: steelpeg, body: { buildingId: "building.mine" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysF}/planets/${planetF}/build`, { actor: flooronly, body: { buildingId: "building.mine" } });

  const peg = await call("POST", `/api/campaign/${campaign.id}/factions/${pegged}/peg`, { actor: "gm", body: { resourceId: "map.titan" } });
  const steel = await call("POST", `/api/campaign/${campaign.id}/factions/${steelpeg}/peg`, { actor: "gm", body: { resourceId: "map.glasssteel" } });
  console.log(`Pegs set: titan=${peg.pegResourceId} steel=${steel.pegResourceId}`);

  const clamped = await call("POST", `/api/campaign/${campaign.id}/currency/peg-multiplier`, {
    actor: "gm",
    body: { resourceId: "map.titan", multiplier: 9 },
  });
  if (clamped.multiplier !== 1.5) {
    throw new Error(`FAIL: GM multiplier 9 was not clamped to 1.5 (got ${clamped.multiplier})`);
  }
  await call("POST", `/api/campaign/${campaign.id}/currency/peg-multiplier`, {
    actor: "gm",
    body: { resourceId: "map.titan", multiplier: 1 },
  });

  const before = await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" });
  const beforePegged = stocksOf(before, pegged);
  const beforeFloor = stocksOf(before, flooronly);
  console.log(`before pegged  metal=${beforePegged["currency.metal"]} supply=${beforePegged["currency.supply"]}`);
  console.log(`before floor   metal=${beforeFloor["currency.metal"]} supply=${beforeFloor["currency.supply"]}`);

  const tick = await call("POST", `/api/campaign/${campaign.id}/turn`, { actor: "gm", body: {} });
  console.log(`pegged channels: ${JSON.stringify(tick.economy.breakdowns[pegged].channels)}`);
  console.log(`floor  channels: ${JSON.stringify(tick.economy.breakdowns[flooronly].channels)}`);

  const after = await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" });
  const afterPegged = stocksOf(after, pegged);
  const afterSteel = stocksOf(after, steelpeg);
  const afterFloor = stocksOf(after, flooronly);
  const peggedMetalDelta = afterPegged["currency.metal"] - beforePegged["currency.metal"];
  const floorMetalDelta = afterFloor["currency.metal"] - beforeFloor["currency.metal"];
  const peggedSupplyDelta = afterPegged["currency.supply"] - beforePegged["currency.supply"];
  const floorSupplyDelta = afterFloor["currency.supply"] - beforeFloor["currency.supply"];

  console.log(`\npegged  Δmetal=${peggedMetalDelta} Δsupply=${peggedSupplyDelta} titan=${afterPegged["map.titan"] ?? 0}`);
  console.log(`steel   Δmetal=${afterSteel["currency.metal"] - stocksOf(before, steelpeg)["currency.metal"]} glass=${afterSteel["map.glasssteel"] ?? 0}`);
  console.log(`floor   Δmetal=${floorMetalDelta} Δsupply=${floorSupplyDelta}`);

  if (peggedMetalDelta <= floorMetalDelta) {
    throw new Error(`FAIL: pegged metal delta ${peggedMetalDelta} was not beyond floor-only ${floorMetalDelta}`);
  }
  if (floorSupplyDelta <= 0) {
    throw new Error("FAIL: floor-only faction did not gain supply from the legacy floor");
  }
  if (floorMetalDelta !== 0) {
    throw new Error(`FAIL: floor-only metal delta should stay 0, got ${floorMetalDelta}`);
  }
  const titanStock = afterPegged["map.titan"] ?? 0;
  const glassStock = afterSteel["map.glasssteel"] ?? 0;
  if (titanStock < 1 || glassStock < 1) {
    throw new Error(`FAIL: expected raw peg stocks after tick (titan=${titanStock} glass=${glassStock})`);
  }

  const barterGive = 1;
  const barter = await call("POST", `/api/campaign/${campaign.id}/currency/barter`, {
    actor: "gm",
    body: {
      fromFactionId: pegged,
      toFactionId: steelpeg,
      give: { resourceId: "map.titan", amount: barterGive },
      receive: { resourceId: "map.glasssteel", amount: barterGive },
    },
  });
  if (barter.fromStocks["map.titan"] !== titanStock - barterGive) {
    throw new Error(`FAIL: barter did not debit titan 1:1 (${barter.fromStocks["map.titan"]} vs ${titanStock - 1})`);
  }
  if (barter.toStocks["map.glasssteel"] !== glassStock - barterGive) {
    throw new Error("FAIL: barter did not debit glasssteel 1:1");
  }
  console.log(`barter 1:1 titan↔glasssteel ok`);

  const deal = await call("POST", `/api/campaign/${campaign.id}/currency/exchange-deal`, {
    actor: "gm",
    body: {
      factionAId: pegged,
      factionBId: steelpeg,
      unitsQuotePerBase: 2,
      basePeg: "map.titan",
      quotePeg: "map.glasssteel",
    },
  });
  const political = await call("POST", `/api/campaign/${campaign.id}/relations`, {
    actor: "gm",
    body: { factionAId: pegged, factionBId: steelpeg, relation: "alliance" },
  });
  const typesA = political.factionA.diplomacy.treaties.map((t) => t.type).sort();
  console.log(`coexist treaties: ${typesA.join(", ")}`);
  if (!typesA.includes("alliance") || !typesA.includes("currency_exchange")) {
    throw new Error(`FAIL: political+economic did not coexist: ${typesA}`);
  }
  if (!deal.factionA.diplomacy.treaties.some((t) => t.type === "currency_exchange" && t.unitsQuotePerBase === 2)) {
    throw new Error("FAIL: exchange-deal did not persist frozen rate 2");
  }

  const preSettlePegged = barter.fromStocks["map.titan"];
  const preSettleSteelGlass = barter.toStocks["map.glasssteel"];
  const settle = await call("POST", `/api/campaign/${campaign.id}/currency/exchange-settle`, {
    actor: "gm",
    body: { fromFactionId: pegged, toFactionId: steelpeg, amount: 1 },
  });
  if (settle.giveAmt !== 1 || settle.takeAmt !== 2) {
    throw new Error(`FAIL: deal settlement should be 1 titan for 2 glasssteel, got ${settle.giveAmt}:${settle.takeAmt}`);
  }
  if (settle.fromStocks["map.titan"] !== preSettlePegged - 1) {
    throw new Error("FAIL: settle did not debit 1 titan from pegged");
  }
  if (settle.toStocks["map.glasssteel"] !== preSettleSteelGlass - 2) {
    throw new Error("FAIL: settle did not debit 2 glasssteel (rate 2, distinct from barter 1:1)");
  }
  console.log(`exchange-settle 1 titan → 2 glasssteel ok`);

  const union = await call("POST", `/api/campaign/${campaign.id}/currency/union`, {
    actor: "gm",
    body: { fromFactionId: steelpeg, intoFactionId: pegged },
  });
  if (union.adoptedPeg !== "map.titan") {
    throw new Error(`FAIL: currency union should adopt titan peg, got ${union.adoptedPeg}`);
  }
  const afterUnion = await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" });
  const steelFaction = afterUnion.factions.find((row) => row.faction.id === steelpeg).faction;
  if (steelFaction.pegResourceId !== "map.titan") {
    throw new Error(`FAIL: steelpeg pegResourceId should be map.titan after union, got ${steelFaction.pegResourceId}`);
  }
  const unionTypes = union.factionA.diplomacy.treaties.map((t) => t.type).sort();
  if (!unionTypes.includes("alliance") || !unionTypes.includes("currency_union")) {
    throw new Error(`FAIL: union should replace economic track only: ${unionTypes}`);
  }
  console.log(`currency-union adopted map.titan; alliance kept`);

  console.log("\nPASS: peg conversion beyond floor; barter 1:1 ≠ deal 1:2; union adopts host peg.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
