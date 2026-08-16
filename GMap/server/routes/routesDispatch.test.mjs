/**
 * Verify every tryHandle* route module claims its paths and rejects others.
 * Also spins createApiMiddleware and probes representative URLs in-process.
 */
import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { createApiMiddleware } from "../api.mjs";

const modules = [
  ["court", "tryHandleCourtRoutes", "/api/court/proposals", "/api/market/book"],
  ["economyTech", "tryHandleEconomyTechRoutes", "/api/economy/research", "/api/economy/build-queue"],
  ["diploEconomic", "tryHandleEconomicTrackRoutes", "/api/diplo/economic/barter", "/api/diplo/offers"],
  ["diplo", "tryHandleDiploRoutes", "/api/diplo/offers", "/api/diplo/economic/barter"],
  ["economyMisc", "tryHandleEconomyMiscRoutes", "/api/economy/flows", "/api/economy/research"],
  ["market", "tryHandleMarketRoutes", "/api/market/book", "/api/court/proposals"],
  ["engagements", "tryHandleEngagementRoutes", "/api/engagements", "/api/narrative/paint"],
  ["narrative", "tryHandleNarrativeRoutes", "/api/narrative/paint", "/api/rp"],
  ["rp", "tryHandleRpRoutes", "/api/rp", "/api/ledger"],
  ["fogIntel", "tryHandleFogIntelRoutes", "/api/fog", "/api/ledger"],
  ["forces", "tryHandleForcesRoutes", "/api/forces/raise", "/api/planet/action"],
  ["intents", "tryHandleIntentRoutes", "/api/intents", "/api/orders"],
  ["turnOps", "tryHandleTurnOpsRoutes", "/api/turn/health", "/api/auth/info"],
  ["playersShare", "tryHandlePlayersShareRoutes", "/api/players/share", "/api/factions"],
  ["playActions", "tryHandlePlayActionRoutes", "/api/planet/action", "/api/forces/raise"],
  ["gm", "tryHandleGmRoutes", "/api/gm/balance/snapshot", "/api/table"],
  ["session", "tryHandleSessionRoutes", "/api/table", "/api/gm/balance/snapshot"],
];

const stubCtx = {
  sendJson(_res, _code, _data) {},
  async readBody() {
    return {};
  },
  requireMaster() {
    return false;
  },
  authenticatePlayerFaction() {
    return { ok: false, error: "stub" };
  },
  authenticateEconomyMutation() {
    return { ok: false, error: "stub" };
  },
  requireMasterOrFactionAuth() {
    return { ok: false, error: "stub" };
  },
  playerSessionPayload() {
    return {};
  },
  playerEconomy() {
    return {};
  },
  playerApBudget() {
    return { apMax: 0, forceApMax: 0 };
  },
  filterWorldForFaction() {
    return {};
  },
  finalizeSubmittedIntent() {
    return { ok: true };
  },
  markIntentApplied() {
    return null;
  },
  bindAuthedFaction() {
    return { ok: false, error: "stub" };
  },
  maskEngagementForFaction(e) {
    return e;
  },
  getVisibleSystemIds() {
    return [];
  },
  buildOpsHealthResponse() {
    return { ok: true };
  },
};

for (const [file, exportName, claimPath, ignorePath] of modules) {
  test(`${file}: claims ${claimPath}, ignores ${ignorePath}`, async () => {
    const mod = await import(`../routes/${file}.mjs`);
    const fn = mod[exportName];
    assert.equal(typeof fn, "function", exportName);

    const method =
      claimPath === "/api/engagements" ||
      claimPath === "/api/rp" ||
      claimPath === "/api/fog" ||
      claimPath === "/api/table" ||
      claimPath === "/api/intents" ||
      claimPath === "/api/players/share" ||
      claimPath === "/api/turn/health" ||
      claimPath === "/api/gm/balance/snapshot" ||
      claimPath === "/api/market/book" ||
      claimPath === "/api/economy/flows" ||
      claimPath === "/api/court/proposals"
        ? "GET"
        : "POST";

    const claimUrl = new URL(`http://localhost${claimPath}`);
    const claimHandled = await fn(
      { method, headers: {} },
      {},
      claimUrl,
      { ...stubCtx },
    );
    assert.equal(claimHandled, true, `${exportName} should handle ${claimPath}`);

    const ignoreUrl = new URL(`http://localhost${ignorePath}`);
    const ignored = await fn(
      { method: "POST", headers: {} },
      {},
      ignoreUrl,
      {
        ...stubCtx,
        sendJson() {
          assert.fail(`${exportName} must not respond to ${ignorePath}`);
        },
      },
    );
    assert.equal(ignored, false, `${exportName} must ignore ${ignorePath}`);
  });
}

test("in-process middleware answers /api/health and unknown 404", async () => {
  const mw = createApiMiddleware();
  const server = http.createServer((req, res) => {
    mw(req, res, () => {
      res.statusCode = 404;
      res.end("no");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();

  const get = (path) =>
    new Promise((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}${path}`, (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => resolve({ status: res.statusCode, body }));
        })
        .on("error", reject);
    });

  const health = await get("/api/health");
  assert.equal(health.status, 200);
  assert.match(health.body, /"ok"\s*:\s*true/);

  const unknown = await get("/api/this-route-does-not-exist");
  assert.equal(unknown.status, 404);

  const court = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/court/proposals",
        method: "GET",
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(court.status, 401);

  const techMarket = await get("/api/economy/tech-market");
  assert.equal(techMarket.status, 200);
  assert.match(techMarket.body, /listings/);

  const resourceIndex = await get("/api/economy/resource-index");
  assert.equal(resourceIndex.status, 200);

  await new Promise((r) => server.close(r));
});
