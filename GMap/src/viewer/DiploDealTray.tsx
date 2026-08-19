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
import { groupByKey, groupByStar, worldsLine } from "./diploHandGroups";
import {
  directionLabel,
  FALLBACK_DIRECTION_IDS,
} from "../state/techDirections";

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

type HandTab = "treasury" | "forces" | "worlds" | "techs" | "treaties" | "acts";

export type DiploHandTab = HandTab;

export const DIPLO_GIVE_SECTIONS: { id: HandTab; label: string }[] = [
  { id: "treasury", label: "Казна" },
  { id: "forces", label: "Силы" },
  { id: "worlds", label: "Миры" },
  { id: "techs", label: "Технологии" },
  { id: "treaties", label: "Договоры" },
  { id: "acts", label: "Жесты" },
];

export const DIPLO_WANT_SECTIONS: { id: HandTab; label: string }[] = [
  { id: "treasury", label: "Ресурсы" },
  { id: "forces", label: "Их силы" },
  { id: "worlds", label: "Их миры" },
  { id: "treaties", label: "Договоры" },
];

export function DiploDealSections({
  sections,
  value,
  disabled,
  onChange,
}: {
  sections: { id: HandTab; label: string }[];
  value: HandTab | null;
  disabled?: boolean;
  onChange: (id: HandTab | null) => void;
}) {
  return (
    <div className="diplo-desk__tasks" role="tablist">
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={value === s.id}
          className={value === s.id ? "is-on" : ""}
          disabled={disabled}
          onClick={() => onChange(value === s.id ? null : s.id)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
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
 * Cards for one chosen section. Empty until the sidebar picks a tab.
 */
export function DiploDealTray({
  side,
  tab,
  stocks,
  assets,
  disabled,
  onActivate,
}: {
  side: "give" | "want";
  tab: DiploHandTab | null;
  stocks?: Record<string, number>;
  assets: TradeAssetPool;
  disabled?: boolean;
  onActivate: (cardId: string) => void;
}) {
  const materials = side === "give" ? ownedMaterials(stocks) : [];
  const asking = side === "want";

  if (!tab) {
    return (
      <p className="hint diplo-desk__hand-empty">
        {asking
          ? "Справа выберите раздел — карты появятся здесь"
          : "Слева выберите раздел — карты появятся здесь"}
      </p>
    );
  }

  return (
    <div className={`gc-deal-tray gc-deal-tray--${side}`}>
      <div className="gc-deal-tray__hand" aria-label={asking ? "Карты в Прошу" : "Карты в Отдаю"}>
        {tab === "treasury" && (
          <>
            {TREASURY.map((c) => {
              const stock = stocks?.[c.id] ?? 0;
              const cardId = diploCardId({ kind: "resource", currencyId: c.id });
              const blocked = !!disabled || (!asking && stock <= 0);
              return (
                <DragCard
                  key={c.id}
                  cardId={cardId}
                  title={c.name}
                  subtitle={
                    asking
                      ? `${c.short} · запросить`
                      : `${c.short} · в казне ${stock}`
                  }
                  accent={c.accent}
                  tilt
                  pinned={blocked}
                  className={!asking && stock <= 0 ? "gc-deal-card--empty" : ""}
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
              return (
                <DragCard
                  key={m.id}
                  cardId={cardId}
                  title={m.name}
                  subtitle={`сырьё · ${m.stock}`}
                  accent="var(--signal-warning, #c9a227)"
                  tilt
                  pinned={!!disabled}
                  icon={<ResourceIcon resourceId={m.id} stocks={stocks} size={16} />}
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
          </>
        )}
        {tab === "forces" && (
          <ForceGroups
            fleets={assets.fleets}
            legions={assets.legions}
            asking={asking}
            disabled={disabled}
            onActivate={onActivate}
          />
        )}
        {tab === "worlds" && (
          <>
            {assets.systems.map((s) => (
              <ForceCard
                key={s.id}
                cardId={diploCardId({ kind: "system", systemId: s.id })}
                title={s.name}
                subtitle={worldsLine(s.worlds)}
                disabled={disabled}
                onActivate={onActivate}
              />
            ))}
            {assets.systems.length === 0 && (
              <p className="hint">
                {asking
                  ? "Их миры пока не видны разведке."
                  : "Нет систем, которые можно отдать."}
              </p>
            )}
          </>
        )}
        {tab === "techs" && (
          <>
            {groupByKey(
              assets.techs,
              (t) => t.direction || "industry",
              FALLBACK_DIRECTION_IDS,
            ).map((g) => (
              <div key={g.key} className="gc-deal-tray__star-group">
                <p className="gc-deal-tray__star">{directionLabel(g.key)}</p>
                <div className="gc-deal-tray__star-cards">
                  {g.items.map((t) => (
                    <ForceCard
                      key={t.id}
                      cardId={diploCardId({ kind: "tech", techId: t.id })}
                      title={t.name}
                      subtitle="на стол"
                      disabled={disabled}
                      onActivate={onActivate}
                    />
                  ))}
                </div>
              </div>
            ))}
            {assets.techs.length === 0 && (
              <p className="hint">
                {asking
                  ? "Их науки скрыты."
                  : "Нет технологий, которые можно передать."}
              </p>
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
                subtitle={asking ? "просим их печать" : "предлагаем договор"}
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

function ForceGroups({
  fleets,
  legions,
  asking,
  disabled,
  onActivate,
}: {
  fleets: TradeAssetPool["fleets"];
  legions: TradeAssetPool["legions"];
  asking: boolean;
  disabled?: boolean;
  onActivate: (cardId: string) => void;
}) {
  const mixed = [
    ...fleets.map((f) => ({
      ...f,
      kind: "fleet" as const,
    })),
    ...legions.map((l) => ({
      ...l,
      kind: "legion" as const,
    })),
  ];
  if (mixed.length === 0) {
    return (
      <p className="hint">
        {asking
          ? "Их флоты и легионы пока не видны разведке."
          : "Нет сил на руке."}
      </p>
    );
  }
  return (
    <>
      {groupByStar(mixed).map((g) => (
        <div key={g.star} className="gc-deal-tray__star-group">
          <p className="gc-deal-tray__star">{g.star}</p>
          <div className="gc-deal-tray__star-cards">
            {g.items.map((item) => (
              <ForceCard
                key={item.id}
                cardId={
                  item.kind === "fleet"
                    ? diploCardId({ kind: "fleet", fleetId: item.id })
                    : diploCardId({ kind: "legion", legionId: item.id })
                }
                title={item.name}
                subtitle={item.kind === "fleet" ? "флот" : "легион"}
                disabled={disabled}
                onActivate={onActivate}
              />
            ))}
          </div>
        </div>
      ))}
    </>
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
