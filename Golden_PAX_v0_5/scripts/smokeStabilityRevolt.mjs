/**
 * Live HTTP check for STABILITY_AND_REVOLT_SPEC. NOT a GMap port.
 *
 * Drives stability down via natural decay (empty court), then confirms
 * Stage 1 (no rebels yet) → Stage 2 spawn → Stage 3 secession through
 * GET /campaign/:id/state.
 *
 * Usage: node server/serve.mjs  (other terminal) then:
 *        node scripts/smokeStabilityRevolt.mjs
 */
import { createSmokeClient, assert } from "./smokeHttp.mjs";

const { call, seatPlayer } = createSmokeClient();

function factionRow(state, fid) {
  return state.factions.find((row) => row.faction.id === fid);
}

function planetOf(state, planetId) {
  for (const sys of state.systems || []) {
    const p = (sys.planets || []).find((x) => x.id === planetId);
    if (p) return p;
  }
  return null;
}

async function main() {
  console.log("=== smoke stability / revolt ===\n");
  const tag = Date.now().toString(36);
  const fid = `stb.${tag}`;
  const sysId = `sys.${fid}`;
  const planetId = `${fid}.home`;

  const campaign = (await call("POST", "/api/campaign", { actor: "gm", body: { name: `smoke-stability-${tag}` } })).json;
  assert(campaign?.id, `campaign created (${campaign.id})`);
  const cid = campaign.id;

  const fa = await call("POST", `/api/campaign/${cid}/factions`, {
    actor: "gm",
    body: { id: fid, name: "Unstable", raceId: "race_human", colorHex: "#664422" },
  });
  assert(fa.ok, "faction created");
  await seatPlayer(cid, fid);

  await call("POST", `/api/campaign/${cid}/systems`, { actor: "gm", body: { id: sysId, name: "Home", ownerFactionId: fid } });
  await call("POST", `/api/campaign/${cid}/systems/${sysId}/planets`, {
    actor: "gm",
    body: { id: planetId, name: "Home I", type: "rocky", climate: "temperate" },
  });
  const col = await call("POST", `/api/campaign/${cid}/systems/${sysId}/planets/${planetId}/colonize`, {
    actor: fid,
    body: { colonyType: "core" },
  });
  assert(col.json?.ok === true, `colonized core (${col.json?.error})`);

  let state = (await call("GET", `/api/campaign/${cid}/state`, { actor: "gm" })).json;
  const start = factionRow(state, fid).stability;
  assert(start === 50, `seeded stability is 50, got ${start}`);
  const pop = planetOf(state, planetId).population;
  assert(pop > 0, `planet has population ${pop}`);

  const first = await call("POST", `/api/campaign/${cid}/turn`, { actor: "gm", body: {} });
  assert(first.ok, "turn 1 ok");
  state = (await call("GET", `/api/campaign/${cid}/state`, { actor: "gm" })).json;
  assert(factionRow(state, fid).stability === 49, `natural decay 50→49, got ${factionRow(state, fid).stability}`);

  let stage2 = null;
  for (let i = 0; i < 40; i++) {
    const t = await call("POST", `/api/campaign/${cid}/turn`, { actor: "gm", body: {} });
    assert(t.ok, `turn ${t.json.turn} ok`);
    const events = t.json.revolt || [];
    const spawn = events.find((e) => e.type === "rebel_spawn");
    state = (await call("GET", `/api/campaign/${cid}/state`, { actor: "gm" })).json;
    const v = factionRow(state, fid).stability;
    if (v < 40 && v >= 25) {
      assert((factionRow(state, fid).revolts || []).length === 0, `stage 1 at ${v}: no rebel spawn yet`);
    }
    if (spawn) {
      stage2 = { turn: t.json.turn, spawn, stability: v };
      break;
    }
  }
  assert(stage2, "stage 2 rebel_spawn fired");
  assert(stage2.stability < 25, `spawn at stability ${stage2.stability} (< 25)`);
  assert(stage2.spawn.planetId === planetId, "spawn on the colonized planet");
  state = (await call("GET", `/api/campaign/${cid}/state`, { actor: "gm" })).json;
  const revolts = factionRow(state, fid).revolts || [];
  assert(revolts.length === 1, `GET state lists the occupying revolt (${revolts.length})`);
  assert(planetOf(state, planetId).ownerFactionId === fid, "population/owner unchanged at stage 2");
  assert(planetOf(state, planetId).population === pop, `population not spent (${planetOf(state, planetId).population})`);

  let secession = null;
  for (let i = 0; i < 6; i++) {
    const t = await call("POST", `/api/campaign/${cid}/turn`, { actor: "gm", body: {} });
    secession = (t.json.revolt || []).find((e) => e.type === "secession");
    if (secession) break;
  }
  assert(secession, "stage 3 secession fired");
  state = (await call("GET", `/api/campaign/${cid}/state`, { actor: "gm" })).json;
  const born = state.factions.find((row) => row.faction.id === secession.newFactionId);
  assert(born, `new faction queryable via GET state (${secession.newFactionId})`);
  assert(born.faction.isNpc === true, "breakaway is a normal NPC faction");
  assert(planetOf(state, planetId).ownerFactionId === secession.newFactionId, "planet ownership transferred");
  const sys = state.systems.find((s) => s.id === sysId);
  assert(sys.ownerFactionId === secession.newFactionId, "system ownership transferred (sole planet)");
  assert(!factionRow(state, fid) || (factionRow(state, fid).revolts || []).length === 0, "source revolt row cleared");

  console.log("\nall stability/revolt smoke checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
