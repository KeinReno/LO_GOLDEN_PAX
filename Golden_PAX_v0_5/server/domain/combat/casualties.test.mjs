import { describe, it, expect } from "vitest";
import { removeDestroyedGroups } from "./casualties.mjs";

describe("removeDestroyedGroups", () => {
  it("drops zero-count entries and keeps everything else", () => {
    const groups = [{ id: "a", count: 5 }, { id: "b", count: 0 }, { id: "c", count: 1 }];
    expect(removeDestroyedGroups(groups)).toEqual([{ id: "a", count: 5 }, { id: "c", count: 1 }]);
  });

  it("an all-destroyed list becomes empty", () => {
    expect(removeDestroyedGroups([{ count: 0 }, { count: 0 }])).toEqual([]);
  });

  it("treats a missing count as destroyed", () => {
    expect(removeDestroyedGroups([{}, { count: 3 }])).toEqual([{ count: 3 }]);
  });
});
