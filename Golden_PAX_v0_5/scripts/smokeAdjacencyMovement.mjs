/**
 * Live HTTP check for SYSTEM_ADJACENCY_AND_MOVEMENT_SPEC.
 * Graph + hop/supply expectations, disconnected production, instant fleet
 * move (systemId + MP), rejected overspend, MP regen on turn.
 *
 * Two campaigns: a founding core has 10 pop, and a scout (hull+crew, over
 * ceiling) spends 9 — not enough left to found a labor-staffed hop-4
 * colony in the same budget. Movement and logistics are checked separately.
 *
 * Usage: node server/serve.mjs  (other terminal) then:
 *        node scripts/smokeAdjacencyMovement.mjs
 */
import { createSmokeClient, assert } from "./smokeHttp.mjs";

const { call, seatPlayer } = createSmokeClient();

function stocksOf(state, factionId) {
  return state.factions.find((row) => row.faction.id === factionId).economy.stocks;
}

function forceOf(list, name) {
  return (list || []).find((f) => f.name === name);
}

async function newCampaign(name) {
  const campaign = (await call("POST", "/api/campaign", { actor: "gm", body: { name } })).json;
  assert(campaign?.id, `campaign created (${campaign.id})`);
  const tag = campaign.id.slice(0, 8);
  return { campaign, tag };
}

async function addFaction(campaignId, id, name, colorHex) {
  const res = await call("POST", `/api/campaign/${campaignId}/factions`, {
    actor: "gm",
    body: { id, name, raceId: "race_human", colorHex },
  });
  assert(res.ok, `faction ${id} created`);
  await seatPlayer(campaignId, id);
}

async function addAlphaChain(campaignId, ownerFactionId, sys) {
  const keys = ["a0", "a1", "a2", "a3", "a4"];
  for (let i = 0; i < keys.length; i++) {
    const id = sys(keys[i]);
    const created = await call("POST", `/api/campaign/${campaignId}/systems`, {
      actor: "gm",
      body: {
        id,
        name: `Alpha ${i}`,
        ownerFactionId,
        x: i * 10,
        y: 0,
        isCapital: i === 0,
        links: i > 0 ? [{ toSystemId: sys(keys[i - 1]), type: "corridor" }] : [],
      },
    });
    assert(created.ok, `alpha system ${id} created (${created.status})`);
  }
}

async function smokeMovement() {
  console.log("--- movement ---");
  const { campaign, tag } = await newCampaign("smoke-adjacency-move");
  const alpha = `adj.ma.${tag}`;
  const sys = (key) => `sys.m.${key}.${tag}`;
  const a0 = sys("a0");
  const a2 = sys("a2");
  const a4 = sys("a4");
  const planetHome = `adj.mhome.${tag}`;

  await addFaction(campaign.id, alpha, "Alpha", "#2266cc");
  await addAlphaChain(campaign.id, alpha, sys);
  await call("POST", `/api/campaign/${campaign.id}/systems/${a0}/planets`, {
    actor: "gm",
    body: { id: planetHome, name: "Alpha I", type: "rocky", climate: "temperate" },
  });

  const col = await call("POST", `/api/campaign/${campaign.id}/systems/${a0}/planets/${planetHome}/colonize`, {
    actor: alpha,
    body: { colonyType: "core" },
  });
  assert(col.json?.ok, `core colonized (${col.json?.error})`);

  const graph = (await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json;
  assert(graph.links?.length === 4, `4 undirected chain links, got ${graph.links?.length}`);
  assert(graph.systems.find((s) => s.id === a0)?.isCapital === true, "a0 is capital (display+logistics marker)");
  assert(graph.systems.find((s) => s.id === a0)?.x === 0, "x/y persisted as display columns");

  const shipyard = await call("POST", `/api/campaign/${campaign.id}/systems/${a0}/planets/${planetHome}/build`, {
    actor: alpha,
    body: { buildingId: "building.shipyard" },
  });
  assert(shipyard.json?.ok === true, `shipyard placed (${shipyard.json?.error})`);

  const raised = await call("POST", `/api/campaign/${campaign.id}/systems/${a0}/planets/${planetHome}/forces`, {
    actor: alpha,
    body: { defId: "ship.scout", kind: "ship", count: 1, name: "Scout-1", overrideCeiling: true },
  });
  assert(raised.json?.ok === true, `fleet raised (${raised.json?.error})`);
  const fleet = raised.json.force;
  assert(fleet.systemId === a0, `raised at a0, got ${fleet.systemId}`);
  const mpMax = fleet.movementPoints;
  assert(mpMax > 0, `starts with movement points ${mpMax}`);

  const move = await call("POST", `/api/campaign/${campaign.id}/forces/${fleet.id}/move`, {
    actor: alpha,
    body: { toSystemId: a2 },
  });
  assert(move.ok && move.json?.ok, `move a0→a2 (2 hops) ${move.json?.error || ""}`);
  assert(move.json.force.systemId === a2, "systemId now a2");
  assert(move.json.force.movementPoints === mpMax - 2, `MP ${mpMax}→${mpMax - 2}, got ${move.json.force.movementPoints}`);
  assert(move.json.hops === 2, "hops 2");

  const denied = await call("POST", `/api/campaign/${campaign.id}/forces/${fleet.id}/move`, {
    actor: alpha,
    body: { toSystemId: a4 },
  });
  assert(denied.ok === false || denied.json?.ok === false, `a2→a4 rejected (${denied.json?.error})`);
  assert(
    denied.json?.error === "out_of_range" || denied.json?.error === "insufficient_movement_points",
    `reject reason is range or MP, got ${denied.json?.error}`,
  );

  const listed = (await call("GET", `/api/campaign/${campaign.id}/factions/${alpha}/forces`, { actor: alpha })).json;
  const still = forceOf(listed.forces, "Scout-1");
  assert(still.systemId === a2, "rejected move did not move the fleet");
  assert(still.movementPoints === mpMax - 2, "rejected move did not spend MP");

  await call("POST", `/api/campaign/${campaign.id}/turn`, { actor: "gm", body: {} });
  const afterTurn = (await call("GET", `/api/campaign/${campaign.id}/factions/${alpha}/forces`, { actor: alpha })).json;
  const refreshed = forceOf(afterTurn.forces, "Scout-1");
  assert(refreshed.systemId === a2, "still at a2 after turn (location-agnostic regen)");
  assert(refreshed.movementPoints === mpMax, `MP regenerated to max ${mpMax}, got ${refreshed.movementPoints}`);
}

async function smokeLogistics() {
  console.log("--- logistics ---");
  const { campaign, tag } = await newCampaign("smoke-adjacency-logistics");
  const alpha = `adj.la.${tag}`;
  const bravo = `adj.lb.${tag}`;
  const sys = (key) => `sys.l.${key}.${tag}`;
  const a0 = sys("a0");
  const a4 = sys("a4");
  const b0 = sys("b0");
  const planetHome = `adj.lhome.${tag}`;
  const planetFar = `adj.lfar.${tag}`;
  const planetBravo = `adj.lbravo.${tag}`;

  await addFaction(campaign.id, alpha, "Alpha", "#2266cc");
  await addFaction(campaign.id, bravo, "Bravo", "#cc3322");
  await addAlphaChain(campaign.id, alpha, sys);
  const bravoSys = await call("POST", `/api/campaign/${campaign.id}/systems`, {
    actor: "gm",
    body: { id: b0, name: "Bravo Home", ownerFactionId: bravo, x: 0, y: 20, isCapital: true },
  });
  assert(bravoSys.ok, `bravo system created (${bravoSys.status})`);

  await call("POST", `/api/campaign/${campaign.id}/systems/${a0}/planets`, {
    actor: "gm",
    body: { id: planetHome, name: "Alpha I", type: "rocky", climate: "temperate" },
  });
  await call("POST", `/api/campaign/${campaign.id}/systems/${a4}/planets`, {
    actor: "gm",
    body: { id: planetFar, name: "Alpha Far", type: "rocky", climate: "temperate" },
  });
  await call("POST", `/api/campaign/${campaign.id}/systems/${b0}/planets`, {
    actor: "gm",
    body: { id: planetBravo, name: "Bravo I", type: "rocky", climate: "temperate" },
  });

  const colA0 = await call("POST", `/api/campaign/${campaign.id}/systems/${a0}/planets/${planetHome}/colonize`, {
    actor: alpha,
    body: { colonyType: "core" },
  });
  const colA4 = await call("POST", `/api/campaign/${campaign.id}/systems/${a4}/planets/${planetFar}/colonize`, {
    actor: alpha,
    body: { colonyType: "colony" },
  });
  const colB = await call("POST", `/api/campaign/${campaign.id}/systems/${b0}/planets/${planetBravo}/colonize`, {
    actor: bravo,
    body: { colonyType: "core" },
  });
  assert(colA0.json?.ok && colA4.json?.ok && colB.json?.ok, `colonies placed (${colA0.json?.error}/${colA4.json?.error}/${colB.json?.error})`);

  const mineA4 = await call("POST", `/api/campaign/${campaign.id}/systems/${a4}/planets/${planetFar}/build`, {
    actor: alpha,
    body: { buildingId: "building.mine" },
  });
  const mineB = await call("POST", `/api/campaign/${campaign.id}/systems/${b0}/planets/${planetBravo}/build`, {
    actor: bravo,
    body: { buildingId: "building.mine" },
  });
  assert(mineA4.json?.ok && mineB.json?.ok, `mines placed on hop-4 and bravo capital (${mineA4.json?.error}/${mineB.json?.error})`);

  const before = (await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json;
  await call("POST", `/api/campaign/${campaign.id}/turn`, { actor: "gm", body: {} });
  const after = (await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json;
  const dAlpha = stocksOf(after, alpha)["currency.extracta"] - stocksOf(before, alpha)["currency.extracta"];
  const dBravo = stocksOf(after, bravo)["currency.extracta"] - stocksOf(before, bravo)["currency.extracta"];
  // Bravo: 1 connected mine. Alpha: 1 disconnected hop-4 mine (×0.5).
  assert(dBravo > 0, `bravo connected mine extracta Δ ${dBravo}`);
  assert(dAlpha > 0, `alpha hop-4 mine still produces extracta Δ ${dAlpha}`);
  assert(dAlpha < dBravo, `alpha hop-4 mine is penalized (${dAlpha} < bravo ${dBravo})`);
}

async function main() {
  console.log("=== smoke adjacency + movement ===\n");
  await smokeMovement();
  await smokeLogistics();
  console.log("\n=== adjacency + movement live check passed ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
