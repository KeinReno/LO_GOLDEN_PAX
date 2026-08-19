import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  scoutRevealButtonLabel,
  systemSheetColonyHint,
  systemSheetMetaLine,
  systemSheetOpenButtonLabel,
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
      "2★ · 3 планеты · нейтрал",
    );
  });

  it("uses Russian planet plurals", () => {
    assert.equal(
      systemSheetMetaLine({ starCount: 1, planetCount: 1 }),
      "1★ · 1 планета · нейтрал",
    );
    assert.equal(
      systemSheetMetaLine({ starCount: 1, planetCount: 5 }),
      "1★ · 5 планет · нейтрал",
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

describe("systemSheetOpenButtonLabel", () => {
  it("labels owned systems as manage", () => {
    assert.equal(
      systemSheetOpenButtonLabel({
        owned: true,
        apCost: 1,
        formatCost: (n) => `${n} ОД`,
      }),
      "Управлять",
    );
  });

  it("keeps scout copy for foreign systems", () => {
    assert.equal(
      systemSheetOpenButtonLabel({
        owned: false,
        apCost: 1,
        formatCost: (n) => `${n} ОД`,
      }),
      "Разведка · открыть систему (1 ОД)",
    );
  });
});
