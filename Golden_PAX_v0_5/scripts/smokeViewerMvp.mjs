/**
 * Live smoke for viewer MVP (fog /view, occupy, same-system engage, tax, player peg).
 *
 * Requires a running server:
 *   node server/serve.mjs
 *   node scripts/smokeViewerMvp.mjs
 */
import { createSmokeClient, assert } from "./smokeHttp.mjs";

const { call, seatPlayer } = createSmokeClient();

async function main() {
  console.log("=== smoke viewer MVP — fog / occupy / tax / peg ===\n");

  const tag = Date.now().toString(36);
  const campaign = (await call("POST", "/api/campaign", { actor: "gm", body: { name: `smoke-viewer-mvp-${tag}` } })).json;
  assert(campaign?.id, `campaign created (${campaign?.id})`);
  const cid = campaign.id;
  const f1 = `view.f1.${tag}`;
  const f2 = `view.f2.${tag}`;
  const sysA = `A.${tag}`;
  const sysB = `B.${tag}`;
  const sysC = `C.${tag}`;
  const pA = `pA.${tag}`;
  const pC = `pC.${tag}`;

  const fa = await call("POST", `/api/campaign/${cid}/factions`, {
    actor: "gm",
    body: { id: f1, name: "Alpha", raceId: "race_human", colorHex: "#2266cc" },
  });
  const fb = await call("POST", `/api/campaign/${cid}/factions`, {
    actor: "gm",
    body: { id: f2, name: "Bravo", raceId: "race_belator", colorHex: "#cc3322" },
  });
  assert(fa.ok && fb.ok, `factions created (${fa.status} ${fb.status})`);
  const tok1 = await seatPlayer(cid, f1);
  const tok2 = await seatPlayer(cid, f2);
  assert(tok1.token && tok2.token, "minted player tokens");

  const unauth = await call("GET", `/api/campaign/${cid}/view`);
  assert(unauth.status === 401, `view without token is 401 (got ${unauth.status})`);
  const gmView = await call("GET", `/api/campaign/${cid}/view`, { actor: "gm" });
  assert(gmView.status === 403, `GM /view is 403 (got ${gmView.status})`);
  const playerState = await call("GET", `/api/campaign/${cid}/state`, { actor: f1 });
  assert(playerState.status === 403, `player /state is 403 (got ${playerState.status})`);

  await call("POST", `/api/campaign/${cid}/systems`, { actor: "gm", body: { id: sysA, name: "Alpha Home", ownerFactionId: f1 } });
  await call("POST", `/api/campaign/${cid}/systems`, { actor: "gm", body: { id: sysB, name: "Mid" } });
  await call("POST", `/api/campaign/${cid}/systems`, { actor: "gm", body: { id: sysC, name: "Bravo Home", ownerFactionId: f2 } });
  await call("POST", `/api/campaign/${cid}/systems/${sysA}/links`, { actor: "gm", body: { toSystemId: sysB, type: "corridor" } });
  await call("POST", `/api/campaign/${cid}/systems/${sysB}/links`, { actor: "gm", body: { toSystemId: sysC, type: "corridor" } });
  await call("POST", `/api/campaign/${cid}/systems/${sysA}/planets`, { actor: "gm", body: { id: pA, name: "A I", type: "rocky", climate: "temperate" } });
  await call("POST", `/api/campaign/${cid}/systems/${sysC}/planets`, { actor: "gm", body: { id: pC, name: "C I", type: "rocky", climate: "temperate" } });
  const colA = await call("POST", `/api/campaign/${cid}/systems/${sysA}/planets/${pA}/colonize`, { actor: f1, body: { colonyType: "core" } });
  const colC = await call("POST", `/api/campaign/${cid}/systems/${sysC}/planets/${pC}/colonize`, { actor: f2, body: { colonyType: "core" } });
  assert(colA.json?.ok && colC.json?.ok, "both homes colonized");

  const view1 = (await call("GET", `/api/campaign/${cid}/view`, { actor: f1 })).json;
  assert(view1.viewer?.factionId === f1, "view is f1");
  assert((view1.visibleSystemIds || []).sort().join() === [sysA, sysB].sort().join(), `visible A,B got ${view1.visibleSystemIds}`);
  assert(!view1.systems.some((s) => s.id === sysC), "system C (2 hops) absent");
  assert(view1.systems.find((s) => s.id === sysA)?.knowledge === 0, "A is knowledge 0");
  assert(view1.systems.find((s) => s.id === sysB)?.knowledge === 1, "B is knowledge 1");
  assert(view1.systems.find((s) => s.id === sysB)?.planets == null, "hop-1 has no planets");
  assert(!view1.sectors, "no sectors on /view");
  assert(view1.self.economy.stocks["currency.metal"] != null, "self.economy has currency.metal");
  const othersHaveStocks = (view1.others || []).some((o) => o.stocks || o.economy || o.raceId);
  assert(!othersHaveStocks, "others have no stocks/raceId");
  assert(!JSON.stringify(view1.others).includes("currency"), "others blob has no currency keys");

  const raise1 = await call("POST", `/api/campaign/${cid}/systems/${sysA}/planets/${pA}/forces`, {
    actor: f1,
    body: { defId: "unit.militia", kind: "unit", count: 3, name: "Alpha Host", overrideCeiling: true },
  });
  const raise2 = await call("POST", `/api/campaign/${cid}/systems/${sysC}/planets/${pC}/forces`, {
    actor: f2,
    body: { defId: "unit.militia", kind: "unit", count: 1, name: "Bravo Host", overrideCeiling: true },
  });
  assert(raise1.json?.ok && raise2.json?.ok, `raised legions (${raise1.json?.error} / ${raise2.json?.error})`);
  const forceA = raise1.json.force;
  const forceB = raise2.json.force;

  const cross = await call("POST", `/api/campaign/${cid}/forces/${forceA.id}/engage`, {
    actor: f1,
    body: { forceBId: forceB.id },
  });
  assert(cross.status === 400 && cross.json?.error === "not_same_system", `cross-system engage rejected (${cross.status} ${cross.json?.error})`);

  const moved = await call("POST", `/api/campaign/${cid}/forces/${forceA.id}/move`, { actor: f1, body: { toSystemId: sysB } });
  assert(moved.json?.ok, `alpha moved to B (${moved.json?.error})`);
  const moved2 = await call("POST", `/api/campaign/${cid}/forces/${forceA.id}/move`, { actor: f1, body: { toSystemId: sysC } });
  assert(moved2.json?.ok, `alpha moved to C (${moved2.json?.error})`);

  const viewAtC = (await call("GET", `/api/campaign/${cid}/view`, { actor: f1 })).json;
  const spottedBefore = (viewAtC.forces || []).filter((f) => f.knowledge === "spotted");
  assert(spottedBefore.length >= 1, `foreign force spotted on C (${spottedBefore.length})`);
  for (const f of spottedBefore) {
    assert(f.composition == null && f.engineTier == null, `spotted force ${f.id} has no composition/engine`);
  }

  const fight = await call("POST", `/api/campaign/${cid}/forces/${forceA.id}/engage`, {
    actor: f1,
    body: { forceBId: forceB.id },
  });
  assert(fight.json?.ok, `same-system engage ok (${fight.json?.error} ${fight.json?.outcome})`);
  assert(fight.json.outcome === "win_a" || fight.json.occupied === true, `alpha should win/occupy (outcome=${fight.json.outcome} occupied=${fight.json.occupied})`);

  const state = (await call("GET", `/api/campaign/${cid}/state`, { actor: "gm" })).json;
  const sysCRow = (state.systems || []).find((s) => s.id === sysC);
  assert(sysCRow?.ownerFactionId === f1, `C owner is f1 after occupy (got ${sysCRow?.ownerFactionId})`);
  assert(Array.isArray(state.forces), "GM /state includes forces");
  assert(typeof state.tableRevision === "number", "GM /state includes tableRevision");

  const viewAfter = (await call("GET", `/api/campaign/${cid}/view`, { actor: f1 })).json;
  const spotted = (viewAfter.forces || []).filter((f) => f.knowledge === "spotted");
  for (const f of spotted) {
    assert(f.composition == null, `spotted force ${f.id} has no composition`);
  }

  const tax = await call("POST", `/api/campaign/${cid}/factions/${f1}/taxes`, {
    actor: f1,
    body: { slot: "tax.materia", tierId: "low" },
  });
  assert(tax.ok && tax.json.taxes["tax.materia"] === "low", `tax POST (${tax.status} ${JSON.stringify(tax.json)})`);

  const peg = await call("POST", `/api/campaign/${cid}/factions/${f1}/peg`, {
    actor: f1,
    body: { resourceId: "map.titan" },
  });
  assert(peg.ok && peg.json.pegResourceId === "map.titan", `player peg (${peg.status} ${JSON.stringify(peg.json)})`);

  const latest = (await call("GET", `/api/campaign/${cid}/view`, { actor: f1 })).json;
  const unchanged = await call("GET", `/api/campaign/${cid}/view?sinceRevision=${latest.tableRevision}`, { actor: f1 });
  assert(unchanged.json?.unchanged === true, `view sinceRevision unchanged (got ${JSON.stringify(unchanged.json)})`);

  console.log("\nPASS smokeViewerMvp");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
