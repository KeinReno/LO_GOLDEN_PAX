import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatForceOdHud, formatForceOdMeter, formatOdHud, formatOdMeter, ruCount } from "./playerUiTerms.ts";

describe("playerUiTerms", () => {
  it("picks Russian plural forms", () => {
    assert.equal(ruCount(1, "флот", "флота", "флотов"), "1 флот");
    assert.equal(ruCount(2, "флот", "флота", "флотов"), "2 флота");
    assert.equal(ruCount(7, "флот", "флота", "флотов"), "7 флотов");
    assert.equal(ruCount(11, "флот", "флота", "флотов"), "11 флотов");
    assert.equal(ruCount(22, "флот", "флота", "флотов"), "22 флота");
  });

  it("shows remaining, not spent", () => {
    assert.equal(formatOdMeter(0, 9), "ОД свободно 9/9");
    assert.equal(formatOdMeter(2, 9), "ОД свободно 7/9");
    assert.equal(formatForceOdMeter(0, 8), "ОД сил свободно 8/8");
  });

  it("hud meters stay one token + fraction", () => {
    assert.equal(formatOdHud(0, 9), "ОД 9/9");
    assert.equal(formatOdHud(2, 9), "ОД 7/9");
    assert.equal(formatForceOdHud(0, 8), "Сил 8/8");
  });
});
