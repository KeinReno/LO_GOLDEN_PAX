import { useState } from "react";
import { DragCard } from "../ui/DragCard";
import { ResourceIcon } from "../ui/ResourceIcon";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
  resourceDisplayName,
} from "../state/economyLabels";
import { DIPLOMACY_LABELS } from "../state/defaults";
import { isPaintDeposit } from "../state/resourceIndex";
import { getCachedContent } from "../state/contentCatalog";
import type { DiplomacyRelation } from "../state/types";
import type { TradeAssetPool } from "./diploTradeTypes";
import { diploCardId } from "./diploDealCards";

const TREASURY = [
  { id: BUILD_METAL.id, short: BUILD_METAL.short, name: BUILD_METAL.label, accent: "var(--text-secondary)" },
  { id: BUILD_SUPPLY.id, short: BUILD_SUPPLY.short, name: BUILD_SUPPLY.label, accent: "var(--text-secondary)" },
  ...CATEGORY_CURRENCIES.map((c) => ({
    id: c.id,
    short: c.letter,
    name: c.name,
    accent: c.cssVar,
  })),
];

const MUTUAL_TREATIES: DiplomacyRelation[] = [
  "trade",
  "nap",
  "research_pact",
  "migration_treaty",
  "alliance",
  "truce",
  "vassal",
];

type HandTab = "treasury" | "forces" | "treaties";

function giveBlocked(target: "give" | "want", stock: number, disabled?: boolean) {
  return !!disabled || (target === "give" && stock <= 0);
}

function ownedMaterials(stocks?: Record<string, number>) {
  const rows: { id: string; name: string; stock: number }[] = [];
  for (const [id, raw] of Object.entries(stocks ?? {})) {
    const n = Number(raw);
    if (!(n > 0)) continue;
    if (TREASURY.some((c) => c.id === id)) continue;
    if (id.startsWith("module.") || id.startsWith("fx.")) continue;
    const def = getCachedContent()?.map_resources?.[id];
    if (def && !isPaintDeposit(def)) continue;
    if (!id.startsWith("map.") && !def) continue;
    rows.push({ id, name: resourceDisplayName(id), stock: n });
  }
  return rows.sort((a, b) => b.stock - a.stock).slice(0, 16);
}

/**
 * Deal hand: informative cards. Drop onto the offer columns (not empty boxes).
 * Click uses the Отдаю/Прошу target — keyboard/touch fallback for drag.
 */
export function DiploDealTray({
  stocks,
  myAssets,
  theirAssets,
  disabled,
  target,
  onTarget,
  onActivate,
  dealHint,
}: {
  stocks?: Record<string, number>;
  myAssets: TradeAssetPool;
  theirAssets: TradeAssetPool;
  disabled?: boolean;
  target: "give" | "want";
  onTarget: (side: "give" | "want") => void;
  onActivate: (cardId: string) => void;
  dealHint?: string;
}) {
  const [tab, setTab] = useState<HandTab>("treasury");
  const materials = ownedMaterials(stocks);

  return (
    <div className="gc-deal-tray">
      <div className="gc-deal-tray__toolbar">
        <div className="gc-deal-tray__sides" role="group" aria-label="Куда класть кликом">
          <button
            type="button"
            className={target === "give" ? "on" : ""}
            disabled={disabled}
            onClick={() => onTarget("give")}
          >
            Отдаю
          </button>
          <button
            type="button"
            className={target === "want" ? "on" : ""}
            disabled={disabled}
            onClick={() => onTarget("want")}
          >
            Прошу
          </button>
        </div>
        <p className="hint gc-deal-tray__hint" role="status">
          {dealHint ||
            `Перетащите на колонку слева/справа или кликните карту → ${target === "give" ? "отдаю" : "прошу"}`}
        </p>
      </div>
      <div className="gc-deal-tray__tabs anim-tabs" role="tablist">
        {(
          [
            ["treasury", "Казна"],
            ["forces", "Силы и миры"],
            ["treaties", "Договоры"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "on" : ""}
            disabled={disabled}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="gc-deal-tray__hand" aria-label="Карты для сделки">
        {tab === "treasury" && (
          <>
            {TREASURY.map((c) => {
              const stock = stocks?.[c.id] ?? 0;
              const cardId = diploCardId({ kind: "resource", currencyId: c.id });
              const blocked = giveBlocked(target, stock, disabled);
              return (
                <DragCard
                  key={c.id}
                  cardId={cardId}
                  title={c.name}
                  subtitle={`${c.short} · в казне ${stock}`}
                  accent={c.accent}
                  tilt
                  pinned={blocked}
                  className={stock <= 0 ? "gc-deal-card--empty" : ""}
                  icon={<ResourceIcon resourceId={c.id} stocks={stocks} size={16} />}
                >
                  <button
                    type="button"
                    className="gc-deal-card__act"
                    disabled={blocked}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onActivate(cardId)}
                  >
                    На стол
                  </button>
                </DragCard>
              );
            })}
            {materials.map((m) => {
              const cardId = diploCardId({ kind: "resource", currencyId: m.id });
              const blocked = giveBlocked(target, m.stock, disabled);
              return (
                <DragCard
                  key={m.id}
                  cardId={cardId}
                  title={m.name}
                  subtitle={`сырьё · ${m.stock}`}
                  accent="var(--signal-warning, #c9a227)"
                  tilt
                  pinned={blocked}
                  className={m.stock <= 0 ? "gc-deal-card--empty" : ""}
                  icon={<ResourceIcon resourceId={m.id} stocks={stocks} size={16} />}
                >
                  <button
                    type="button"
                    className="gc-deal-card__act"
                    disabled={blocked}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onActivate(cardId)}
                  >
                    На стол
                  </button>
                </DragCard>
              );
            })}
          </>
        )}
        {tab === "forces" && (
          <>
            <p className="gc-deal-tray__group">Моё — только в «Отдаю»</p>
            {myAssets.fleets.slice(0, 12).map((f) => (
              <ForceCard
                key={f.id}
                cardId={diploCardId({ kind: "fleet", fleetId: f.id })}
                title={f.name}
                subtitle={f.where ? `флот · ${f.where}` : "флот"}
                disabled={disabled}
                onActivate={onActivate}
              />
            ))}
            {myAssets.legions.slice(0, 8).map((l) => (
              <ForceCard
                key={l.id}
                cardId={diploCardId({ kind: "legion", legionId: l.id })}
                title={l.name}
                subtitle={l.where ? `легион · ${l.where}` : "легион"}
                disabled={disabled}
                onActivate={onActivate}
              />
            ))}
            {myAssets.systems.slice(0, 12).map((s) => (
              <ForceCard
                key={s.id}
                cardId={diploCardId({ kind: "system", systemId: s.id })}
                title={s.name}
                subtitle="система"
                disabled={disabled}
                onActivate={onActivate}
              />
            ))}
            {myAssets.techs.slice(0, 10).map((t) => (
              <ForceCard
                key={t.id}
                cardId={diploCardId({ kind: "tech", techId: t.id })}
                title={t.name}
                subtitle="технология"
                disabled={disabled}
                onActivate={onActivate}
              />
            ))}
            {theirAssets.fleets.length + theirAssets.systems.length > 0 && (
              <p className="gc-deal-tray__group">Их видимое — только в «Прошу»</p>
            )}
            {theirAssets.fleets.slice(0, 8).map((f) => (
              <ForceCard
                key={`t-${f.id}`}
                cardId={diploCardId({ kind: "fleet", fleetId: f.id })}
                title={f.name}
                subtitle={f.where ? `их флот · ${f.where}` : "их флот"}
                disabled={disabled}
                onActivate={onActivate}
              />
            ))}
            {theirAssets.legions.slice(0, 6).map((l) => (
              <ForceCard
                key={`t-${l.id}`}
                cardId={diploCardId({ kind: "legion", legionId: l.id })}
                title={l.name}
                subtitle="их легион"
                disabled={disabled}
                onActivate={onActivate}
              />
            ))}
            {theirAssets.systems.slice(0, 8).map((s) => (
              <ForceCard
                key={`t-${s.id}`}
                cardId={diploCardId({ kind: "system", systemId: s.id })}
                title={s.name}
                subtitle="их система"
                disabled={disabled}
                onActivate={onActivate}
              />
            ))}
            {myAssets.fleets.length + myAssets.systems.length + theirAssets.fleets.length === 0 && (
              <p className="hint">Нет флотов и систем на руке — полный список в колонке сделки.</p>
            )}
          </>
        )}
        {tab === "treaties" &&
          MUTUAL_TREATIES.map((t) => {
            const cardId = diploCardId({ kind: "treaty", treaty: t });
            return (
              <DragCard
                key={t}
                cardId={cardId}
                title={DIPLOMACY_LABELS[t] ?? t}
                subtitle="взаимный договор · нужна их печать"
                accent="var(--accent)"
                tilt
                pinned={!!disabled}
              >
                <button
                  type="button"
                  className="gc-deal-card__act"
                  disabled={disabled}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onActivate(cardId)}
                >
                  На стол
                </button>
              </DragCard>
            );
          })}
      </div>
    </div>
  );
}

function ForceCard({
  cardId,
  title,
  subtitle,
  disabled,
  onActivate,
}: {
  cardId: string;
  title: string;
  subtitle: string;
  disabled?: boolean;
  onActivate: (cardId: string) => void;
}) {
  return (
    <DragCard
      cardId={cardId}
      title={title}
      subtitle={subtitle}
      accent="var(--signal-move, #6ea8ff)"
      tilt
      pinned={!!disabled}
    >
      <button
        type="button"
        className="gc-deal-card__act"
        disabled={disabled}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onActivate(cardId)}
      >
        На стол
      </button>
    </DragCard>
  );
}
