import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickDiploPartnerId } from "./diploPartnerPick.ts";

describe("pickDiploPartnerId", () => {
  const known = ["a", "b", "c"];

  it("jumps to the faction of a focused incoming offer", () => {
    assert.equal(
      pickDiploPartnerId({
        knownIds: known,
        incoming: [
          { id: "o1", fromFactionId: "b" },
          { id: "o2", fromFactionId: "c" },
        ],
        focusOfferId: "o2",
        currentId: "a",
      }),
      "c",
    );
  });

  it("keeps the current partner when no focus and they are still known", () => {
    assert.equal(
      pickDiploPartnerId({
        knownIds: known,
        incoming: [{ id: "o1", fromFactionId: "b" }],
        currentId: "a",
      }),
      "a",
    );
  });

  it("falls back to first incoming, then first known", () => {
    assert.equal(
      pickDiploPartnerId({
        knownIds: known,
        incoming: [{ id: "o1", fromFactionId: "b" }],
        currentId: "gone",
      }),
      "b",
    );
    assert.equal(
      pickDiploPartnerId({
        knownIds: known,
        incoming: [],
        currentId: "",
      }),
      "a",
    );
  });
});
