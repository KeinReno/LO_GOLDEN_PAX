import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { MapCanvasApi, MapUnitDropPayload } from "../../../renderers/MapCanvas";
import { postForceBoard } from "../../../state/boardForce";
import {
  intentApCost,
  intentForceApCost,
} from "../../../state/contentCatalog";
import {
  postPlayerJson,
  postPlayerOrder,
} from "../../../state/playerActionClient";
import { formatOdMeter } from "../../../state/playerUiTerms";
import type { OrderType, ViewerPayload, WorldState } from "../../../state/types";
import { useViewerBattleSessionStore } from "../../../state/viewerBattleSessionStore";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import type { ViewerEngagement } from "../../PlayerEngagementPanel";
import type { RecruitSessionPatch } from "../system-dive/systemActionCopy";
import { isWithinMoveRange } from "../../../state/movementRange";
import { checkOrderApBudget } from "./orderDropResolve";
import { mergeCancelAp, type ActionApPayload, type ApMeters } from "./orderApMerge";
import {
  applyLocalFleetOrder,
  applyLocalMoveRoute,
  pendingFleetRouteOrderId,
  worldWithClearedFleetRoute,
  worldWithIdleFleetStance,
} from "./localMoveRoute";
import {
  boardOutcomeNote,
  cardBattleChallengeNote,
  cardBattleOpenedNote,
  contactResolvedNote,
  fleetStanceClearedNote,
  hopsSuffix,
  intentDefIdFromOrderType,
  noSessionNote,
  orderCancelledNote,
  orderPostedNote,
  routeClearedNote,
  unitOrderAcceptedNote,
  unitOrderNote,
} from "./unitOrderCopy";
import { resolveViewerUnitDrop } from "./useViewerOrders";
import {
  patchViewerPayload,
  worldAfterCancelOrder,
} from "./viewerSessionPatch";

export type ContactStrikeSubmit = {
  contactMode: "auto" | "card";
  targetUnitKind: "fleet" | "legion";
  targetUnitId: string;
  targetFactionId?: string;
};

type CommitAp = (
  data: ActionApPayload,
  fallback?: { apCost?: number; forceCost?: number },
) => ApMeters;

type Opts = {
  payload: ViewerPayload | null;
  password: string;
  setPayload: Dispatch<SetStateAction<ViewerPayload | null>>;
  commitApFromAction: CommitAp;
  bump: () => void;
  loadWorld: (world: ViewerPayload["world"]) => void;
  sessionGenRef: MutableRefObject<number>;
  mapStampRef: MutableRefObject<string | null>;
  mapApiRef: { current: MapCanvasApi | null };
  refreshEngagements: (factionId: string) => Promise<unknown>;
  applyRecruitSession: (data: RecruitSessionPatch) => void;
  reservedAp: number;
  apMax: number;
  reservedForceAp: number;
  forceApMax: number;
};

export function useViewerUnitOrders({
  payload,
  password,
  setPayload,
  commitApFromAction,
  bump,
  loadWorld,
  sessionGenRef,
  mapStampRef,
  mapApiRef,
  refreshEngagements,
  applyRecruitSession,
  reservedAp,
  apMax,
  reservedForceAp,
  forceApMax,
}: Opts) {
  const orderType = useViewerOrderSessionStore((s) => s.orderType);
  const orderNote = useViewerOrderSessionStore((s) => s.orderNote);
  const setOrderType = useViewerOrderSessionStore((s) => s.setOrderType);
  const setOrderMsg = useViewerOrderSessionStore((s) => s.setOrderMsg);
  const applyApFromApi = useViewerOrderSessionStore((s) => s.applyApFromApi);
  const selectedSystemId = useViewerSessionStore((s) => s.selectedSystemId);
  const selectedFleetId = useViewerSessionStore((s) => s.selectedFleetId);
  const selectedLegionId = useViewerSessionStore((s) => s.selectedLegionId);
  const targetSystemId = useViewerSessionStore((s) => s.targetSystemId);
  const setSelectedSystemId = useViewerSessionStore((s) => s.setSelectedSystemId);
  const setSelectedFleetId = useViewerSessionStore((s) => s.setSelectedFleetId);
  const setSelectedLegionId = useViewerSessionStore((s) => s.setSelectedLegionId);
  const setTargetSystemId = useViewerSessionStore((s) => s.setTargetSystemId);
  const setSheetOpen = useViewerChromeStore((s) => s.setSheetOpen);
  const setContactBattleBusy = useViewerBattleSessionStore(
    (s) => s.setContactBattleBusy,
  );
  const setContactBattleError = useViewerBattleSessionStore(
    (s) => s.setContactBattleError,
  );
  const setContactBattleResultEng = useViewerBattleSessionStore(
    (s) => s.setContactBattleResultEng,
  );
  const openCardBattle = useViewerBattleSessionStore((s) => s.openCardBattle);
  const clearContactBattle = useViewerBattleSessionStore(
    (s) => s.clearContactBattle,
  );
  const beginContactChooser = useViewerBattleSessionStore(
    (s) => s.beginContactChooser,
  );

  const selectedFleet =
    payload?.world.fleets.find((f) => f.id === selectedFleetId) ?? null;
  const selectedLegion =
    payload?.world.legions.find((l) => l.id === selectedLegionId) ?? null;

  const cancelOrder = async (orderId: string) => {
    if (!payload) return;
    try {
      const { ok, status, data } = await postPlayerJson(
        `/api/intents/${orderId}/cancel`,
        {
          factionId: payload.factionId,
          password,
        },
      );
      if (!ok) throw new Error(data.error || String(status));
      const world = worldAfterCancelOrder(payload.world, orderId);
      setPayload((prev) =>
        prev
          ? patchViewerPayload(
              { ...prev, world },
              { economy: data.economy as ViewerPayload["economy"] },
            )
          : prev,
      );
      loadWorld(world);
      const s = useViewerOrderSessionStore.getState();
      applyApFromApi(
        mergeCancelAp(
          {
            reservedAp: s.reservedAp,
            apMax: s.apMax,
            reservedForceAp: s.reservedForceAp,
            forceApMax: s.forceApMax,
          },
          data,
        ),
      );
      setOrderMsg(orderCancelledNote());
      bump();
    } catch (e) {
      setOrderMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const submitUnitOrder = async (
    kind: "fleet" | "legion",
    unitId: string,
    toSystemId: string,
    hops: number | undefined,
    orderTypeNext: OrderType,
    noteOverride?: string,
    contactStrike?: ContactStrikeSubmit,
  ) => {
    if (!payload) return;
    const gen = sessionGenRef.current;
    setOrderMsg(null);
    const fromSystemId =
      kind === "fleet"
        ? payload.world.fleets.find((f) => f.id === unitId)?.systemId
        : payload.world.legions.find((l) => l.id === unitId)?.systemId;
    const isMove =
      orderTypeNext === "move_fleet" || orderTypeNext === "move_legion";
    const isFleetStanceOrder =
      orderTypeNext === "blockade" || orderTypeNext === "fortify";
    const hopsLabel = hopsSuffix(hops);
    const intentDefId = intentDefIdFromOrderType(orderTypeNext);
    const apCost = intentApCost(intentDefId);
    const forceCost = intentForceApCost(intentDefId);
    const budget = checkOrderApBudget({
      reservedAp,
      apMax,
      reservedForceAp,
      forceApMax,
      apCost,
      forceCost,
    });
    if (!budget.ok) {
      setOrderMsg(budget.message);
      return;
    }
    const body = {
      factionId: payload.factionId,
      password,
      type: orderTypeNext,
      fleetId: kind === "fleet" ? unitId : undefined,
      legionId: kind === "legion" ? unitId : undefined,
      fromSystemId,
      toSystemId,
      ...(orderTypeNext === "attack_system"
        ? {
            stance: "assault" as const,
            ...(kind === "legion" ? { theater: "assault" as const } : {}),
          }
        : {}),
      ...(contactStrike
        ? {
            contactMode: contactStrike.contactMode,
            targetUnitKind: contactStrike.targetUnitKind,
            targetUnitId: contactStrike.targetUnitId,
          }
        : {}),
      note: unitOrderNote({
        orderType: orderTypeNext,
        hops,
        isMove,
        noteOverride,
        contactMode: contactStrike?.contactMode,
      }),
    };
    try {
      const posted = await postPlayerOrder(body);
      const data = posted.data as {
        error?: string;
        apMax?: number;
        reservedAp?: number;
        forceApMax?: number;
        reservedForceAp?: number;
        intent?: { apCost?: number; forceApCost?: number };
        contactMode?: string;
        instantCombat?: boolean;
        session?: ViewerPayload & { tableRevision?: number };
        order?: WorldState["orders"][number];
        world?: WorldState;
        engagements?: ViewerEngagement[];
      };
      if (!posted.ok) {
        commitApFromAction(data);
        throw new Error(data.error || "order failed");
      }
      const mergeEngagements = (incoming: ViewerEngagement[] | undefined) => {
        if (!incoming?.length) return;
        useViewerBattleSessionStore.getState().setEngagements((prev) => {
          const ids = new Set(incoming.map((e) => e.id));
          return [...prev.filter((e) => !ids.has(e.id)), ...incoming];
        });
      };
      if (data.contactMode === "card" && data.session?.world) {
        if (sessionGenRef.current !== gen) return;
        const session = data.session;
        setPayload((prev) => ({
          ...session,
          updatedAt:
            session.updatedAt ??
            session.world.meta?.updatedAt ??
            prev?.updatedAt,
        }));
        loadWorld(session.world);
        commitApFromAction(data);
        mapStampRef.current = `${session.world.meta?.turn ?? ""}|${session.tableRevision ?? session.world.meta?.tableRevision ?? ""}`;
        mergeEngagements(data.engagements);
        clearContactBattle();
        const cardEng = data.engagements?.find((e) => e.mode === "card");
        if (cardEng) {
          openCardBattle(cardEng.id);
          setOrderMsg(cardBattleOpenedNote());
        } else {
          setOrderMsg(cardBattleChallengeNote());
        }
        bump();
        return;
      }
      if (data.instantCombat && data.session?.world) {
        if (sessionGenRef.current !== gen) return;
        const session = data.session;
        setPayload((prev) => ({
          ...session,
          updatedAt:
            session.updatedAt ??
            session.world.meta?.updatedAt ??
            prev?.updatedAt,
        }));
        loadWorld(session.world);
        commitApFromAction(data);
        mapStampRef.current = `${session.world.meta?.turn ?? ""}|${session.tableRevision ?? session.world.meta?.tableRevision ?? ""}`;
        mergeEngagements(data.engagements);
        void refreshEngagements(payload.factionId);
        if (contactStrike?.contactMode === "auto") {
          const resolved = data.engagements?.[0];
          if (resolved) setContactBattleResultEng(resolved);
          setContactBattleBusy(false);
        } else {
          setOrderMsg(contactResolvedNote());
        }
        bump();
        return;
      }
      const accepted = data.order;
      if (!accepted) throw new Error("order missing");
      let nextWorld: WorldState = {
        ...payload.world,
        orders: [...payload.world.orders, accepted],
      };
      if (data.world) {
        nextWorld = {
          ...data.world,
          orders: [...(data.world.orders ?? payload.world.orders), accepted],
        };
      } else if (isMove && fromSystemId) {
        nextWorld = applyLocalMoveRoute(
          nextWorld,
          kind,
          unitId,
          toSystemId,
          "idle",
          isWithinMoveRange,
        );
      } else if (kind === "fleet" && isFleetStanceOrder) {
        nextWorld = applyLocalFleetOrder(
          nextWorld,
          unitId,
          toSystemId,
          orderTypeNext,
          fromSystemId,
          isWithinMoveRange,
        );
      }
      if (sessionGenRef.current !== gen) return;
      setPayload((prev) => (prev ? { ...prev, world: nextWorld } : prev));
      loadWorld(nextWorld);
      const next = commitApFromAction(data);
      setOrderMsg(
        unitOrderAcceptedNote(
          orderTypeNext,
          isMove,
          hopsLabel,
          formatOdMeter(next.reservedAp, next.apMax),
        ),
      );
      bump();
    } catch (e) {
      if (contactStrike) {
        setContactBattleBusy(false);
        setContactBattleError(e instanceof Error ? e.message : String(e));
      }
      setOrderMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const submitMoveOrder = (
    kind: "fleet" | "legion",
    unitId: string,
    toSystemId: string,
    hops?: number,
  ) =>
    submitUnitOrder(
      kind,
      unitId,
      toSystemId,
      hops,
      kind === "fleet" ? "move_fleet" : "move_legion",
    );

  const submitDirectAttack = (fleetId: string, toSystemId: string) => {
    setSelectedFleetId(fleetId);
    setSelectedLegionId(null);
    setSelectedSystemId(toSystemId);
    setTargetSystemId(toSystemId);
    setOrderType("attack_system");
    void submitUnitOrder(
      "fleet",
      fleetId,
      toSystemId,
      undefined,
      "attack_system",
    );
  };

  const submitDirectLegionAttack = (legionId: string, toSystemId: string) => {
    setSelectedLegionId(legionId);
    setSelectedFleetId(null);
    setSelectedSystemId(toSystemId);
    setTargetSystemId(toSystemId);
    setOrderType("attack_system");
    void submitUnitOrder(
      "legion",
      legionId,
      toSystemId,
      undefined,
      "attack_system",
    );
  };

  const submitBoard = (legionId: string, targetFleetId: string) => {
    if (!payload) {
      setOrderMsg(noSessionNote());
      return;
    }
    void (async () => {
      const result = await postForceBoard({
        factionId: payload.factionId,
        password,
        legionId,
        targetFleetId,
      });
      if (!result.ok) {
        setOrderMsg(result.error);
        return;
      }
      applyRecruitSession(result.data);
      setOrderMsg(boardOutcomeNote(Boolean(result.data.captured)));
    })();
  };

  const submitDirectClaim = (toSystemId: string, fleetId?: string | null) => {
    if (fleetId) {
      setSelectedFleetId(fleetId);
      setSelectedLegionId(null);
    }
    setSelectedSystemId(toSystemId);
    setTargetSystemId(toSystemId);
    setOrderType("claim_system");
    if (fleetId) {
      void submitUnitOrder(
        "fleet",
        fleetId,
        toSystemId,
        undefined,
        "claim_system",
      );
      return;
    }
    if (!payload) return;
    setOrderMsg(null);
    void (async () => {
      try {
        const { ok, data } = await postPlayerOrder({
          factionId: payload.factionId,
          password,
          type: "claim_system",
          toSystemId,
          note: unitOrderNote({
            orderType: "claim_system",
            isMove: false,
          }),
        });
        if (!ok) throw new Error(data.error || "order failed");
        setPayload((prev) => {
          if (!prev) return prev;
          const nextWorld = {
            ...prev.world,
            orders: [
              ...prev.world.orders,
              data.order as WorldState["orders"][number],
            ],
          };
          loadWorld(nextWorld);
          return { ...prev, world: nextWorld };
        });
        const next = commitApFromAction(data);
        setOrderMsg(
          unitOrderAcceptedNote(
            "claim_system",
            false,
            "",
            formatOdMeter(next.reservedAp, next.apMax),
          ),
        );
        bump();
      } catch (e) {
        setOrderMsg(e instanceof Error ? e.message : String(e));
      }
    })();
  };

  const submitDirectBlockade = (
    fleetId: string,
    toSystemId: string,
    hops?: number,
  ) => {
    setSelectedFleetId(fleetId);
    setSelectedLegionId(null);
    setSelectedSystemId(toSystemId);
    setTargetSystemId(toSystemId);
    setOrderType("blockade");
    void submitUnitOrder("fleet", fleetId, toSystemId, hops, "blockade");
  };

  const cancelFleetRoute = useCallback(
    async (fleetId: string) => {
      if (!payload) return;
      const pendingId = pendingFleetRouteOrderId(payload.world, fleetId);
      if (pendingId) {
        await cancelOrder(pendingId);
        return;
      }
      const nextWorld = worldWithClearedFleetRoute(payload.world, fleetId);
      setPayload((prev) => (prev ? { ...prev, world: nextWorld } : prev));
      loadWorld(nextWorld);
      setOrderMsg(routeClearedNote());
      bump();
    },
    [payload, loadWorld, bump, password],
  );

  const clearFleetStance = useCallback(
    (fleetId: string) => {
      if (!payload) return;
      const nextWorld = worldWithIdleFleetStance(payload.world, fleetId);
      setPayload((prev) => (prev ? { ...prev, world: nextWorld } : prev));
      loadWorld(nextWorld);
      setOrderMsg(fleetStanceClearedNote());
      bump();
    },
    [payload, loadWorld, bump],
  );

  const onUnitDrop = (drop: MapUnitDropPayload) => {
    if (!payload) return;
    const resolved = resolveViewerUnitDrop(
      payload.world,
      payload.factionId,
      payload.visibleSystemIds,
      drop,
    );
    if (resolved.action === "reject") {
      setOrderMsg(resolved.message);
      return;
    }
    if (drop.kind === "fleet") {
      setSelectedFleetId(drop.unitId);
      setSelectedLegionId(null);
    } else {
      setSelectedLegionId(drop.unitId);
      setSelectedFleetId(null);
    }
    setSelectedSystemId(drop.toSystemId);
    setTargetSystemId(drop.toSystemId);
    setOrderType(resolved.orderType);
    setSheetOpen(false);
    if (resolved.action === "contact") {
      beginContactChooser(resolved.preview);
      return;
    }
    mapApiRef.current?.flashSystem(drop.toSystemId, drop.intent ?? "move");
    void submitUnitOrder(
      drop.kind,
      drop.unitId,
      drop.toSystemId,
      drop.hops,
      resolved.orderType,
    );
  };

  const submitOrder = async () => {
    if (!payload) return;
    setOrderMsg(null);
    const body = {
      factionId: payload.factionId,
      password,
      type: orderType,
      fleetId: selectedFleetId ?? undefined,
      legionId: selectedLegionId ?? undefined,
      fromSystemId:
        selectedFleet?.systemId ??
        selectedLegion?.systemId ??
        selectedSystemId ??
        undefined,
      toSystemId: targetSystemId ?? selectedSystemId ?? undefined,
      note: orderNote,
    };
    try {
      const { ok, data } = await postPlayerOrder(body);
      if (!ok) throw new Error(data.error || "order failed");
      let nextWorld = {
        ...payload.world,
        orders: [
          ...payload.world.orders,
          data.order as WorldState["orders"][number],
        ],
      };
      const toId = body.toSystemId;
      if (
        toId &&
        (orderType === "move_fleet" || orderType === "move_legion")
      ) {
        const unitId =
          orderType === "move_fleet" ? selectedFleetId : selectedLegionId;
        if (unitId) {
          nextWorld = applyLocalMoveRoute(
            nextWorld,
            orderType === "move_fleet" ? "fleet" : "legion",
            unitId,
            toId,
            "idle",
            isWithinMoveRange,
          );
        }
      }
      setPayload((prev) => (prev ? { ...prev, world: nextWorld } : prev));
      loadWorld(nextWorld);
      const next = commitApFromAction(data);
      setOrderMsg(orderPostedNote(formatOdMeter(next.reservedAp, next.apMax)));
      bump();
    } catch (e) {
      setOrderMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return {
    selectedFleet,
    selectedLegion,
    cancelOrder,
    submitUnitOrder,
    submitMoveOrder,
    submitDirectAttack,
    submitDirectLegionAttack,
    submitBoard,
    submitDirectClaim,
    submitDirectBlockade,
    cancelFleetRoute,
    clearFleetStance,
    onUnitDrop,
    submitOrder,
  };
}
