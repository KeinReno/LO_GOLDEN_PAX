import test from "node:test";
import assert from "node:assert/strict";
import { tryHandleEconomyTechRoutes } from "./economyTech.mjs";

const noopCtx = {
  sendJson() {},
  async readBody() {
    return {};
  },
  requireMaster() {
    return false;
  },
  authenticateEconomyMutation() {
    return { ok: false, error: "no" };
  },
  playerEconomy() {
    return {};
  },
};

test("tryHandleEconomyTechRoutes ignores build-queue", async () => {
  const url = new URL("http://localhost/api/economy/build-queue");
  const handled = await tryHandleEconomyTechRoutes(
    { method: "POST" },
    {},
    url,
    {
      ...noopCtx,
      sendJson() {
        assert.fail("should not respond");
      },
    },
  );
  assert.equal(handled, false);
});

test("tryHandleEconomyTechRoutes claims research", async () => {
  const url = new URL("http://localhost/api/economy/research");
  let status = 0;
  const handled = await tryHandleEconomyTechRoutes(
    { method: "POST" },
    {},
    url,
    {
      ...noopCtx,
      sendJson(_res, code) {
        status = code;
      },
      async readBody() {
        return { techId: "x", factionId: "f" };
      },
    },
  );
  assert.equal(handled, true);
  // 404 if no board; 401 if board exists and auth fails
  assert.ok(status === 404 || status === 401);
});
