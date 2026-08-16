import test from "node:test";
import assert from "node:assert/strict";
import { tryHandleEconomicTrackRoutes } from "./diploEconomic.mjs";

test("tryHandleEconomicTrackRoutes ignores unrelated paths", async () => {
  const url = new URL("http://localhost/api/diplo/offers");
  const handled = await tryHandleEconomicTrackRoutes(
    { method: "POST" },
    {},
    url,
    {
      sendJson() {
        assert.fail("should not respond");
      },
      async readBody() {
        return {};
      },
      requireMaster() {
        return false;
      },
    },
  );
  assert.equal(handled, false);
});

test("tryHandleEconomicTrackRoutes claims diplo economic barter", async () => {
  const url = new URL("http://localhost/api/diplo/economic/barter");
  let status = 0;
  const handled = await tryHandleEconomicTrackRoutes(
    { method: "POST", headers: {} },
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
    },
  );
  assert.equal(handled, true);
  assert.ok(status === 404 || status === 401);
});
