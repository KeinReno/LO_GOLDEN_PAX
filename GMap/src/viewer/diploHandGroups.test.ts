import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  groupByKey,
  groupByStar,
  worldsLine,
} from "./diploHandGroups.ts";

describe("diplo hand groups", () => {
  it("groups forces by star", () => {
    const groups = groupByStar([
      { id: "a", where: "Белатор" },
      { id: "b", where: "Тау" },
      { id: "c", where: "Белатор" },
      { id: "d" },
    ]);
    assert.equal(groups.length, 3);
    assert.deepEqual(
      groups.find((g) => g.star === "Белатор")?.items.map((i) => i.id),
      ["a", "c"],
    );
    assert.equal(groups.find((g) => g.star === "В пути")?.items[0].id, "d");
  });

  it("lists worlds under a star", () => {
    assert.equal(worldsLine([]), "нет колоний");
    assert.equal(worldsLine(["Альфа", "Бета"]), "миры · Альфа · Бета");
    assert.match(worldsLine(["A", "B", "C", "D"]), /4 миров/);
  });

  it("keeps tech direction order", () => {
    const grouped = groupByKey(
      [
        { id: "1", direction: "military" },
        { id: "2", direction: "industry" },
        { id: "3", direction: "military" },
      ],
      (t) => t.direction,
      ["industry", "military", "culture"],
    );
    assert.deepEqual(
      grouped.map((g) => g.key),
      ["industry", "military"],
    );
    assert.equal(grouped[1].items.length, 2);
  });
});
