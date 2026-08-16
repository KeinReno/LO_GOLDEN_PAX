/**
 * True cross-repo parity for GMap functions that are exported + pure:
 * `instantPegCredit` (fxExchange.mjs) and `strategicResourceIdSet`
 * (flowEngine.mjs) / `resolveTreasuryPeg` (economyTick.mjs).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { instantPegCredit, fxExchangeCfg, computeFxExchangeState, globalPegReserves } from "./fxExchange.mjs";
import { strategicResourceIdSet, resolveTreasuryPeg } from "./currencyPeg.mjs";
import { getContent } from "../../contentLoader.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldFxPath = path.resolve(__dirname, "../../../../GMap/server/fxExchange.mjs");
const oldFlowPath = path.resolve(__dirname, "../../../../GMap/server/flowEngine.mjs");
const oldTickPath = path.resolve(__dirname, "../../../../GMap/server/economyTick.mjs");

describe("instantPegCredit parity with GMap", () => {
  it("matches across a grid of reserves/extraction, including zeros", async () => {
    const { instantPegCredit: oldFn } = await import(oldFxPath);
    const cfg = fxExchangeCfg(getContent(["core"]));
    for (const reserves of [0, 1, 16, 16000]) {
      for (const extraction of [0, 1, 4, 40]) {
        expect(instantPegCredit(reserves, extraction, cfg)).toBe(oldFn(reserves, extraction, cfg));
      }
    }
  });
});

describe("strategicResourceIdSet parity with GMap", () => {
  it("matches on real core content", async () => {
    const { strategicResourceIdSet: oldFn } = await import(oldFlowPath);
    const content = getContent(["core"]);
    expect(strategicResourceIdSet(content)).toEqual(oldFn(content));
  });
});

describe("resolveTreasuryPeg parity with GMap", () => {
  it("matches faction-field then bindings fallback", async () => {
    const { resolveTreasuryPeg: oldFn } = await import(oldTickPath);
    const content = getContent(["core"]);
    expect(resolveTreasuryPeg({ id: "nope" }, content)).toBe(oldFn({ id: "nope" }, content));
    expect(resolveTreasuryPeg({ id: "faction_belator" }, content)).toBe(oldFn({ id: "faction_belator" }, content));
    expect(resolveTreasuryPeg({ id: "x", treasuryPeg: "map.titan" }, content)).toBe(
      oldFn({ id: "x", treasuryPeg: "map.titan" }, content),
    );
  });
});

describe("computeFxExchangeState (behavior from GMap refreshFxExchange, no file I/O)", () => {
  it("EMA-smooths an existing credit and floors the result", () => {
    const content = getContent(["core"]);
    const cfg = fxExchangeCfg(content);
    const ledger = { factions: { fA: { stocks: { "map.solari": 100 } } } };
    const extractionByPeg = { "map.solari": 10 };
    const instant = instantPegCredit(100, 10, cfg);
    const prev = 8;
    const state = computeFxExchangeState(content, ledger, extractionByPeg, { credits: { "map.solari": prev } }, 3);
    const expected = Math.max(cfg.floor, cfg.alpha * instant + (1 - cfg.alpha) * prev);
    expect(state.credits["map.solari"]).toBe(expected);
    expect(state.variant).toBe("ema_inertia");
    expect(state.turn).toBe(3);
  });

  it("uses instant credit when there is no previous value", () => {
    const content = getContent(["core"]);
    const cfg = fxExchangeCfg(content);
    const ledger = { factions: {} };
    const state = computeFxExchangeState(content, ledger, { "map.solari": 4 }, {}, 1);
    expect(state.credits["map.solari"]).toBe(instantPegCredit(0, 4, cfg));
  });

  it("skips same-peg currency pairs in bilateral rates", () => {
    const content = getContent(["core"]);
    const state = computeFxExchangeState(content, { factions: {} }, {}, {}, 1);
    // fx.karned_trill and fx.aphel_ilir both peg map.blumatid
    expect(state.rates.some((r) => r.pair.includes("fx.karned_trill") && r.pair.includes("fx.aphel_ilir"))).toBe(false);
    expect(state.rates.some((r) => r.pair.startsWith("fx.belator_solarit") && r.pair.includes("fx.turon_credit"))).toBe(true);
  });

  it("globalPegReserves sums named stocks across every faction", () => {
    const ledger = {
      factions: {
        a: { stocks: { "map.solari": 10, "map.titan": 1 } },
        b: { stocks: { "map.solari": 5 } },
      },
    };
    expect(globalPegReserves(ledger, "map.solari")).toBe(15);
    expect(globalPegReserves(ledger, "map.titan")).toBe(1);
  });
});
