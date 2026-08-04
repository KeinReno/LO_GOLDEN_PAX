import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type {
  DiplomacyEvent,
  DiplomacyRelation,
  Faction,
  ViewerPayload,
} from "../state/types";
import { DIPLOMACY_LABELS, DIPLOMACY_RELATIONS } from "../state/defaults";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
} from "../state/economyLabels";
import { CardBoard } from "../ui/cardBoardContext";
import { DragCard } from "../ui/DragCard";
import { DropZone } from "../ui/DropZone";
import { HoldButton } from "../ui/HoldButton";
import { DealDesk, type DiploDealItem, type DiploOffer } from "./DealDesk";

function getRelation(
  payload: ViewerPayload,
  a: string,
  b: string,
): DiplomacyRelation {
  const [x, y] = a < b ? [a, b] : [b, a];
  return (
    payload.world.diplomacy.find((d) => d.aId === x && d.bId === y)?.relation ??
    "neutral"
  );
}

function opinionOf(fac: Faction | undefined, otherId: string): number {
  return fac?.diplomacy?.opinions?.[otherId] ?? 0;
}

const REL_PRIORITY: Record<string, number> = {
  war: 0,
  embargo: 1,
  vassal: 2,
  alliance: 3,
  research_pact: 4,
  trade: 5,
  migration_treaty: 6,
  nap: 7,
  truce: 8,
  neutral: 9,
};

const TRANSFER_CURRENCIES = [
  ...CATEGORY_CURRENCIES.map((c) => ({
    id: c.id,
    label: `${c.name} (${c.short})`,
  })),
  { id: BUILD_METAL.id, label: BUILD_METAL.label },
  { id: BUILD_SUPPLY.id, label: BUILD_SUPPLY.label },
];

function OpinionBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, ((value + 100) / 200) * 100));
  const tone =
    value >= 40 ? "good" : value <= -40 ? "bad" : value >= 10 ? "warm" : "cold";
  return (
    <div className={`diplo-opinion-bar diplo-opinion-bar--${tone}`}>
      <div className="diplo-opinion-bar__fill" style={{ width: `${pct}%` }} />
      <span className="diplo-opinion-bar__label">
        {value > 0 ? `+${value}` : value}
      </span>
    </div>
  );
}

function RelationBadge({ relation }: { relation: DiplomacyRelation }) {
  return (
    <span className={`diplo-badge diplo-badge--${relation}`}>
      {DIPLOMACY_LABELS[relation] ?? relation}
    </span>
  );
}

function Timeline({ events }: { events: DiplomacyEvent[] }) {
  if (!events.length) return <p className="hint">Пока тихо на дипломатическом фронте.</p>;
  return (
    <ol className="diplo-timeline">
      {events
        .slice()
        .reverse()
        .slice(0, 10)
        .map((e, i) => (
          <li key={`${e.turn}-${i}`} className="diplo-timeline__item">
            <span className="diplo-timeline__turn">Ход {e.turn}</span>
            <span className="diplo-timeline__label">{e.label}</span>
          </li>
        ))}
    </ol>
  );
}

/**
 * Player diplomacy room: faction cards + opinion dossier + incoming inbox.
 * Full deal constructor stays in DealDesk (collapsible). Resource gifts via DropZone.
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
  reservedAp: _reservedAp,
  apMax: _apMax,
  orderMsg,
  onTransfer,
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
  }) => void;
  onAccept?: (offerId: string) => void;
  onReject?: (offerId: string) => void;
  onCancel?: (offerId: string) => void;
  onGift?: (toFactionId: string, currencyId: string, amount: number) => void;
  reservedAp?: number;
  apMax?: number;
  orderMsg?: string | null;
  onTransfer?: (toFactionId: string, currencyId: string, amount: number) => void;
}) {
  const playerId = payload.factionId;
  const me = payload.world.factions.find((f) => f.id === playerId);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [showDesk, setShowDesk] = useState(false);
  const [giftCurrency, setGiftCurrency] = useState<string>(
    TRANSFER_CURRENCIES[0]?.id ?? "currency.metal",
  );
  const [giftAmount, setGiftAmount] = useState("50");
  const [hoverId, setHoverId] = useState<string | null>(null);

  const known = useMemo(() => {
    const set = new Set(payload.knownFactionIds ?? []);
    return payload.world.factions
      .filter((f) => f.id !== playerId && (set.size === 0 || set.has(f.id)))
      .map((f) => ({
        faction: f,
        relation: getRelation(payload, playerId, f.id),
        intelLevel: Number(payload.intel?.knownFactions?.[f.id] ?? 1),
        opinion: opinionOf(me, f.id),
      }))
      .sort(
        (a, b) =>
          (REL_PRIORITY[a.relation] ?? 9) - (REL_PRIORITY[b.relation] ?? 9) ||
          a.opinion - b.opinion ||
          a.faction.name.localeCompare(b.faction.name, "ru"),
      );
  }, [payload, playerId, me]);

  const focus =
    known.find((r) => r.faction.id === focusId)?.faction ??
    known[0]?.faction ??
    null;
  const focusRel = focus
    ? getRelation(payload, playerId, focus.id)
    : ("neutral" as DiplomacyRelation);
  const focusOp = focus ? opinionOf(me, focus.id) : 0;
  const focusHistory = (me?.diplomacy?.history ?? []).filter(
    (h) => focus && h.withFactionId === focus.id,
  );

  const giftParsed = Math.floor(Number(giftAmount));
  const giftStock = economy?.stocks?.[giftCurrency] ?? 0;
  const canGift =
    !!focus &&
    giftParsed > 0 &&
    giftParsed <= giftStock &&
    !!(onGift || onTransfer);

  const sendGift = () => {
    if (!canGift || !focus) return;
    (onGift ?? onTransfer)?.(focus.id, giftCurrency, giftParsed);
    setGiftAmount("");
  };

  return (
    <section className="viewer-diplo-v2">
      {incoming.length > 0 && (
        <section className="hq-card diplo-inbox is-glow">
          <h3>Входящие {incoming.length > 0 ? `· ${incoming.length}` : ""}</h3>
          <ul className="diplo-inbox__list">
            {incoming.map((o) => {
              const from = payload.world.factions.find(
                (f) => f.id === o.fromFactionId,
              );
              return (
                <li key={o.id} className="diplo-inbox__row">
                  <span>
                    от <strong>{from?.name ?? o.fromFactionId}</strong>
                    {o.note ? ` — ${o.note}` : ""}
                  </span>
                  <span className="diplo-inbox__actions">
                    <button
                      type="button"
                      className="btn primary sm"
                      disabled={busy}
                      onClick={() => onAccept?.(o.id)}
                    >
                      Принять
                    </button>
                    <HoldButton
                      className="btn ghost sm"
                      ms={600}
                      disabled={busy}
                      onConfirm={() => onReject?.(o.id)}
                    >
                      Отклонить
                    </HoldButton>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="diplo-workbench__body diplo-workbench__body--viewer">
        <aside className="diplo-faction-list">
          {known.length === 0 ? (
            <p className="hint">Нет известных держав.</p>
          ) : (
            known.map(({ faction, relation, opinion, intelLevel }) => (
              <div
                key={faction.id}
                className={`diplo-faction-card ${focus?.id === faction.id ? "is-selected" : ""} ${relation === "war" ? "is-glow" : ""}`}
                onMouseEnter={() => setHoverId(faction.id)}
                onMouseLeave={() => setHoverId(null)}
              >
                <button
                  type="button"
                  className="diplo-faction-card__btn"
                  onClick={() => setFocusId(faction.id)}
                >
                  <span
                    className="diplo-faction-card__swatch"
                    style={{ background: faction.color }}
                  />
                  <span className="diplo-faction-card__meta">
                    <strong>{faction.name}</strong>
                    <RelationBadge relation={relation} />
                    <span className="diplo-intel-pill" title="Уровень знания (Intel Fog)">
                      Intel L{intelLevel}
                    </span>
                    <OpinionBar value={opinion} />
                  </span>
                </button>
                <AnimatePresence>
                  {hoverId === faction.id && (
                    <motion.div
                      className="diplo-tooltip"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      <OpinionBar value={opinion} />
                      <p className="hint">{DIPLOMACY_LABELS[relation]}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))
          )}
        </aside>

        <section className="diplo-dossier">
          {!focus ? (
            <p className="hint">Выберите державу.</p>
          ) : (
            <>
              <header className="diplo-dossier__head">
                <span
                  className="diplo-dossier__swatch"
                  style={{ background: focus.color }}
                />
                <div>
                  <h3>{focus.name}</h3>
                  <RelationBadge relation={focusRel} />
                </div>
              </header>
              <OpinionBar value={focusOp} />
              <h4>Хроника</h4>
              <Timeline events={focusHistory} />

              {economy && (
                <div className="diplo-gift-board">
                  <h4>Дар / перевод</h4>
                  <p className="hint">Перетащите ресурс в зону «Отправить».</p>
                  <CardBoard>
                    <div className="diplo-gift-row">
                      <div className="diplo-gift-hand">
                        {TRANSFER_CURRENCIES.slice(0, 4).map((c) => (
                          <DragCard
                            key={c.id}
                            cardId={`res:${c.id}`}
                            title={c.label}
                            subtitle={`${economy.stocks?.[c.id] ?? 0}`}
                            accent="var(--accent)"
                            tilt
                            onDropZone={(zoneId) => {
                              if (zoneId === "gift") {
                                setGiftCurrency(c.id);
                              }
                            }}
                          />
                        ))}
                      </div>
                      <DropZone
                        zoneId="gift"
                        label="Отправить"
                        className="diplo-gift-zone"
                      >
                        <label className="field">
                          <span>Валюта</span>
                          <select
                            value={giftCurrency}
                            onChange={(e) => setGiftCurrency(e.target.value)}
                          >
                            {TRANSFER_CURRENCIES.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label} · {economy.stocks?.[c.id] ?? 0}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Сумма</span>
                          <input
                            type="number"
                            min={1}
                            max={giftStock}
                            value={giftAmount}
                            onChange={(e) => setGiftAmount(e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="btn primary block"
                          disabled={!canGift}
                          onClick={sendGift}
                        >
                          Отправить дар
                        </button>
                      </DropZone>
                    </div>
                  </CardBoard>
                  {(orderMsg || msg) && (
                    <p className="hint">{orderMsg || msg}</p>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {onCreate && onAccept && onReject && onCancel && (
        <section className="hq-card">
          <button
            type="button"
            className="btn ghost block"
            onClick={() => setShowDesk((v) => !v)}
          >
            {showDesk ? "Скрыть конструктор сделок" : "Конструктор сделок"}
          </button>
          {showDesk && (
            <DealDesk
              payload={payload}
              economy={economy}
              incoming={incoming}
              outgoing={outgoing}
              busy={busy}
              msg={msg}
              focusOfferId={focusOfferId}
              onCreate={onCreate}
              onAccept={onAccept}
              onReject={onReject}
              onCancel={onCancel}
              onGift={onGift}
            />
          )}
        </section>
      )}
    </section>
  );
}

/** Treaties available in deal packages (incl. A8 types). */
export const VIEWER_TREATY_OPTIONS = DIPLOMACY_RELATIONS.filter(
  (r) => r !== "vassal",
).map((id) => ({ id, label: DIPLOMACY_LABELS[id] }));
