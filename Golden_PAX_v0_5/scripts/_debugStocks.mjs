import { createSmokeClient } from "./smokeHttp.mjs";
const BASE = "http://localhost:4174";
const { call, seatPlayer } = createSmokeClient();

const tag = "dbg" + Date.now().toString(36);
const alpha = `d.a.${tag}`;
const bravo = `d.b.${tag}`;
const sysA = `sys.${alpha}`;
const sysB = `sys.${bravo}`;
const planetA = `${alpha}.home`;
const planetB = `${bravo}.home`;

const campaign = (await call("POST", "/api/campaign", { actor: "gm", body: { name: `dbg-${tag}` } })).json;
console.log("campaign", campaign.id);
await call("POST", `/api/campaign/${campaign.id}/factions`, { actor: "gm", body: { id: alpha, name: "Alpha", raceId: "race_human", colorHex: "#2266cc" } });
await call("POST", `/api/campaign/${campaign.id}/factions`, { actor: "gm", body: { id: bravo, name: "Bravo", raceId: "race_belator", colorHex: "#cc3322" } });
await seatPlayer(campaign.id, alpha);
await seatPlayer(campaign.id, bravo);
await call("POST", `/api/campaign/${campaign.id}/systems`, { actor: "gm", body: { id: sysA, name: "Alpha Home", ownerFactionId: alpha } });
await call("POST", `/api/campaign/${campaign.id}/systems`, { actor: "gm", body: { id: sysB, name: "Bravo Home", ownerFactionId: bravo } });
await call("POST", `/api/campaign/${campaign.id}/systems/${sysA}/planets`, { actor: "gm", body: { id: planetA, name: "Alpha I", type: "rocky", climate: "temperate" } });
await call("POST", `/api/campaign/${campaign.id}/systems/${sysB}/planets`, { actor: "gm", body: { id: planetB, name: "Bravo I", type: "rocky", climate: "temperate" } });

let state = (await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json;
console.log("alpha stocks after faction creation:", state.factions.find(f=>f.faction.id===alpha).economy.stocks);

const colA = await call("POST", `/api/campaign/${campaign.id}/systems/${sysA}/planets/${planetA}/colonize`, { actor: alpha, body: { colonyType: "core" } });
console.log("colonize alpha ok?", colA.json?.ok, colA.json?.error);
const colB = await call("POST", `/api/campaign/${campaign.id}/systems/${sysB}/planets/${planetB}/colonize`, { actor: bravo, body: { colonyType: "core" } });
console.log("colonize bravo ok?", colB.json?.ok, colB.json?.error);

state = (await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json;
console.log("alpha stocks after colonize:", state.factions.find(f=>f.faction.id===alpha).economy.stocks);

const yard = await call("POST", `/api/campaign/${campaign.id}/systems/${sysB}/planets/${planetB}/build`, { actor: bravo, body: { buildingId: "building.shipyard" } });
console.log("yard ok?", yard.json?.ok, yard.json?.error);

const raisedFleet = await call("POST", `/api/campaign/${campaign.id}/systems/${sysB}/planets/${planetB}/forces`, {
  actor: bravo,
  body: { defId: "ship.scout", kind: "ship", count: 1, name: "Bravo Scout", overrideCeiling: true },
});
console.log("raisedFleet ok?", raisedFleet.json?.ok, raisedFleet.json?.error);

state = (await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json;
console.log("alpha stocks before militia raise:", state.factions.find(f=>f.faction.id===alpha).economy.stocks);

const raisedLegion = await call("POST", `/api/campaign/${campaign.id}/systems/${sysA}/planets/${planetA}/forces`, {
  actor: alpha,
  body: { defId: "unit.militia", kind: "unit", count: 7, name: "Alpha Boarders", overrideCeiling: true },
});
console.log("raisedLegion:", raisedLegion.json);
