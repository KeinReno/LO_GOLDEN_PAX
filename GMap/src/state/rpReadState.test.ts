import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sumGmHqUnread } from "./rpReadState.ts";

describe("sumGmHqUnread", () => {
  it("counts HQ marks and skips campaign scenes", () => {
    const n = sumGmHqUnread([
      {
        episodes: [
          {
            id: "hq_f1",
            kind: "hq",
            rail: { marks: [{ id: "a", at: "2026-08-19T00:00:00.000Z" }] },
          },
          {
            id: "ep_scene",
            kind: "scene",
            rail: { marks: [{ id: "b", at: "2026-08-19T00:00:00.000Z" }] },
          },
        ],
      },
    ]);
    assert.equal(n, 1);
  });

  it("ignores master-authored HQ noise", () => {
    const n = sumGmHqUnread([
      {
        episodes: [
          {
            id: "hq_f1",
            kind: "hq",
            rail: {
              marks: [
                {
                  id: "m",
                  at: "2026-08-19T00:00:00.000Z",
                  fromMaster: true,
                },
              ],
            },
          },
        ],
      },
    ]);
    assert.equal(n, 0);
  });
});
