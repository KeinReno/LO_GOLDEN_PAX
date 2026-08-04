/**
 * Card battle table — optional tactical layer over engagement composition (A7).
 */
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { CardBoard } from "../ui/cardBoardContext";
import { DragCard } from "../ui/DragCard";
import { DropZone } from "../ui/DropZone";
import type { BattleCard, CardBattleLogEntry, CardBattleState } from "../state/types";
import { resolveShipOrUnitName } from "../state/displayLabels";
import type { ViewerEngagement } from "./PlayerEngagementPanel";
import { COMBAT_STANCE_LABELS, type CombatStanceId } from "./PlayerEngagementPanel";
import { COMBAT_ROLE_LABELS } from "./forces/constants";

function battleCardRole(role: string): string {
  return COMBAT_ROLE_LABELS[role] ?? role;
}

function CardFace({
  card,
  compact,
}: {
  card: BattleCard;
  compact?: boolean;
}) {
  return (
    <div className={`cbt-card-stats${compact ? " is-compact" : ""}`}>
      <span className="cbt-stat" title="Урон">
        ✦{card.damage}
      </span>
      <span className="cbt-stat" title="HP">
        ♥{card.hp}/{card.maxHp}
      </span>
      <span className="cbt-stat" title="Кол-во">
        ×{card.count}
      </span>
      {!compact && card.shields > 0 && (
        <span className="cbt-stat" title="Щиты">
          ⬡{card.shields}
        </span>
      )}
    </div>
  );
}

function StackPile({
  label,
  count,
  onClick,
  faceDown,
}: {
  label: string;
  count: number;
  onClick?: () => void;
  faceDown?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={`cbt-pile${faceDown ? " is-facedown" : ""}${onClick ? " is-clickable" : ""}`}
      onClick={onClick}
      disabled={onClick ? count <= 0 : undefined}
      aria-label={`${label}: ${count}`}
    >
      <span className="cbt-pile-label">{label}</span>
      <span className="cbt-pile-count">{count}</span>
    </Tag>
  );
}

function LogList({
  log,
  factionNames,
}: {
  log: CardBattleLogEntry[];
  factionNames: Record<string, string>;
}) {
  const recent = log.slice(-12).reverse();
  if (!recent.length) return <p className="hint">Лог пуст.</p>;
  return (
    <ul className="cbt-log" aria-live="polite">
      {recent.map((e, i) => {
        const who = factionNames[e.side] || e.side;
        let text = `${who}: ${e.action}`;
        if (e.action === "play" && e.cardId) text = `${who} сыграл карту`;
        if (e.action === "pass") text = `${who} пас`;
        if (e.action === "resolve") {
          const dmg = e.outcome?.damageDealt ?? 0;
          text = `Резолв · урон ${dmg}`;
        }
        if (e.action === "base_hit") {
          text = `${who} бьёт по базе (−${e.outcome?.damageDealt ?? 0})`;
        }
        return (
          <li key={`${e.round}-${e.action}-${i}`}>
            <span className="cbt-log-round">R{e.round}</span> {text}
          </li>
        );
      })}
    </ul>
  );
}

export type CardBattleTableProps = {
  engagement: ViewerEngagement;
  factionId: string;
  password: string;
  factionNames: Record<string, string>;
  busy?: boolean;
  onUpdated?: (engagement: ViewerEngagement) => void;
  onClose?: () => void;
};

export function CardBattleTable({
  engagement,
  factionId,
  password,
  factionNames,
  busy: busyProp = false,
  onUpdated,
  onClose,
}: CardBattleTableProps) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [resolveFlash, setResolveFlash] = useState<string | null>(null);

  const state = engagement.cardBattle as CardBattleState | null | undefined;
  const myStance = engagement.sides.find((s) => s.factionId === factionId)?.stance;
  const oppId =
    engagement.sides.find((s) => s.factionId !== factionId)?.factionId || "";

  const myHand = state?.hands?.[factionId] || [];
  const myFront = state?.frontLines?.[factionId] || [];
  const oppFront = state?.frontLines?.[oppId] || [];
  const myDeck = state?.decks?.[factionId] || [];
  const myDiscard = state?.discard?.[factionId] || [];
  const oppHandCount = state?.hands?.[oppId]?.length || 0;
  const myBase = state?.baseHp?.[factionId] ?? 0;
  const oppBase = state?.baseHp?.[oppId] ?? 0;
  const isMyTurn = state?.currentSide === factionId && state?.status === "active";
  const resolved = state?.status === "resolved" || engagement.status === "resolved";

  const stanceLabel = useMemo(() => {
    if (!myStance) return null;
    return (
      COMBAT_STANCE_LABELS[myStance as CombatStanceId] || myStance
    );
  }, [myStance]);

  const post = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/engagements/${engagement.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factionId, password, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.engagement) onUpdated?.(data.engagement as ViewerEngagement);
      if (data.pairResult) {
        setResolveFlash(
          data.pairResult.loserCard
            ? `Поражение: ${data.pairResult.loserCard}`
            : `Урон ${data.pairResult.damageDealt}`,
        );
        window.setTimeout(() => setResolveFlash(null), 900);
      }
      return true;
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const playCard = (cardId: string) => {
    if (!isMyTurn || busy || busyProp) return;
    void post("play_card", { cardId });
  };

  const passTurn = () => {
    if (!isMyTurn || busy || busyProp) return;
    void post("pass_card", {});
  };

  const drawOne = () => {
    if (!isMyTurn || busy || busyProp || myDeck.length <= 0) return;
    void post("draw_card", {});
  };

  if (!state) {
    return (
      <div className="cbt-table cbt-table--empty" role="status">
        <header className="cbt-head">
          <h2>Карточный бой</h2>
          {onClose && (
            <button type="button" className="btn ghost" onClick={onClose}>
              Закрыть
            </button>
          )}
        </header>
        <p className="hint">Колоды ещё не розданы — дождитесь подготовки боя.</p>
        {msg && <p className="hint eng-msg">{msg}</p>}
      </div>
    );
  }

  return (
    <CardBoard>
      <div
        className={`cbt-table${resolved ? " is-resolved" : ""}${isMyTurn ? " is-my-turn" : ""}`}
        role="region"
        aria-label="Карточный бой"
      >
        <header className="cbt-head">
          <div>
            <h2>Карточный бой</h2>
            <p className="hint">
              Раунд {state.round} ·{" "}
              {resolved
                ? "завершён"
                : isMyTurn
                  ? "ваш ход"
                  : `ход: ${factionNames[state.currentSide] || state.currentSide}`}
            </p>
          </div>
          <div className="cbt-head-badges">
            {stanceLabel && (
              <span className="cbt-stance-badge" title="Боевая поза (пассивка)">
                {stanceLabel}
              </span>
            )}
            {onClose && (
              <button type="button" className="btn ghost" onClick={onClose}>
                Свернуть
              </button>
            )}
          </div>
        </header>

        <div className="cbt-layout">
          <div className="cbt-field">
            <section className="cbt-side cbt-side--opp" aria-label="Противник">
              <div className="cbt-side-meta">
                <strong>{factionNames[oppId] || oppId || "Противник"}</strong>
                <span className="hint">
                  база {Math.round(oppBase)} · рука {oppHandCount}
                </span>
              </div>
              <div className="cbt-opp-hand" aria-hidden>
                {Array.from({ length: Math.min(oppHandCount, 6) }).map((_, i) => (
                  <div key={i} className="cbt-card-back" />
                ))}
              </div>
              <DropZone
                zoneId="opp-front"
                className="cbt-frontline cbt-frontline--opp"
                label="Фронт противника"
              >
                <AnimatePresence mode="popLayout">
                  {oppFront.map((c) => (
                    <motion.div
                      key={c.cardId}
                      className="cbt-front-card"
                      layout
                      initial={{ opacity: 0, y: -16, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 80, rotate: 12 }}
                      transition={{ duration: 0.28 }}
                    >
                      <DragCard
                        cardId={c.cardId}
                        title={resolveShipOrUnitName(c.defId)}
                        subtitle={battleCardRole(c.role)}
                        pinned
                        accent="var(--signal-attack)"
                      >
                        <CardFace card={c} />
                      </DragCard>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {!oppFront.length && (
                  <span className="hint cbt-front-empty">пусто</span>
                )}
              </DropZone>
            </section>

            <div className="cbt-vs" aria-hidden>
              {resolveFlash ? (
                <motion.span
                  key={resolveFlash}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="cbt-flash"
                >
                  {resolveFlash}
                </motion.span>
              ) : (
                <span>⚔</span>
              )}
            </div>

            <section className="cbt-side cbt-side--me" aria-label="Вы">
              <DropZone
                zoneId="my-front"
                className="cbt-frontline cbt-frontline--me"
                label="Ваш фронт"
                accepts={isMyTurn ? undefined : []}
                onDrop={(cardId) => playCard(cardId)}
                highlight={isMyTurn}
              >
                <AnimatePresence mode="popLayout">
                  {myFront.map((c) => (
                    <motion.div
                      key={c.cardId}
                      className="cbt-front-card"
                      layout
                      initial={{ opacity: 0, y: 16, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -80, rotate: -12 }}
                      transition={{ duration: 0.28 }}
                    >
                      <DragCard
                        cardId={c.cardId}
                        title={resolveShipOrUnitName(c.defId)}
                        subtitle={battleCardRole(c.role)}
                        pinned
                        accent="var(--accent)"
                      >
                        <CardFace card={c} />
                      </DragCard>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {!myFront.length && (
                  <span className="hint cbt-front-empty">
                    {isMyTurn ? "Перетащите карту сюда" : "пусто"}
                  </span>
                )}
              </DropZone>

              <div className="cbt-side-meta">
                <strong>Вы</strong>
                <span className="hint">база {Math.round(myBase)}</span>
              </div>

              <div className="cbt-hand-row">
                <StackPile
                  label="Колода"
                  count={myDeck.length}
                  faceDown
                  onClick={
                    isMyTurn && myDeck.length > 0 && !busy && !busyProp
                      ? drawOne
                      : undefined
                  }
                />
                <div className="cbt-hand" role="list">
                  {myHand.map((c) => (
                    <div key={c.cardId} className="cbt-hand-slot" role="listitem">
                      <DragCard
                        cardId={c.cardId}
                        title={resolveShipOrUnitName(c.defId)}
                        subtitle={`${battleCardRole(c.role)} · ×${c.count}`}
                        accent="var(--accent)"
                        pinned={!isMyTurn || busy || busyProp}
                        tilt={isMyTurn}
                        onDropZone={(zoneId) => {
                          if (zoneId === "my-front") playCard(c.cardId);
                        }}
                      >
                        <CardFace card={c} />
                        {isMyTurn && (
                          <button
                            type="button"
                            className="btn tiny cbt-play-btn"
                            disabled={busy || busyProp}
                            onClick={() => playCard(c.cardId)}
                          >
                            Сыграть
                          </button>
                        )}
                      </DragCard>
                    </div>
                  ))}
                  {!myHand.length && (
                    <p className="hint">Рука пуста</p>
                  )}
                </div>
                <StackPile label="Сброс" count={myDiscard.length} />
              </div>

              <div className="cbt-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={!isMyTurn || busy || busyProp || resolved}
                  onClick={passTurn}
                >
                  Пас
                </button>
              </div>
            </section>
          </div>

          <aside className="cbt-sidebar">
            <h3>Лог</h3>
            <LogList log={state.log || []} factionNames={factionNames} />
            {resolved && (
              <p className="cbt-winner" role="status">
                {state.winnerFactionId
                  ? `Победитель: ${factionNames[state.winnerFactionId] || state.winnerFactionId}`
                  : "Ничья"}
              </p>
            )}
          </aside>
        </div>

        {msg && <p className="hint eng-msg">{msg}</p>}
      </div>
    </CardBoard>
  );
}
