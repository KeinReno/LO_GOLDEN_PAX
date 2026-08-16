import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { ViewerPayload } from "../../../state/types";
import { postPlayerIntent } from "../../../state/playerActionClient";
import {
  intentApCost,
  intentForceApCost,
} from "../../../state/contentCatalog";
import { fmtInt } from "../../../state/numberFormat";
import { formatOdCost } from "../../../state/playerUiTerms";
import { factionCapitals } from "../../../state/mapFeatures";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { currencyShortLabel } from "../../economy/chartData";
import { DOCTRINE_LABELS } from "../../economy/ecoCopy";
import type { ActionApPayload } from "./orderApMerge";
import {
  caravanOriginSystemId,
  caravanQueuedNote,
  flowPriorityNote,
  marketConvertNote,
  marketOfferNote,
  reserveQueuedNote,
  sameTaxChoice,
  scoutQueuedNote,
  taxFailNote,
  taxQueuedNote,
  taxTierDisplay,
  transferQueuedNote,
  withDoctrinePending,
  withFlowPriority,
  withPendingTax,
  withStockReserve,
} from "./economyIntentCopy";

type CommitAp = (
  data: ActionApPayload,
  fallback?: { apCost?: number; forceCost?: number },
) => void;

type Opts = {
  payload: ViewerPayload | null;
  password: string;
  setPayload: Dispatch<SetStateAction<ViewerPayload | null>>;
  commitApFromAction: CommitAp;
  onCaravanSent?: (toSystemId: string) => void;
};

export function useViewerEconomyIntents({
  payload,
  password,
  setPayload,
  commitApFromAction,
  onCaravanSent,
}: Opts) {
  const setOrderMsg = useViewerOrderSessionStore((s) => s.setOrderMsg);

  const submitPlayerIntent = useCallback(
    async (
      defId: string,
      intentPayload: Record<string, unknown>,
      okMsg: string,
      onOk?: (data: {
        intent?: { apCost?: number };
        reservedAp?: number;
      }) => void,
    ) => {
      if (!payload) return false;
      try {
        const { ok, data } = await postPlayerIntent({
          factionId: payload.factionId,
          password,
          defId,
          payload: intentPayload,
        });
        if (!ok) throw new Error(data.error || "intent failed");
        setOrderMsg(okMsg);
        commitApFromAction(data, {
          apCost: intentApCost(defId),
          forceCost: intentForceApCost(defId),
        });
        onOk?.(data);
        if (data.economy) {
          setPayload((prev) =>
            prev
              ? { ...prev, economy: data.economy as ViewerPayload["economy"] }
              : prev,
          );
        }
        return true;
      } catch (err) {
        setOrderMsg(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [payload, password, setOrderMsg, commitApFromAction, setPayload],
  );

  const sendCaravan = useCallback(
    async (currencyId: string, toSystemId: string, amount: number) => {
      if (!payload) return false;
      const caps = factionCapitals(payload.world, payload.factionId);
      const fromSystemId = caravanOriginSystemId(
        payload.world.systems,
        payload.factionId,
        caps.map((c) => c.id),
      );
      if (!fromSystemId) {
        setOrderMsg("Нет своей системы — караван не отправить.");
        return false;
      }
      const amt = Math.max(1, Math.floor(amount));
      const ok = await submitPlayerIntent(
        "intent.send_caravan",
        { currencyId, amount: amt, fromSystemId, toSystemId },
        caravanQueuedNote(amt, currencyShortLabel(currencyId)),
      );
      if (ok) onCaravanSent?.(toSystemId);
      return ok;
    },
    [payload, submitPlayerIntent, setOrderMsg, onCaravanSent],
  );

  const setTax = useCallback(
    async (taxSlot: string, tierId: string) => {
      if (!payload?.economy) return;
      const applied = payload.economy.taxes?.[taxSlot] ?? "none";
      const pending = payload.economy.pendingPolicy?.taxes?.[taxSlot];
      if (sameTaxChoice(applied, pending, tierId)) return;
      const orders = useViewerOrderSessionStore.getState();
      orders.setPolicyBusy(true);
      const label = taxTierDisplay(taxSlot, tierId);
      try {
        const ok = await submitPlayerIntent(
          "intent.set_tax",
          { taxSlot, tierId },
          taxQueuedNote(label),
          () => {
            setPayload((prev) => {
              if (!prev?.economy) return prev;
              return {
                ...prev,
                economy: withPendingTax(prev.economy, taxSlot, tierId),
              };
            });
          },
        );
        if (!ok) {
          setOrderMsg(
            useViewerOrderSessionStore.getState().orderMsg ||
              taxFailNote(label),
          );
        }
      } finally {
        orders.setPolicyBusy(false);
      }
    },
    [payload, submitPlayerIntent, setPayload, setOrderMsg],
  );

  const setFlowPriority = useCallback(
    async (opts: { from: string; to: string; systemId?: string | null }) => {
      if (!payload) return;
      const orders = useViewerOrderSessionStore.getState();
      orders.setFlowPriorityBusy(true);
      const key = opts.systemId || "_faction";
      const ok = await submitPlayerIntent(
        "intent.set_flow_priority",
        {
          from: opts.from,
          to: opts.to,
          ...(opts.systemId ? { systemId: opts.systemId } : {}),
        },
        flowPriorityNote(opts.from, opts.to),
        () => {
          setPayload((prev) => {
            if (!prev?.economy) return prev;
            return {
              ...prev,
              economy: withFlowPriority(
                prev.economy,
                key,
                opts.from,
                opts.to,
              ),
            };
          });
        },
      );
      orders.setFlowPriorityBusy(false);
      if (!ok) setOrderMsg("Не удалось задать приоритет");
    },
    [payload, submitPlayerIntent, setPayload, setOrderMsg],
  );

  const reserveStock = useCallback(
    async (currencyId: string, amount: number, label?: string) => {
      if (!payload) return;
      const orders = useViewerOrderSessionStore.getState();
      orders.setStockBusy(true);
      const curLabel = currencyShortLabel(currencyId);
      const ok = await submitPlayerIntent(
        "intent.reserve_stock",
        { currencyId, amount, ...(label ? { label } : {}) },
        reserveQueuedNote(amount > 0, fmtInt(amount), curLabel),
        () => {
          setPayload((prev) => {
            if (!prev?.economy) return prev;
            return {
              ...prev,
              economy: withStockReserve(
                prev.economy,
                currencyId,
                amount,
                label,
              ),
            };
          });
        },
      );
      orders.setStockBusy(false);
      if (!ok) setOrderMsg("Резерв не применён");
    },
    [payload, submitPlayerIntent, setPayload, setOrderMsg],
  );

  const setEconomicPolicy = useCallback(
    async (policyId: string) => {
      if (!payload) return;
      const orders = useViewerOrderSessionStore.getState();
      orders.setPolicyBusy(true);
      const ok = await submitPlayerIntent(
        "intent.set_economic_policy",
        { policyId },
        `Доктрина: ${DOCTRINE_LABELS[policyId] ?? policyId}`,
        () => {
          setPayload((prev) => {
            if (!prev?.economy) return prev;
            return {
              ...prev,
              economy: withDoctrinePending(prev.economy, policyId),
            };
          });
        },
      );
      orders.setPolicyBusy(false);
      if (!ok) setOrderMsg("Доктрина не применена");
    },
    [payload, submitPlayerIntent, setPayload, setOrderMsg],
  );

  const submitTransfer = useCallback(
    async (toFactionId: string, currencyId: string, amount: number) => {
      if (!payload) return;
      const fac = payload.world.factions.find((f) => f.id === toFactionId);
      await submitPlayerIntent(
        "intent.transfer",
        { toFactionId, currencyId, amount },
        transferQueuedNote(amount, fac?.name ?? toFactionId),
      );
    },
    [payload, submitPlayerIntent],
  );

  const submitMarketConvert = useCallback(
    async (fromCurrency: string, toCurrency: string, amountFrom: number) => {
      if (!payload) return false;
      return submitPlayerIntent(
        "intent.market_convert",
        { fromCurrency, toCurrency, amountFrom },
        marketConvertNote(amountFrom, fromCurrency),
      );
    },
    [payload, submitPlayerIntent],
  );

  const submitMarketOffer = useCallback(
    async (
      side: "sell" | "buy",
      giveCurrency: string,
      giveAmount: number,
      wantCurrency: string,
      wantAmount: number,
      venue: "common" | "contacts" = "common",
    ) => {
      if (!payload) return false;
      return submitPlayerIntent(
        "intent.market_offer",
        { side, giveCurrency, giveAmount, wantCurrency, wantAmount, venue },
        marketOfferNote(venue, giveAmount, wantAmount),
      );
    },
    [payload, submitPlayerIntent],
  );

  const submitMarketCancel = useCallback(
    async (offerId: string) => {
      if (!payload) return false;
      return submitPlayerIntent(
        "intent.market_cancel",
        { offerId },
        "Отмена заявки в очереди",
      );
    },
    [payload, submitPlayerIntent],
  );

  const submitScoutReveal = useCallback(
    async (systemId: string) => {
      if (!payload) return;
      const sys = payload.world.systems.find((s) => s.id === systemId);
      const ap = intentApCost("intent.scout_reveal");
      await submitPlayerIntent(
        "intent.scout_reveal",
        { systemId },
        scoutQueuedNote(
          sys?.name ?? systemId,
          ap > 0 ? formatOdCost(ap) : undefined,
        ),
      );
    },
    [payload, submitPlayerIntent],
  );

  return {
    submitPlayerIntent,
    sendCaravan,
    setTax,
    setFlowPriority,
    reserveStock,
    setEconomicPolicy,
    submitTransfer,
    submitMarketConvert,
    submitMarketOffer,
    submitMarketCancel,
    submitScoutReveal,
  };
}
