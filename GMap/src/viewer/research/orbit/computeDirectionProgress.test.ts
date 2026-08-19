import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeDirectionProgress } from "./computeDirectionProgress.ts";

function techs(n: number, prefix = "t"): { id: string }[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}.${i}` }));
}

describe("computeDirectionProgress", () => {
  it("is dormant at 0 researched, regardless of total", () => {
    const [row] = computeDirectionProgress({ a: techs(280) }, []);
    assert.equal(row.phase, "dormant");
    assert.equal(row.researched, 0);
    assert.equal(row.total, 280);
  });

  it("is dormant for a direction with 0 real content, even if somehow marked unlocked", () => {
    const [row] = computeDirectionProgress({ a: [] }, ["ghost.tech"]);
    assert.equal(row.phase, "dormant");
    assert.equal(row.total, 0);
    assert.equal(row.ratio, 0);
  });

  it("moves to awakening just above 0%, stays below the growing threshold", () => {
    const list = techs(100);
    const [row] = computeDirectionProgress({ a: list }, [list[0].id]);
    assert.equal(row.researched, 1);
    assert.equal(row.phase, "awakening");
  });

  it("crosses into growing at the 15% boundary", () => {
    const list = techs(100);
    const just_under = computeDirectionProgress(
      { a: list },
      list.slice(0, 14).map((t) => t.id),
    )[0];
    assert.equal(just_under.phase, "awakening");

    const at_boundary = computeDirectionProgress(
      { a: list },
      list.slice(0, 15).map((t) => t.id),
    )[0];
    assert.equal(at_boundary.phase, "growing");
  });

  it("crosses into mastered at the 70% boundary", () => {
    const list = techs(100);
    const just_under = computeDirectionProgress(
      { a: list },
      list.slice(0, 69).map((t) => t.id),
    )[0];
    assert.equal(just_under.phase, "growing");

    const at_boundary = computeDirectionProgress(
      { a: list },
      list.slice(0, 70).map((t) => t.id),
    )[0];
    assert.equal(at_boundary.phase, "mastered");
  });

  it("is complete only at exactly 100%, not 99%", () => {
    const list = techs(10);
    const almost = computeDirectionProgress(
      { a: list },
      list.slice(0, 9).map((t) => t.id),
    )[0];
    assert.equal(almost.phase, "mastered");
    assert.equal(almost.researched, 9);

    const done = computeDirectionProgress(
      { a: list },
      list.map((t) => t.id),
    )[0];
    assert.equal(done.phase, "complete");
  });

  it("a 1-tech direction only ever sits in dormant or complete, never growing/mastered", () => {
    const one = techs(1);
    const empty = computeDirectionProgress({ a: one }, [])[0];
    assert.equal(empty.phase, "dormant");
    const full = computeDirectionProgress({ a: one }, [one[0].id])[0];
    assert.equal(full.phase, "complete");
  });

  it("computes each direction independently — one sector's phase never leaks into another's", () => {
    const rows = computeDirectionProgress(
      {
        industry: techs(280, "industry"),
        military: techs(58, "military"),
        culture: techs(60, "culture"),
      },
      [
        ...techs(210, "industry").map((t) => t.id), // 75% -> mastered
        // military: 0 -> dormant
        ...techs(3, "culture").map((t) => t.id), // 5% -> awakening
      ],
    );
    const byDir = Object.fromEntries(rows.map((r) => [r.direction, r]));
    assert.equal(byDir.industry.phase, "mastered");
    assert.equal(byDir.military.phase, "dormant");
    assert.equal(byDir.culture.phase, "awakening");
  });

  it("accepts a plain object as well as a Map for byDirection", () => {
    const list = techs(4);
    const fromObject = computeDirectionProgress({ a: list }, [list[0].id]);
    const fromMap = computeDirectionProgress(new Map([["a", list]]), [list[0].id]);
    assert.deepEqual(fromObject, fromMap);
  });

  it("accepts unlockedIds as an array or a Set with identical results", () => {
    const list = techs(4);
    const ids = [list[0].id, list[1].id];
    const fromArray = computeDirectionProgress({ a: list }, ids);
    const fromSet = computeDirectionProgress({ a: list }, new Set(ids));
    assert.deepEqual(fromArray, fromSet);
  });
});
