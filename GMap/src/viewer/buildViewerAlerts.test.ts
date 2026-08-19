import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ViewerPayload } from "../state/types.ts";
import { emptyViewerPlayWorld } from "./features/map-viewport/viewerPlayMapModel.ts";
import { buildViewerAlerts } from "./buildViewerAlerts.ts";
import type { ViewerEngagement } from "./PlayerEngagementPanel.ts";
import type { EconomySystemSignal } from "./economyFlowTypes.ts";

const noop = {
  onFocusIdleFleet: () => {},
  onFocusEngagement: () => {},
  onFocusOrders: () => {},
  onFocusRp: () => {},
  onFocusEconomy: () => {},
  onFocusDiplo: () => {},
  onFocusQuests: () => {},
};

function payload(partial: Record<string, unknown> = {}): ViewerPayload {
  const world = emptyViewerPlayWorld();
  world.systems = [
    {
      id: "sol",
      name: "Sol Invictus",
      x: 0,
      y: 0,
    } as ViewerPayload["world"]["systems"][number],
  ];
  world.fleets = [];
  return {
    factionId: "f1",
    visibleSystemIds: ["sol"],
    ...partial,
    world: { ...world, ...((partial.world as object) ?? {}) },
  } as ViewerPayload;
}

function fleet(id: string, name: string): ViewerPayload["world"]["fleets"][number] {
  return {
    id,
    name,
    factionId: "f1",
    systemId: "sol",
    stance: "idle",
  } as ViewerPayload["world"]["fleets"][number];
}

function fight(id: string, extra?: Partial<ViewerEngagement>): ViewerEngagement {
  return {
    id,
    theater: "space",
    systemId: "sol",
    status: "active",
    sides: [{ factionId: "f1" }, { factionId: "x" }],
    ...extra,
  } as ViewerEngagement;
}

describe("buildViewerAlerts", () => {
  it("puts economy above idle fleets and uses Russian fleet plural", () => {
    const world = emptyViewerPlayWorld();
    world.systems = [
      {
        id: "sol",
        name: "Sol Invictus",
        x: 0,
        y: 0,
      } as ViewerPayload["world"]["systems"][number],
    ];
    world.fleets = [
      fleet("a", "A"),
      fleet("b", "B"),
      fleet("c", "C"),
      fleet("d", "D"),
      fleet("e", "E"),
      fleet("f", "F"),
      fleet("g", "G"),
    ];
    world.orders = [];
    const p = payload({
      world,
      economy: { deficit: "ok", pressure: 0 },
    });
    const signals: EconomySystemSignal[] = [
      {
        systemId: "adara",
        systemName: "Адара",
        category: "D",
        reason: "Энергия T2 −63",
        severity: 3,
        consequence: "производство под угрозой",
      },
    ];
    const items = buildViewerAlerts({
      payload: p,
      engagements: [],
      pendingOrderCount: 0,
      rpUnread: 1,
      systemSignals: signals,
      callbacks: noop,
    });
    assert.equal(items[0]?.kind, "economy");
    assert.equal(items[0]?.verb, "Проверить производство");
    assert.equal(items[1]?.kind, "rp");
    assert.equal(items[1]?.verb, "Открыть RP");
    assert.equal(items[2]?.kind, "idle_fleet");
    assert.equal(items[2]?.title, "7 флотов без приказа");
  });

  it("collapses many fights into one row so economy still fits", () => {
    const p = payload({
      economy: { deficit: "metal", pressure: 0 },
    });
    const fights = [1, 2, 3, 4, 5].map((n) => fight(`e${n}`));
    const items = buildViewerAlerts({
      payload: p,
      engagements: fights,
      pendingOrderCount: 0,
      rpUnread: 0,
      economyWarning: "дефицит metal",
      callbacks: noop,
    });
    assert.equal(items.filter((i) => i.kind === "engagement").length, 1);
    assert.equal(items[0]?.kind, "engagement");
    assert.match(items[0]?.title ?? "", /5 боёв/);
    assert.equal(items[1]?.kind, "economy");
  });

  it("opens policies only when there is pressure and no system bottleneck", () => {
    const p = payload({
      economy: { deficit: "ok", pressure: 3 },
    });
    const items = buildViewerAlerts({
      payload: p,
      engagements: [],
      pendingOrderCount: 0,
      rpUnread: 0,
      economyWarning: "давление 3",
      callbacks: noop,
    });
    assert.equal(items[0]?.verb, "Открыть политики");
  });

  it("surfaces quest attention when the yearly dice is still unrolled", () => {
    const items = buildViewerAlerts({
      payload: payload(),
      engagements: [],
      pendingOrderCount: 0,
      rpUnread: 0,
      questAttention: 1,
      callbacks: noop,
    });
    const quest = items.find((i) => i.kind === "quest");
    assert.equal(quest?.verb, "Открыть квесты");
    assert.equal(quest?.title, "Есть решение по квесту");
  });
});
