import { create } from "zustand";
import type { OrderType } from "./types";
import type { EconomyFlowBreakdown } from "../viewer/economyFlowTypes";

/**
 * Player order form + empire/force AP meters (T3.8 slice).
 * Session payload/world stay on ViewerPage; this is the order-tray / toast surface.
 */
interface ViewerOrderSessionState {
  orderType: OrderType;
  orderNote: string;
  orderMsg: string | null;
  apMax: number;
  reservedAp: number;
  forceApMax: number;
  reservedForceAp: number;
  flowPriorityBusy: boolean;
  stockBusy: boolean;
  policyBusy: boolean;
  flowData: EconomyFlowBreakdown | null;

  setOrderType: (t: OrderType) => void;
  setOrderNote: (n: string) => void;
  setOrderMsg: (m: string | null) => void;
  setApMax: (n: number) => void;
  setReservedAp: (n: number) => void;
  setForceApMax: (n: number) => void;
  setReservedForceAp: (n: number) => void;
  setFlowPriorityBusy: (v: boolean) => void;
  setStockBusy: (v: boolean) => void;
  setPolicyBusy: (v: boolean) => void;
  setFlowData: (v: EconomyFlowBreakdown | null) => void;

  /** Apply AP fields from an API payload when present. */
  applyApFromApi: (data: {
    apMax?: number;
    reservedAp?: number;
    forceApMax?: number;
    reservedForceAp?: number;
  }) => void;
  resetOrderForm: () => void;
}

export const useViewerOrderSessionStore = create<ViewerOrderSessionState>(
  (set) => ({
    orderType: "move_fleet",
    orderNote: "",
    orderMsg: null,
    apMax: 9,
    reservedAp: 0,
    forceApMax: 2,
    reservedForceAp: 0,
    flowPriorityBusy: false,
    stockBusy: false,
    policyBusy: false,
    flowData: null,

    setOrderType: (t) => set({ orderType: t }),
    setOrderNote: (n) => set({ orderNote: n }),
    setOrderMsg: (m) => set({ orderMsg: m }),
    setApMax: (n) => set({ apMax: n }),
    setReservedAp: (n) => set({ reservedAp: n }),
    setForceApMax: (n) => set({ forceApMax: n }),
    setReservedForceAp: (n) => set({ reservedForceAp: n }),
    setFlowPriorityBusy: (v) => set({ flowPriorityBusy: v }),
    setStockBusy: (v) => set({ stockBusy: v }),
    setPolicyBusy: (v) => set({ policyBusy: v }),
    setFlowData: (v) => set({ flowData: v }),

    applyApFromApi: (data) =>
      set((s) => ({
        apMax: typeof data.apMax === "number" ? data.apMax : s.apMax,
        reservedAp:
          typeof data.reservedAp === "number" ? data.reservedAp : s.reservedAp,
        forceApMax:
          typeof data.forceApMax === "number" ? data.forceApMax : s.forceApMax,
        reservedForceAp:
          typeof data.reservedForceAp === "number"
            ? data.reservedForceAp
            : s.reservedForceAp,
      })),
    resetOrderForm: () =>
      set({
        orderType: "move_fleet",
        orderNote: "",
        orderMsg: null,
      }),
  }),
);
