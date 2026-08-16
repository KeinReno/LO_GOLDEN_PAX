import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatFactionsLoadError,
  missingLoginCredsMsg,
  parseAutoLoginQuery,
  stripLoginQuery,
} from "./viewerAuthParse.ts";

describe("parseAutoLoginQuery", () => {
  it("reads f/p", () => {
    const r = parseAutoLoginQuery("f=north&p=pin&auto=1");
    assert.deepEqual(r, {
      factionId: "north",
      password: "pin",
      auto: true,
    });
  });

  it("auto=0 means fill form only", () => {
    const r = parseAutoLoginQuery("?faction=x&password=y&auto=0");
    assert.equal(r?.auto, false);
  });

  it("null without creds", () => {
    assert.equal(parseAutoLoginQuery(""), null);
  });
});

describe("stripLoginQuery", () => {
  it("drops preview params", () => {
    const out = stripLoginQuery(
      "http://localhost:4173/view?f=a&p=b&auto=1&keep=1",
    );
    assert.equal(out, "/view?keep=1");
  });
});

describe("formatFactionsLoadError", () => {
  it("maps unpublished", () => {
    assert.match(
      formatFactionsLoadError("карта не опубликована"),
      /Опубликовать/,
    );
  });
});

describe("missingLoginCredsMsg", () => {
  it("asks for faction and pin", () => {
    assert.match(missingLoginCredsMsg(), /державу/);
  });
});
