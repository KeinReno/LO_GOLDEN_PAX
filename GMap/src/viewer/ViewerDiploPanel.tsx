import type { ViewerPayload } from "../state/types";
import { DealDesk } from "./DealDesk";
import type { DiploDealItem, DiploOffer } from "./diploTradeTypes";

export type { DiploDealItem, DiploOffer };

/**
 * Player diplomacy — Galactic Civilizations layout (single deal desk surface).
 */
export function ViewerDiploPanel({
  payload,
  economy,
  incoming = [],
  outgoing = [],
  busy,
  msg,
  focusOfferId,
  onCreate,
  onAccept,
  onReject,
  onCancel,
  onGift,
  onStance,
  onEconomicTrack,
  password,
  reservedAp = 0,
  apMax = 0,
  orderMsg,
  onPlaceOffer,
  onCancelOffer,
}: {
  payload: ViewerPayload;
  economy?: ViewerPayload["economy"];
  incoming?: DiploOffer[];
  outgoing?: DiploOffer[];
  busy?: boolean;
  msg?: string | null;
  focusOfferId?: string | null;
  onCreate?: (args: {
    toFactionId: string;
    give: DiploDealItem[];
    want: DiploDealItem[];
    note: string;
  }) => void | boolean | Promise<void | boolean>;
  onAccept?: (offerId: string) => void;
  onReject?: (offerId: string) => void;
  onCancel?: (offerId: string) => void;
  onGift?: (toFactionId: string, currencyId: string, amount: number) => void;
  onStance?: (
    toFactionId: string,
    stance: "war" | "embargo" | "break",
  ) => void | boolean | Promise<void | boolean>;
  onEconomicTrack?: (
    kind: "quote" | "union",
    toFactionId: string,
    extras?: { unitsQuotePerBase?: number },
  ) => void | boolean | Promise<void | boolean>;
  password?: string;
  reservedAp?: number;
  apMax?: number;
  orderMsg?: string | null;
  onPlaceOffer?: (
    side: "sell" | "buy",
    giveCurrency: string,
    giveAmount: number,
    wantCurrency: string,
    wantAmount: number,
    venue: "common" | "contacts",
  ) => void | Promise<boolean | void>;
  onCancelOffer?: (offerId: string) => void | Promise<boolean | void>;
}) {
  const displayMsg = orderMsg || msg;

  if (!onCreate || !onAccept || !onReject || !onCancel) {
    return (
      <section className="viewer-diplo-v2 gc-diplo">
        <p className="hint">Дипломатия недоступна в этом режиме.</p>
      </section>
    );
  }

  return (
    <section className="viewer-diplo-v2 gc-diplo">
      <DealDesk
        payload={payload}
        economy={economy}
        incoming={incoming}
        outgoing={outgoing}
        busy={busy}
        msg={displayMsg}
        focusOfferId={focusOfferId}
        knownFactionIds={payload.knownFactionIds}
        onCreate={onCreate}
        onAccept={onAccept}
        onReject={onReject}
        onCancel={onCancel}
        onGift={onGift}
        onStance={onStance}
        onEconomicTrack={onEconomicTrack}
        password={password}
        reservedAp={reservedAp}
        apMax={apMax}
        onPlaceOffer={onPlaceOffer}
        onCancelOffer={onCancelOffer}
      />
    </section>
  );
}

export { VIEWER_TREATY_OPTIONS } from "./viewerDiploTreaties";
