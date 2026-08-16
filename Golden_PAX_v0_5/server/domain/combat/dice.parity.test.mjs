/**
 * rollDie/rollDice use crypto randomness, so there's nothing to diff
 * exactly — behavior-tested (bounds) in dice.test.mjs instead. rollSuccess
 * and formatDiceMessage are deterministic given their inputs and exported
 * in GMap, so those get a true cross-repo parity check here.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { rollSuccess, formatDiceMessage } from "./dice.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/dice.mjs");

describe("rollSuccess / formatDiceMessage parity with GMap", () => {
  it("matches across representative cases", async () => {
    const { rollSuccess: oldSuccess, formatDiceMessage: oldFormat } = await import(oldModulePath);

    const successCases = [
      [{ threshold: 10 }, [4, 5]],
      [{ threshold: 10 }, [4, 3]],
      [{}, [1, 2, 3]],
    ];
    for (const [spec, rolls] of successCases) {
      expect(rollSuccess(spec, rolls)).toBe(oldSuccess(spec, rolls));
    }

    const formatCases = [
      [{ count: 2, sides: 6, label: "Атака" }, [4, 5], true, "Флот A"],
      [{ sides: 20 }, [17], null, null],
      [{ count: 3, sides: 6 }, [1, 2, 3], false, "GM"],
    ];
    for (const [spec, rolls, success, actor] of formatCases) {
      expect(formatDiceMessage(spec, rolls, success, actor)).toBe(oldFormat(spec, rolls, success, actor));
    }
  });
});
