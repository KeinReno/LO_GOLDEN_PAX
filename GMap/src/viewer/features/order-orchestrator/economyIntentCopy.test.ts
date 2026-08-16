import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  caravanOriginSystemId,
  marketConvertNote,
  marketOfferNote,
  sameTaxChoice,
  scoutQueuedNote,
  taxQueuedNote,
  taxTierDisplay,
  withDoctrinePending,
  withFlowPriority,
  withPendingTax,
  withStockReserve,
} from "./economyIntentCopy.ts";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore.ts";

describe("economyIntentCopy", () => {
  it("tax labels and skip-same", () => {
    assert.equal(taxTierDisplay("tax.materia", "mid"), "15%");
    assert.equal(taxQueuedNote("15%"), "Налог в очереди: 15%");
    assert.equal(sameTaxChoice("mid", undefined, "mid"), true);
    assert.equal(sameTaxChoice("none", "high", "high"), true);
    assert.equal(sameTaxChoice("none", undefined, "low"), false);
  });

  it("caravan origin prefers capital", () => {
    const systems = [
      { id: "a", ownerFactionId: "me" },
      { id: "b", ownerFactionId: "me" },
    ];
    assert.equal(caravanOriginSystemId(systems, "me", ["b"]), "b");
    assert.equal(caravanOriginSystemId(systems, "me", []), "a");
  });

  it("market / scout notes", () => {
    assert.match(marketConvertNote(10, "currency.metal"), /metal/);
    assert.match(marketOfferNote("contacts", 1, 2), /контакты/);
    assert.match(scoutQueuedNote("Sol", "1 ОД"), /Sol/);
  });

  it("optimistic economy patches", () => {
    const eco = { pendingPolicy: { taxes: { "tax.bios": "low" } as Record<string, string> } };
    const taxed = withPendingTax(eco, "tax.materia", "high");
    assert.equal(taxed.pendingPolicy?.taxes?.["tax.materia"], "high");
    assert.equal(taxed.pendingPolicy?.taxes?.["tax.bios"], "low");

    const flow = withFlowPriority(
      {} as { flowPriorities?: Record<string, { edge: string }> },
      "_faction",
      "A",
      "B",
    );
    assert.equal(flow.flowPriorities?._faction.edge, "A->B");

    const reserved = withStockReserve(
      {} as {
        stockReserves?: Record<string, { amount: number; label?: string }>;
      },
      "currency.metal",
      4,
      "hold",
    );
    assert.equal(reserved.stockReserves?.["currency.metal"]?.amount, 4);
    const cleared = withStockReserve(reserved, "currency.metal", 0);
    assert.equal(cleared.stockReserves?.["currency.metal"], undefined);

    const doc = withDoctrinePending(
      {} as {
        economicPolicy?: string;
        pendingPolicy?: { taxes?: Record<string, string> };
      },
      "military",
    );
    assert.equal(doc.economicPolicy, "military");
    assert.equal(doc.pendingPolicy?.taxes?.["tax.materia"], "high");
  });
});

describe("order intent busy", () => {
  it("survives resetOrderForm", () => {
    const s = useViewerOrderSessionStore.getState();
    s.setFlowPriorityBusy(true);
    s.setStockBusy(true);
    s.setPolicyBusy(true);
    s.setFlowData({ bottlenecks: {} });
    s.resetOrderForm();
    const next = useViewerOrderSessionStore.getState();
    assert.equal(next.flowPriorityBusy, true);
    assert.equal(next.stockBusy, true);
    assert.equal(next.policyBusy, true);
    assert.deepEqual(next.flowData, { bottlenecks: {} });
    next.setFlowPriorityBusy(false);
    next.setStockBusy(false);
    next.setPolicyBusy(false);
    next.setFlowData(null);
  });
});
