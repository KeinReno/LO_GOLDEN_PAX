import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boardRefreshCue,
  countRpUnread,
  engagementPollMs,
  mapVersionStamp,
  pickRpHomeEpisode,
  rpSceneIsOpen,
} from "./viewerLivePolls.ts";

describe("viewerLivePolls", () => {
  it("stamps turn and revision", () => {
    assert.equal(mapVersionStamp({ turn: 4, tableRevision: 12 }), "4|12");
    assert.equal(mapVersionStamp({}), "|");
  });

  it("board cue", () => {
    assert.match(boardRefreshCue(3, 9), /ход 3/);
    assert.match(boardRefreshCue(3, 9), /rev 9/);
  });

  it("faster poll while card table open", () => {
    assert.equal(engagementPollMs(true), 1600);
    assert.equal(engagementPollMs(false), 8000);
  });

  it("RP scene is open via room or float", () => {
    assert.equal(rpSceneIsOpen("rp", false), true);
    assert.equal(rpSceneIsOpen("map", true), true);
    assert.equal(rpSceneIsOpen("map", false), false);
  });

  it("unread vs seen watermark", () => {
    const msgs = [{ at: "a" }, { at: "c" }, { at: "b" }];
    assert.equal(countRpUnread(msgs, "b"), 1);
    assert.equal(countRpUnread(msgs, null), 3);
    assert.equal(countRpUnread([], null), 0);
  });

  it("caps unseen backlog at 9", () => {
    const msgs = Array.from({ length: 20 }, (_, i) => ({ at: String(i) }));
    assert.equal(countRpUnread(msgs, ""), 9);
  });

  it("picks home then hq then open episode", () => {
    assert.deepEqual(
      pickRpHomeEpisode({
        home: { chapterId: "c", episodeId: "e" },
      }),
      { chapterId: "c", episodeId: "e" },
    );
    assert.deepEqual(
      pickRpHomeEpisode({
        chapters: [
          {
            id: "ch",
            episodes: [
              { id: "ooc", kind: "ooc", status: "open" },
              { id: "hq1", kind: "hq", status: "open" },
            ],
          },
        ],
      }),
      { chapterId: "ch", episodeId: "hq1" },
    );
  });
});
