/**
 * Live HTTP probe across route modules. Requires server on GMAP_PORT (default 5173).
 *   node scripts/probeRoutesLive.mjs
 */
import http from "node:http";

const PORT = Number(process.env.GMAP_PORT || 5173);
const MASTER = process.env.GMAP_MASTER_TOKEN || "master2142";

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": MASTER,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: data.slice(0, 200) }),
        );
      },
    );
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

const probes = [
  ["GET", "/api/health", null, (s) => s === 200],
  ["GET", "/api/content", null, (s) => s === 200],
  ["GET", "/api/economy/resource-index", null, (s) => s === 200],
  ["GET", "/api/economy/tech-market", null, (s) => s === 200],
  ["GET", "/api/market/rates", null, (s) => s === 200],
  ["GET", "/api/table", null, (s) => s === 200 || s === 404],
  ["GET", "/api/ledger", null, (s) => s === 200],
  ["GET", "/api/fog", null, (s) => s === 200],
  ["GET", "/api/engagements", null, (s) => s === 200],
  ["GET", "/api/court/proposals", null, (s) => s === 200],
  ["GET", "/api/turn/health", null, (s) => s === 200],
  ["GET", "/api/ops/health", null, (s) => s === 200],
  ["GET", "/api/auth/info", null, (s) => s === 200],
  ["GET", "/api/factions", null, (s) => s === 200],
  ["GET", "/api/gm/balance/snapshot", null, (s) => s === 200],
  ["GET", "/api/gm/peg-multipliers", null, (s) => s === 200],
  ["GET", "/api/players/share", null, (s) => s === 200],
  ["GET", "/api/intents", null, (s) => s === 200],
  ["GET", "/api/rp", null, (s) => s === 200],
  ["GET", "/api/map-version", null, (s) => s === 200],
  // must not 500 — auth/validation errors OK
  ["POST", "/api/economy/research", {}, (s) => s !== 500 && s !== 404],
  ["POST", "/api/forces/raise", {}, (s) => s !== 500 && s !== 404],
  ["POST", "/api/planet/action", {}, (s) => s !== 500 && s !== 404],
  ["POST", "/api/diplo/economic/barter", {}, (s) => s !== 500 && s !== 404],
  ["POST", "/api/diplo/offers", { action: "list" }, (s) => s !== 500 && s !== 404],
  ["POST", "/api/narrative/paint", {}, (s) => s !== 500 && s !== 404],
  ["GET", "/api/this-does-not-exist", null, (s) => s === 404],
];

let fail = 0;
for (const [method, path, body, ok] of probes) {
  try {
    const res = await req(method, path, body);
    const pass = ok(res.status);
    console.log(
      `${pass ? "PASS" : "FAIL"} ${method} ${path} → ${res.status}${pass ? "" : " " + res.body}`,
    );
    if (!pass) fail += 1;
  } catch (e) {
    console.log(`FAIL ${method} ${path} → ${e.message}`);
    fail += 1;
  }
}
console.log(fail ? `FAILED ${fail}` : "ALL PROBES OK");
process.exit(fail ? 1 : 0);
