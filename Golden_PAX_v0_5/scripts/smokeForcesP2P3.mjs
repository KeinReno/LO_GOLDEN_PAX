/**
 * Live smoke for Priority 2 / 3a / 3b (agent-tasks/CURRENCY_AND_FORCES_INTEGRATION_SPEC.md).
 * Hits the real HTTP API: raise with overrideCeiling, engage until wipe,
 * confirm the loser is gone and population did NOT return, then partial
 * disband by defId.
 *
 * Usage: node server/serve.mjs  (other terminal) then:
 *        node scripts/smokeForcesP2P3.mjs
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

async function main() {
  console.log("=== smoke P2/3a/3b — forces engage + overrideCeiling + defId disband ===\n");

  const campaign = (await call("POST", "/api/campaign", { actor: "gm", body: { name: "smoke-forces-p2-p3" } })).json;
  assert(campaign?.id, `campaign created (${campaign.id})`);

  await call("POST", `/api/campaign/${campaign.id}/factions`, { actor: "gm", body: { id: "alpha", name: "Alpha", raceId: "race_human", colorHex: "#2266cc" } });
  await call("POST", `/api/campaign/${campaign.id}/factions`, { actor: "gm", body: { id: "bravo", name: "Bravo", raceId: "race_belator", colorHex: "#cc3322" } });
  await seatPlayer(campaign.id, "alpha");
  await seatPlayer(campaign.id, "bravo");
  await call("POST", `/api/campaign/${campaign.id}/systems`, { actor: "gm", body: { id: "sys.alpha", name: "Alpha Home", ownerFactionId: "alpha" } });
  await call("POST", `/api/campaign/${campaign.id}/systems`, { actor: "gm", body: { id: "sys.bravo", name: "Bravo Home", ownerFactionId: "bravo" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/sys.alpha/links`, { actor: "gm", body: { toSystemId: "sys.bravo", type: "corridor" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/sys.alpha/planets`, { actor: "gm", body: { id: "alpha.home", name: "Alpha I", type: "rocky", climate: "temperate" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/sys.bravo/planets`, { actor: "gm", body: { id: "bravo.home", name: "Bravo I", type: "rocky", climate: "temperate" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/sys.alpha/planets/alpha.home/colonize`, { actor: "alpha", body: { colonyType: "core" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/sys.bravo/planets/bravo.home/colonize`, { actor: "bravo", body: { colonyType: "core" } });

  let state = (await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json;
  assert(planetPop(state, "alpha.home") === 10, `alpha core pop is 10 (ceiling floor(10*0.3)=3)`);
  assert(planetPop(state, "bravo.home") === 10, `bravo core pop is 10`);

  // --- 3a: hard cap still rejects; override spends 1.5x on overflow ---
  const blocked = await call("POST", `/api/campaign/${campaign.id}/systems/sys.alpha/planets/alpha.home/forces`, {
    actor: "alpha",
    body: { defId: "unit.militia", kind: "unit", count: 5, name: "Alpha Levy" },
  });
  assert(blocked.json?.ok === false && /mobilizable/.test(blocked.json?.error || ""), `raise 5 without override rejected: ${blocked.json?.error}`);

  const raisedA = await call("POST", `/api/campaign/${campaign.id}/systems/sys.alpha/planets/alpha.home/forces`, {
    actor: "alpha",
    body: { defId: "unit.militia", kind: "unit", count: 5, name: "Alpha Levy", overrideCeiling: true },
  });
  assert(raisedA.json?.ok === true, "raise 5 with overrideCeiling succeeded");
  assert(raisedA.json.planet.population === 4, `alpha pop 10 → 4 (cost 3 + ceil(2*1.5)=6), got ${raisedA.json.planet.population}`);
  assert(raisedA.json.force.composition[0].count === 5, `group count is 5 units, not 6 (penalty is extra pop, not extra units)`);
  const forceAId = raisedA.json.force.id;

  const raisedB = await call("POST", `/api/campaign/${campaign.id}/systems/sys.bravo/planets/bravo.home/forces`, {
    actor: "bravo",
    body: { defId: "unit.militia", kind: "unit", count: 1, name: "Bravo Levy" },
  });
  assert(raisedB.json?.ok === true, "bravo raised 1 militia under the ceiling");
  assert(raisedB.json.planet.population === 9, `bravo pop 10 → 9`);
  const forceBId = raisedB.json.force.id;
  const bravoPopAfterRaise = 9;
  const marched = await call("POST", `/api/campaign/${campaign.id}/forces/${forceAId}/move`, {
    actor: "alpha",
    body: { toSystemId: "sys.bravo" },
  });
  assert(marched.json?.ok, `alpha marched to bravo system (${marched.json?.error})`);

  // --- P2: engage until B is wiped; population must NOT return ---
  let lastEngage;
  let deletedB = false;
  for (let i = 1; i <= 20; i++) {
    lastEngage = await call("POST", `/api/campaign/${campaign.id}/forces/${forceAId}/engage`, {
      actor: "alpha",
      body: { forceBId },
    });
    assert(lastEngage.ok && lastEngage.json?.ok, `engage #${i} ok (outcome=${lastEngage.json?.outcome})`);
    if ((lastEngage.json.deletedForceIds || []).includes(forceBId)) {
      deletedB = true;
      console.log(`  ok  bravo force wiped on engage #${i} (outcome=${lastEngage.json.outcome})`);
      break;
    }
  }
  assert(deletedB, "bravo force was deleted after wipeout");

  const bravoForces = await call("GET", `/api/campaign/${campaign.id}/factions/bravo/forces`, { actor: "bravo" });
  assert(bravoForces.json.forces.length === 0, "GET bravo/forces is empty after wipe");

  const alphaForces = await call("GET", `/api/campaign/${campaign.id}/factions/alpha/forces`, { actor: "alpha" });
  assert(alphaForces.json.forces.some((f) => f.id === forceAId), "alpha force still listed");
  const survivingCount = alphaForces.json.forces.find((f) => f.id === forceAId).composition.reduce((s, g) => s + g.count, 0);
  console.log(`  ..  alpha survivors: ${survivingCount}`);

  state = (await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json;
  assert(planetPop(state, "bravo.home") === bravoPopAfterRaise, `bravo pop still ${bravoPopAfterRaise} after combat loss (not a disband)`);

  // --- 3b: partial disband by defId returns population ---
  const alphaPopBeforeDisband = planetPop(state, "alpha.home");
  const disband = await call("POST", `/api/campaign/${campaign.id}/forces/${forceAId}/disband`, {
    actor: "alpha",
    body: { count: 1, defId: "unit.militia" },
  });
  assert(disband.json?.ok === true && disband.json.force, "partial disband by defId kept the force");
  assert(disband.json.planet.population === alphaPopBeforeDisband + 1, `alpha pop ${alphaPopBeforeDisband} → ${alphaPopBeforeDisband + 1} after disband 1`);

  const badDef = await call("POST", `/api/campaign/${campaign.id}/forces/${forceAId}/disband`, {
    actor: "alpha",
    body: { count: 1, defId: "ship.scout" },
  });
  assert(badDef.status === 400, `unknown defId → 400 (${badDef.json?.error})`);

  console.log("\nALL CHECKS PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
