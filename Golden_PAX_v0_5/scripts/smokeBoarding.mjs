/**
 * Live smoke for boarding + legion/fleet kind guard
 * (agent-tasks/BOARDING_AND_FORCE_KIND_GUARD_SPEC.md). NOT a port — GMap
 * has no boarding mechanic.
 *
 * Two campaigns: core colonies only have 10 pop, and a scout's hull+crew
 * costs 8, so capture and loss each get a fresh pair.
 *
 * Usage: node server/serve.mjs  (other terminal) then:
 *        node scripts/smokeBoarding.mjs
 */
import { createSmokeClient, assert } from "./smokeHttp.mjs";

const { call, seatPlayer } = createSmokeClient();

function planetPop(state, planetId) {
  for (const sys of state.systems) {
    const p = (sys.planets || []).find((x) => x.id === planetId);
    if (p) return p.population;
  }
  return null;
}

async function seedPair(tag) {
  const alpha = `brd.a.${tag}`;
  const bravo = `brd.b.${tag}`;
  const sysA = `sys.${alpha}`;
  const sysB = `sys.${bravo}`;
  const planetA = `${alpha}.home`;
  const planetB = `${bravo}.home`;

  const campaign = (await call("POST", "/api/campaign", { actor: "gm", body: { name: `smoke-boarding-${tag}` } })).json;
  assert(campaign?.id, `campaign ${tag} created (${campaign.id})`);

  await call("POST", `/api/campaign/${campaign.id}/factions`, { actor: "gm", body: { id: alpha, name: "Alpha", raceId: "race_human", colorHex: "#2266cc" } });
  await call("POST", `/api/campaign/${campaign.id}/factions`, { actor: "gm", body: { id: bravo, name: "Bravo", raceId: "race_belator", colorHex: "#cc3322" } });
  await seatPlayer(campaign.id, alpha);
  await seatPlayer(campaign.id, bravo);
  await call("POST", `/api/campaign/${campaign.id}/systems`, { actor: "gm", body: { id: sysA, name: "Alpha Home", ownerFactionId: alpha } });
  await call("POST", `/api/campaign/${campaign.id}/systems`, { actor: "gm", body: { id: sysB, name: "Bravo Home", ownerFactionId: bravo } });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysA}/planets`, { actor: "gm", body: { id: planetA, name: "Alpha I", type: "rocky", climate: "temperate" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysB}/planets`, { actor: "gm", body: { id: planetB, name: "Bravo I", type: "rocky", climate: "temperate" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysA}/planets/${planetA}/colonize`, { actor: alpha, body: { colonyType: "core" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysB}/planets/${planetB}/colonize`, { actor: bravo, body: { colonyType: "core" } });

  const yard = await call("POST", `/api/campaign/${campaign.id}/systems/${sysB}/planets/${planetB}/build`, {
    actor: bravo,
    body: { buildingId: "building.shipyard" },
  });
  assert(yard.json?.ok === true, `bravo built shipyard (${yard.json?.error})`);

  const raisedFleet = await call("POST", `/api/campaign/${campaign.id}/systems/${sysB}/planets/${planetB}/forces`, {
    actor: bravo,
    body: { defId: "ship.scout", kind: "ship", count: 1, name: "Bravo Scout", overrideCeiling: true },
  });
  assert(raisedFleet.json?.ok === true, `bravo raised scout (${raisedFleet.json?.error})`);
  assert(raisedFleet.json.force.kind === "fleet", "raised force is kind=fleet");
  assert(
    raisedFleet.json.force.composition[0].crewCount === 5,
    `persisted crewCount is 5 (tier 1 × crewPerTier), got ${raisedFleet.json.force.composition[0].crewCount}`,
  );
  assert(raisedFleet.json.force.composition[0].count === 1, "ship group count is 1 (crew is not extra ships)");

  const state = (await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json;
  assert(planetPop(state, planetB) === 2, `bravo pop 10 → 2 (1 hull + 5 crew, overflow 1.5x), got ${planetPop(state, planetB)}`);

  return { campaignId: campaign.id, alpha, bravo, sysA, sysB, planetA, planetB, fleet: raisedFleet.json.force };
}

async function main() {
  console.log("=== smoke boarding — kind guard + crewCount + capture/loss ===\n");
  const tag = Date.now().toString(36);

  console.log("-- capture + kind guard --");
  const cap = await seedPair(`${tag}c`);
  // 5 militia vs 5 crew: live retreat stance is powerMult 0.35, so crew
  // disengages (powerB < powerA*0.8) and that captures. 7 militia costs 70
  // metal, which a core colony cannot afford after the 34 colonize cost.
  const raisedLegion = await call("POST", `/api/campaign/${cap.campaignId}/systems/${cap.sysA}/planets/${cap.planetA}/forces`, {
    actor: cap.alpha,
    body: { defId: "unit.militia", kind: "unit", count: 5, name: "Alpha Boarders", overrideCeiling: true },
  });
  assert(raisedLegion.json?.ok === true, `alpha raised 5 militia (${raisedLegion.json?.error})`);
  const legionId = raisedLegion.json.force.id;
  assert(raisedLegion.json.force.kind === "legion", "raised force is kind=legion");
  assert(raisedLegion.json.force.composition[0].crewCount == null, "legion group has no crewCount");

  const crossKind = await call("POST", `/api/campaign/${cap.campaignId}/forces/${legionId}/engage`, {
    actor: cap.alpha,
    body: { forceBId: cap.fleet.id },
  });
  assert(
    crossKind.status === 400 && crossKind.json?.error === "cross_kind_engage_not_allowed",
    `cross-kind engage rejected: ${crossKind.status} ${crossKind.json?.error}`,
  );

  const reverseCross = await call("POST", `/api/campaign/${cap.campaignId}/forces/${cap.fleet.id}/engage`, {
    actor: cap.bravo,
    body: { forceBId: legionId },
  });
  assert(reverseCross.status === 400 && reverseCross.json?.error === "cross_kind_engage_not_allowed", "fleet→legion engage also rejected");

  const boardWin = await call("POST", `/api/campaign/${cap.campaignId}/forces/${legionId}/board`, {
    actor: cap.alpha,
    body: { targetFleetForceId: cap.fleet.id, systemId: cap.sysB },
  });
  assert(boardWin.ok && boardWin.json?.ok, `overwhelming board ok (${boardWin.json?.error})`);
  assert(boardWin.json.captured === true, `captured=true (outcome=${boardWin.json.outcome})`);
  assert(boardWin.json.forceB?.factionId === cap.alpha, `fleet factionId transferred to alpha, got ${boardWin.json.forceB?.factionId}`);
  assert(boardWin.json.forceB?.composition?.[0]?.defId === "ship.scout", "captured fleet is still ships, not militia");

  const alphaForces = await call("GET", `/api/campaign/${cap.campaignId}/factions/${cap.alpha}/forces`, { actor: cap.alpha });
  const bravoForces = await call("GET", `/api/campaign/${cap.campaignId}/factions/${cap.bravo}/forces`, { actor: cap.bravo });
  assert(alphaForces.json.forces.some((f) => f.id === cap.fleet.id && f.factionId === cap.alpha), "GET alpha/forces includes captured fleet");
  assert(!bravoForces.json.forces.some((f) => f.id === cap.fleet.id), "GET bravo/forces no longer lists the captured fleet");

  console.log("-- loss --");
  const loss = await seedPair(`${tag}l`);
  const raisedWeak = await call("POST", `/api/campaign/${loss.campaignId}/systems/${loss.sysA}/planets/${loss.planetA}/forces`, {
    actor: loss.alpha,
    body: { defId: "unit.militia", kind: "unit", count: 1, name: "Weak Boarders" },
  });
  assert(raisedWeak.json?.ok === true, `alpha raised 1 militia (${raisedWeak.json?.error})`);
  const weakId = raisedWeak.json.force.id;
  const weakCountBefore = raisedWeak.json.force.composition[0].count;

  const boardLoss = await call("POST", `/api/campaign/${loss.campaignId}/forces/${weakId}/board`, {
    actor: loss.alpha,
    body: { targetFleetForceId: loss.fleet.id, systemId: loss.sysB },
  });
  assert(boardLoss.ok && boardLoss.json?.ok, `weak board resolved (${boardLoss.json?.error})`);
  assert(boardLoss.json.captured !== true, `not captured (outcome=${boardLoss.json.outcome})`);
  assert(boardLoss.json.forceB?.factionId === loss.bravo, `fleet still owned by bravo, got ${boardLoss.json.forceB?.factionId}`);

  const bravoForces2 = await call("GET", `/api/campaign/${loss.campaignId}/factions/${loss.bravo}/forces`, { actor: loss.bravo });
  const stillBravo = bravoForces2.json.forces.find((f) => f.id === loss.fleet.id);
  assert(stillBravo?.factionId === loss.bravo, "GET bravo/forces still owns the scout");

  if (boardLoss.json.forceA) {
    const after = boardLoss.json.forceA.composition.reduce((s, g) => s + (g.count || 0), 0);
    assert(after <= weakCountBefore, `legion took normal losses or held (${weakCountBefore} → ${after})`);
  } else {
    assert((boardLoss.json.deletedForceIds || []).includes(weakId), "wiped legion was deleted (casualties outcome, not a special boarding wipe)");
  }

  console.log("\nALL CHECKS PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
