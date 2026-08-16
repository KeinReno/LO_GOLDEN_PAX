import { describe, it, expect } from "vitest";
import { defaultEconomyAccount, DEFAULT_STOCKS } from "./ledgerAccount.mjs";

describe("defaultEconomyAccount", () => {
  it("without content, falls back to the documented default stocks", () => {
    expect(defaultEconomyAccount("f1").stocks).toEqual(DEFAULT_STOCKS);
  });

  it("with content, reads starting stocks from economy_balance.start.stocks instead of the hard-coded fallback", () => {
    const content = { economy_balance: { start: { stocks: { "currency.metal": 999 } } } };
    expect(defaultEconomyAccount("f1", content).stocks).toEqual({ "currency.metal": 999 });
  });

  it("matches the real content/core/economy_balance.json — proves the fallback isn't silently diverging", async () => {
    const { getContent } = await import("../../contentLoader.mjs");
    const content = getContent(["core"]);
    expect(defaultEconomyAccount("f1", content).stocks).toEqual(content.economy_balance.start.stocks);
  });
});
