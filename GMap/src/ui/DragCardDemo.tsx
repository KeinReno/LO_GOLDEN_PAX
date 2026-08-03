import { useState } from "react";
import { Coins, Gem, Package } from "lucide-react";
import { CardBoard } from "./cardBoardContext";
import { DragCard } from "./DragCard";
import { DropZone } from "./DropZone";

type Slot = { cardId: string; title: string } | null;

const DECK = [
  {
    cardId: "ore",
    title: "Руда",
    subtitle: "Сырьё · 40 ед.",
    accent: "var(--eco-cat-b)",
    icon: <Package size={18} strokeWidth={1.75} />,
    body: "Поставка с астероидного пояса.",
  },
  {
    cardId: "credits",
    title: "Кредиты",
    subtitle: "Казна · 120",
    accent: "var(--accent)",
    icon: <Coins size={18} strokeWidth={1.75} />,
    body: "Ликвидность для сделки.",
  },
  {
    cardId: "crystal",
    title: "Кристалл",
    subtitle: "Редкость · 5",
    accent: "var(--eco-cat-f)",
    icon: <Gem size={18} strokeWidth={1.75} />,
    body: "Дипломатический рычаг.",
  },
] as const;

/**
 * Temporary showcase for DragCard / DropZone at `/demo/cards`.
 */
export function DragCardDemo() {
  const [give, setGive] = useState<Slot>(null);
  const [want, setWant] = useState<Slot>(null);
  const [log, setLog] = useState<string>("Перетащите карточку в зону «Даю» или «Хочу».");

  const placed = new Set(
    [give?.cardId, want?.cardId].filter(Boolean) as string[],
  );

  const onZone = (zoneId: string, cardId: string) => {
    const card = DECK.find((c) => c.cardId === cardId);
    if (!card) return;
    const slot = { cardId: card.cardId, title: card.title };
    if (zoneId === "give") {
      setGive(slot);
      if (want?.cardId === cardId) setWant(null);
      setLog(`«${card.title}» → Даю`);
    } else if (zoneId === "want") {
      setWant(slot);
      if (give?.cardId === cardId) setGive(null);
      setLog(`«${card.title}» → Хочу`);
    }
  };

  return (
    <div className="drag-card-demo">
      <header className="drag-card-demo__header">
        <div>
          <p className="drag-card-demo__eyebrow">GMap · Cards UI</p>
          <h1 className="drag-card-demo__title">DragCard / DropZone</h1>
          <p className="drag-card-demo__lede">
            Инфраструктура для A7–A10. Spring + tilt, без Tailwind.
          </p>
        </div>
        <p className="drag-card-demo__log" role="status">
          {log}
        </p>
      </header>

      <CardBoard>
        <div className="drag-card-demo__zones">
          <DropZone zoneId="give" label="Даю">
            {give ? (
              <span className="drop-zone__chip">{give.title}</span>
            ) : (
              <span className="drop-zone__hint">Отпустите карточку сюда</span>
            )}
          </DropZone>
          <DropZone zoneId="want" label="Хочу">
            {want ? (
              <span className="drop-zone__chip">{want.title}</span>
            ) : (
              <span className="drop-zone__hint">Отпустите карточку сюда</span>
            )}
          </DropZone>
        </div>

        <div className="drag-card-demo__hand" aria-label="Рука">
          {DECK.map((card, i) =>
            placed.has(card.cardId) ? null : (
              <DragCard
                key={card.cardId}
                cardId={card.cardId}
                title={card.title}
                subtitle={card.subtitle}
                accent={card.accent}
                icon={card.icon}
                tilt
                initialX={0}
                initialY={0}
                onDropZone={(zoneId) => onZone(zoneId, card.cardId)}
                className={`drag-card-demo__card drag-card-demo__card--${i}`}
              >
                <p>{card.body}</p>
              </DragCard>
            ),
          )}
        </div>
      </CardBoard>

      <footer className="drag-card-demo__footer">
        <button
          type="button"
          className="stateful-btn"
          onClick={() => {
            setGive(null);
            setWant(null);
            setLog("Сброшено.");
          }}
        >
          Сбросить
        </button>
        <a className="drag-card-demo__back" href="/">
          ← К редактору
        </a>
      </footer>
    </div>
  );
}
