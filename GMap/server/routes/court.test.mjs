import test from "node:test";
import assert from "node:assert/strict";
import { tryHandleCourtRoutes } from "./court.mjs";

test("tryHandleCourtRoutes ignores non-court paths", async () => {
  const url = new URL("http://localhost/api/market/book");
  const handled = await tryHandleCourtRoutes(
    { method: "POST" },
    {},
    url,
    {
      sendJson() {
        assert.fail("should not respond");
      },
      async readBody() {
        assert.fail("should not read");
      },
      requireMaster() {
        return false;
      },
      authenticatePlayerFaction() {
        return { ok: false };
      },
      playerSessionPayload() {
        return {};
      },
    },
  );
  assert.equal(handled, false);
});

test("tryHandleCourtRoutes claims /api/court/*", async () => {
  const url = new URL("http://localhost/api/court/proposals");
  let status = 0;
  const handled = await tryHandleCourtRoutes(
    { method: "GET" },
    {},
    url,
    {
      sendJson(_res, code) {
        status = code;
      },
      async readBody() {
        return {};
      },
      requireMaster() {
        return false;
      },
      authenticatePlayerFaction() {
        return { ok: false };
      },
      playerSessionPayload() {
        return {};
      },
    },
  );
  assert.equal(handled, true);
  assert.equal(status, 401);
});
