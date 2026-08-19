import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPhoneViewport } from "./isPhoneViewport.ts";

describe("isPhoneViewport", () => {
  it("portrait Pixel", () => {
    assert.equal(isPhoneViewport(412, 915), true);
  });

  it("compact Android", () => {
    assert.equal(isPhoneViewport(360, 800), true);
  });

  it("landscape Pixel stays phone", () => {
    assert.equal(isPhoneViewport(915, 412), true);
  });

  it("desktop wide is not phone", () => {
    assert.equal(isPhoneViewport(1280, 800), false);
    assert.equal(isPhoneViewport(1600, 900), false);
  });

  it("windowed desktop 1100×700 is not phone", () => {
    assert.equal(isPhoneViewport(1100, 700), false);
  });
});
