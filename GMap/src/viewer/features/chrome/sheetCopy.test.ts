import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  scoutRevealButtonLabel,
  systemSheetColonyHint,
  systemSheetMetaLine,
} from "./sheetCopy.ts";

describe("systemSheetMetaLine", () => {
  it("names corridor and owner", () => {
    assert.equal(
      systemSheetMetaLine({
        kind: "corridor",
        starCount: 2,
        planetCount: 1,
        ownerName: "Белатор",
      }),
      "Коридор · Белатор",
    );
  });

  it("falls back to neutral stars", () => {
    assert.equal(
      systemSheetMetaLine({ starCount: 2, planetCount: 3 }),
      "2★ · 3 планет · нейтрал",
    );
  });
});

describe("systemSheetColonyHint", () => {
  it("joins resources", () => {
    assert.equal(
      systemSheetColonyHint(2, ["железо", "еда"]),
      "Колоний: 2 · ресурсы: железо, еда",
    );
  });

  it("dashes empty resources", () => {
    assert.equal(systemSheetColonyHint(0, []), "Колоний: 0 · ресурсы: —");
  });
});

describe("scoutRevealButtonLabel", () => {
  it("omits zero AP", () => {
    assert.equal(scoutRevealButtonLabel(0, (n) => `${n} ОД`), "Разведка · открыть систему");
  });

  it("appends cost", () => {
    assert.equal(
      scoutRevealButtonLabel(1, (n) => `${n} ОД`),
      "Разведка · открыть систему (1 ОД)",
    );
  });
});
