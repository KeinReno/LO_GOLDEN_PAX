import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReplyBody,
  canPromoteToCourt,
  findQuotedSource,
  gmWhisperPlan,
  isAsideVisibility,
  isRpSendHotkey,
  parseReplyBody,
  snippetOf,
  speakAsFromName,
  speakLabelOf,
  uniqueSceneNames,
} from "./rpSpeakAs.ts";

describe("speakAsFromName", () => {
  const npcs = [{ id: "n1", name: "Архонт Ваэл" }];

  it("maps reserved speakers", () => {
    assert.equal(speakAsFromName("Мастер", npcs).kind, "master");
    assert.equal(speakAsFromName("Рассказчик", npcs).kind, "narrator");
    assert.equal(speakAsFromName("???", npcs).kind, "anonymous");
  });

  it("matches roster NPCs", () => {
    const s = speakAsFromName("Архонт Ваэл", npcs);
    assert.equal(s.kind, "npc");
    if (s.kind === "npc") assert.equal(s.npc.id, "n1");
  });

  it("falls back to alias", () => {
    const s = speakAsFromName("Гость из тумана", npcs);
    assert.equal(s.kind, "alias");
    if (s.kind === "alias") assert.equal(s.name, "Гость из тумана");
  });
});

describe("speakLabelOf / uniqueSceneNames", () => {
  it("labels alias", () => {
    assert.equal(speakLabelOf({ kind: "alias", name: "Лира" }), "Лира");
  });

  it("dedupes scene names", () => {
    const names = uniqueSceneNames([
      { authorName: "Лира", type: "ic" },
      { authorName: "лира", type: "action" },
      { authorName: "Мастер", type: "ic" },
      { authorName: "Кубик", type: "system" },
    ]);
    assert.deepEqual(names, ["Лира", "Мастер"]);
  });
});

describe("reply / whisper helpers", () => {
  it("round-trips quote body", () => {
    const body = buildReplyBody(
      { id: "m1", author: "Лира", snippet: "стой" },
      "уже иду",
    );
    assert.equal(body, "» Лира — «стой»\n\nуже иду");
    const parsed = parseReplyBody(body);
    assert.equal(parsed.quote, "Лира — «стой»");
    assert.equal(parsed.text, "уже иду");
  });

  it("snippets inner text, not the quote prefix", () => {
    const nested = "» Лира — «длинная фраза»\n\nкоротко";
    assert.equal(snippetOf(nested), "коротко");
  });

  it("classifies aside vs channel default", () => {
    assert.equal(isAsideVisibility("whisper", "gm_player:fac_1"), true);
    assert.equal(isAsideVisibility("gm_only", "all"), true);
    assert.equal(isAsideVisibility("gm_player:fac_1", "gm_player:fac_1"), false);
    assert.equal(isAsideVisibility("gm_player:fac_1", "all"), true);
    assert.equal(isAsideVisibility("all", "all"), false);
    assert.equal(isAsideVisibility("gm_player:fac_1"), false);
    assert.equal(
      gmWhisperPlan({ episodeVis: "gm_player:fac_1", channelFactionId: "fac_1" })
        .visibility,
      "whisper",
    );
    assert.equal(
      gmWhisperPlan({ episodeVis: "all", replyFactionId: "fac_1" }).visibility,
      "gm_player:fac_1",
    );
    assert.equal(gmWhisperPlan({ episodeVis: "all" }).visibility, "gm_only");
    assert.equal(canPromoteToCourt("Лира"), true);
    assert.equal(canPromoteToCourt("Мастер"), false);
    assert.equal(canPromoteToCourt("???"), false);
  });

  it("finds quoted source", () => {
    const src = findQuotedSource(
      [
        { authorName: "Лира", body: "стой у ворот" },
        { authorName: "Мастер", body: buildReplyBody({ id: "1", author: "Лира", snippet: snippetOf("стой у ворот") }, "уже") },
      ],
      "Лира — «стой у ворот»",
    );
    assert.equal(src?.authorName, "Лира");
  });

  it("Enter sends, Shift+Enter does not", () => {
    assert.equal(isRpSendHotkey({ key: "Enter", shiftKey: false }), true);
    assert.equal(isRpSendHotkey({ key: "Enter", shiftKey: true }), false);
    assert.equal(
      isRpSendHotkey({
        key: "Enter",
        shiftKey: false,
        nativeEvent: { isComposing: true },
      }),
      false,
    );
  });
});
