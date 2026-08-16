/**
 * Live HTTP check for Priority 4 (agent-tasks/CURRENCY_AND_FORCES_INTEGRATION_SPEC.md).
 * 4a: grade upgrade raises surface slots and spends stocks.
 * 4b: owned asteroid adds extracta and depletes; minefield hurts the
 *     challenger in engage. Unowned asteroid does neither.
 *
 * Usage: node server/serve.mjs  (other terminal) then:
 *        node scripts/smokePriority4.mjs
 */
import { createSmokeClient, assert } from "./smokeHttp.mjs";

const { call, seatPlayer } = createSmokeClient();

function stocksOf(state, factionId) {
  return state.factions.find((row) => row.faction.id === factionId).economy.stocks;
}

function systemOf(state, systemId) {
  return state.systems.find((s) => s.id === systemId);
}

function planetOf(state, planetId) {
  for (const sys of state.systems) {
    const p = (sys.planets || []).find((x) => x.id === planetId);
    if (p) return p;
  }
  return null;
}

async function main() {
  console.log("=== smoke P4 — planet grade + space objects ===\n");

  const tag = Date.now().toString(36);
  const alpha = `p4a.${tag}`;
  const bravo = `p4b.${tag}`;
  const sysAlpha = `sys.${alpha}`;
  const sysBravo = `sys.${bravo}`;
  const sysWild = `sys.wild.${tag}`;
  const planetA = `${alpha}.home`;
  const planetB = `${bravo}.home`;

  const campaign = (await call("POST", "/api/campaign", { actor: "gm", body: { name: `smoke-p4-${tag}` } })).json;
  assert(campaign?.id, `campaign created (${campaign.id})`);

  const fa = await call("POST", `/api/campaign/${campaign.id}/factions`, { actor: "gm", body: { id: alpha, name: "Alpha", raceId: "race_human", colorHex: "#2266cc" } });
  assert(fa.ok, `alpha faction created (${JSON.stringify(fa.json)})`);
  const fb = await call("POST", `/api/campaign/${campaign.id}/factions`, { actor: "gm", body: { id: bravo, name: "Bravo", raceId: "race_belator", colorHex: "#cc3322" } });
  assert(fb.ok, `bravo faction created`);
  await seatPlayer(campaign.id, alpha);
  await seatPlayer(campaign.id, bravo);

  const sysA = await call("POST", `/api/campaign/${campaign.id}/systems`, {
    actor: "gm",
    body: { id: sysAlpha, name: "Alpha Home", ownerFactionId: alpha, spaceObjects: [{ typeId: "asteroid" }, { typeId: "minefield" }] },
  });
  assert(sysA.ok && sysA.json?.spaceObjects?.length === 2, `alpha system has asteroid+minefield (${JSON.stringify(sysA.json)})`);
  const asteroid = sysA.json.spaceObjects.find((o) => o.typeId === "asteroid");
  assert(asteroid?.remainingAmount === 240, `asteroid starts at 240 remaining, got ${asteroid?.remainingAmount}`);

  await call("POST", `/api/campaign/${campaign.id}/systems`, {
    actor: "gm",
    body: { id: sysWild, name: "Wild Belt", ownerFactionId: null, spaceObjects: [{ typeId: "asteroid" }] },
  });
  await call("POST", `/api/campaign/${campaign.id}/systems`, { actor: "gm", body: { id: sysBravo, name: "Bravo Home", ownerFactionId: bravo } });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysAlpha}/links`, { actor: "gm", body: { toSystemId: sysBravo, type: "corridor" } });

  await call("POST", `/api/campaign/${campaign.id}/systems/${sysAlpha}/planets`, { actor: "gm", body: { id: planetA, name: "Alpha I", type: "rocky", climate: "temperate" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysBravo}/planets`, { actor: "gm", body: { id: planetB, name: "Bravo I", type: "rocky", climate: "temperate" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysAlpha}/planets/${planetA}/colonize`, { actor: alpha, body: { colonyType: "core" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysBravo}/planets/${planetB}/colonize`, { actor: bravo, body: { colonyType: "core" } });

  let state = (await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json;
  const home = planetOf(state, planetA);
  assert(home?.grade === 1 && home.surfaceSlots === 8, `fresh colony is grade 1 / 8 surface slots`);

  const forbidden = await call("POST", `/api/campaign/${campaign.id}/systems/${sysAlpha}/planets/${planetA}/upgrade-grade`, {
    actor: bravo,
    body: { zone: "surface" },
  });
  assert(forbidden.status === 403, `other faction cannot upgrade (status ${forbidden.status})`);

  const extractaBefore = stocksOf(state, alpha)["currency.extracta"];
  const bravoExtractaBefore = stocksOf(state, bravo)["currency.extracta"];
  await call("POST", `/api/campaign/${campaign.id}/turn`, { actor: "gm", body: {} });
  state = (await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json;
  const alphaDelta = stocksOf(state, alpha)["currency.extracta"] - extractaBefore;
  const bravoDelta = stocksOf(state, bravo)["currency.extracta"] - bravoExtractaBefore;
  assert(alphaDelta === bravoDelta + 3, `alpha extracta Δ ${alphaDelta} is bravo Δ ${bravoDelta} + 3 asteroid`);
  const remaining = systemOf(state, sysAlpha).spaceObjects.find((o) => o.typeId === "asteroid").remainingAmount;
  assert(remaining === 237, `asteroid remaining 240 → 237, got ${remaining}`);
  const wildRemaining = systemOf(state, sysWild).spaceObjects.find((o) => o.typeId === "asteroid").remainingAmount;
  assert(wildRemaining === 240, `unowned asteroid did not deplete (still ${wildRemaining})`);

  const raisedA = await call("POST", `/api/campaign/${campaign.id}/systems/${sysAlpha}/planets/${planetA}/forces`, {
    actor: alpha,
    body: { defId: "unit.militia", kind: "unit", count: 1, name: "Alpha Levy" },
  });
  const raisedB = await call("POST", `/api/campaign/${campaign.id}/systems/${sysBravo}/planets/${planetB}/forces`, {
    actor: bravo,
    body: { defId: "unit.militia", kind: "unit", count: 1, name: "Bravo Levy" },
  });
  assert(raisedA.json?.ok && raisedB.json?.ok, `both factions raised 1 militia (A=${JSON.stringify(raisedA.json?.error)} B=${JSON.stringify(raisedB.json?.error)})`);
  const marched = await call("POST", `/api/campaign/${campaign.id}/forces/${raisedB.json.force.id}/move`, {
    actor: bravo,
    body: { toSystemId: sysAlpha },
  });
  assert(marched.json?.ok, `bravo marched onto the minefield (${marched.json?.error})`);

  const engage = await call("POST", `/api/campaign/${campaign.id}/forces/${raisedA.json.force.id}/engage`, {
    actor: alpha,
    body: { forceBId: raisedB.json.force.id },
  });
  assert(engage.json?.ok === true, `engage ok (${engage.json?.outcome})`);
  assert(engage.json.powerA > engage.json.powerB, `minefield: owner power ${engage.json.powerA} > challenger ${engage.json.powerB}`);

  state = (await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json;
  const metalBefore = stocksOf(state, alpha)["currency.metal"];
  const upgraded = await call("POST", `/api/campaign/${campaign.id}/systems/${sysAlpha}/planets/${planetA}/upgrade-grade`, {
    actor: alpha,
    body: { zone: "surface" },
  });
  assert(upgraded.json?.ok === true, `surface grade upgrade succeeded (${upgraded.json?.error || "ok"})`);
  assert(upgraded.json.planet.grade === 2 && upgraded.json.planet.surfaceSlots === 18, `grade 2 → 18 slots, got grade=${upgraded.json.planet.grade} slots=${upgraded.json.planet.surfaceSlots}`);
  assert(upgraded.json.planet.orbitalSlots === 4, "orbital slots unchanged by surface upgrade");
  assert(upgraded.json.stocks["currency.metal"] === metalBefore - 30, `spent 30 metal (${metalBefore} → ${upgraded.json.stocks["currency.metal"]})`);

  console.log("\n=== P4 live check passed ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
