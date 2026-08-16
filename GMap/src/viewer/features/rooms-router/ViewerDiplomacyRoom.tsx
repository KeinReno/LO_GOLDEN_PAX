import { useState } from "react";
import type { ViewerPayload } from "../../../state/types";
import {
  postCurrencyUnion,
  postExchangeDeal,
} from "../../../state/economicTrackClient";
import { postPlayerJson } from "../../../state/playerActionClient";
import { ViewerDiploPanel } from "../../ViewerDiploPanel";
import type { DiploOffer } from "../../diploTradeTypes";
import type { ViewerActionSource } from "../order-orchestrator/viewerSessionPatch";
import { diploStanceOkMsg } from "./roomPanelCopy";

type Props = {
  payload: ViewerPayload;
  password: string;
  reservedAp: number;
  apMax: number;
  focusOfferId: string | null;
  onFocusOfferId: (id: string | null) => void;
  onSessionPatch: (data: ViewerActionSource) => void;
  onGift: (toId: string, cur: string, amt: number) => void;
  onPlaceOffer: (
    side: "sell" | "buy",
    giveCur: string,
    giveAmt: number,
    wantCur: string,
    wantAmt: number,
    venue: "common" | "contacts",
  ) => void | Promise<boolean | void>;
  onCancelOffer: (offerId: string) => void | Promise<boolean | void>;
};

export function ViewerDiplomacyRoom({
  payload,
  password,
  reservedAp,
  apMax,
  focusOfferId,
  onFocusOfferId,
  onSessionPatch,
  onGift,
  onPlaceOffer,
  onCancelOffer,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const incoming = (payload.diploOffers?.incoming ?? []) as DiploOffer[];
  const outgoing = (payload.diploOffers?.outgoing ?? []) as DiploOffer[];

  const offerAction = async (
    action: "create" | "accept" | "reject" | "cancel" | "stance",
    body: Record<string, unknown>,
    okMsg: string,
  ): Promise<boolean> => {
    setBusy(true);
    setMsg(null);
    try {
      const { ok, status, data } = await postPlayerJson("/api/diplo/offers", {
        factionId: payload.factionId,
        password,
        action,
        ...body,
      });
      if (!ok) throw new Error(data.error || data.message || String(status));
      onSessionPatch(data);
      setMsg(
        typeof data.message === "string" && data.message ? data.message : okMsg,
      );
      onFocusOfferId(null);
      return true;
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <ViewerDiploPanel
      payload={payload}
      economy={payload.economy}
      incoming={incoming}
      outgoing={outgoing}
      busy={busy}
      msg={msg}
      focusOfferId={focusOfferId}
      password={password}
      reservedAp={reservedAp}
      apMax={apMax}
      onCreate={({ toFactionId, give, want, note }) =>
        offerAction(
          "create",
          { toFactionId, give, want, note },
          "Предложение отправлено — адресат увидит его сразу",
        )
      }
      onAccept={(id) =>
        void offerAction("accept", { offerId: id }, "Сделка принята")
      }
      onReject={(id) =>
        void offerAction("reject", { offerId: id }, "Предложение отклонено")
      }
      onCancel={(id) =>
        void offerAction("cancel", { offerId: id }, "Предложение отозвано")
      }
      onGift={onGift}
      onStance={(toId, stance) =>
        offerAction(
          "stance",
          { toFactionId: toId, stance },
          diploStanceOkMsg(stance),
        )
      }
      onEconomicTrack={async (kind, toId, extras) => {
        setBusy(true);
        setMsg(null);
        const result =
          kind === "union"
            ? await postCurrencyUnion({
                factionId: payload.factionId,
                password,
                fromFactionId: payload.factionId,
                intoFactionId: toId,
              })
            : await postExchangeDeal({
                factionId: payload.factionId,
                password,
                factionAId: payload.factionId,
                factionBId: toId,
                unitsQuotePerBase: extras?.unitsQuotePerBase ?? 1,
              });
        setBusy(false);
        if (!result.ok) {
          setMsg(result.error);
          return false;
        }
        onSessionPatch(result.data);
        setMsg(
          kind === "union"
            ? "Валютный союз заключён"
            : "Валютный договор заключён",
        );
        return true;
      }}
      onPlaceOffer={onPlaceOffer}
      onCancelOffer={onCancelOffer}
    />
  );
}
