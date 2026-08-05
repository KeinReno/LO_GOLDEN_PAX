import { useMemo, useState } from "react";
import type { Faction, Planet, StarSystem } from "../state/types";
import {
  Users,
  Orbit,
  Pickaxe,
  Rocket,
  Swords,
  Eye,
  Wrench,
  ChevronRight,
  Sparkles,
  CircleOff,
} from "lucide-react";
import { classifyPlanet, HABIT_LABELS, planetsByOrbit } from "../state/planets";
import { COLONY_TYPE_LABELS, SYSTEM_ACTIVITY_LABELS } from "../state/defaults";
import { ResourceIcon } from "../ui/ResourceIcon";
import { InlineRename } from "../ui/InlineRename";
import { systemMineInfo, systemMineLabel } from "./depositMining";
import { planetContributionChips } from "./planetContributions";
import {
  SystemFlows,
  SystemHistory,
  calculateSystemFlows,
  planetsThatCanBuildCategory,
} from "./system";
import type { EconomyFlowBreakdown } from "./economyFlowTypes";
import type { BuildingDef } from "./PlayerPlanetManage";

function formatPop(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function colonyKey(t?: string | null): string {
  if (!t || t === "none") return "none";
  if (t === "capital") return "core";
  return t;
}

function isOwnSettled(
  p: Planet,
  system: StarSystem,
  factionId?: string | null,
): boolean {
  if (!factionId) return false;
  const owner = p.ownerFactionId || system.ownerFactionId;
  if (owner !== factionId) return false;
  return (
    classifyPlanet(p) === "inhabited" ||
    (p.population ?? 0) > 0 ||
    (!!p.colonyType && p.colonyType !== "none")
  );
}

type Props = {
  system: StarSystem;
  factionId: string;
  owner?: Faction | null;
  mapResourceNames?: Record<string, string>;
  reservedAp: number;
  apMax: number;
  metal: number;
  supply: number;
  fleetsCount: number;
  legionsCount: number;
  canBuildBelt: boolean;
  previewPlanetId?: string | null;
  message?: string | null;
  busy?: boolean;
  flowData?: EconomyFlowBreakdown | null;
  buildings?: Record<string, BuildingDef>;
  highlightCategory?: string | null;
  onHighlightCategory?: (letter: string | null) => void;
  onPreviewPlanet: (id: string) => void;
  onDrillPlanet: (id: string) => void;
  onArmBelt: () => void;
  onQuickMine: () => void;
  onOpenProduce: () => void;
  onRenameSystem?: (name: string) => void;
  onRenamePlanet?: (planetId: string, name: string) => void;
};

function planetHasMine(p: Planet): boolean {
  return [...(p.surfaceBuildings ?? []), ...(p.orbitalBuildings ?? [])].some(
    (b) => !b.disabled && b.kind === "mine",
  );
}

/**
 * Right-dock overview for system dive.
 * Visual language: Stellaris outliner density + Aceternity bento / focus cards.
 */
export function SystemDiveDock({
  system,
  factionId,
  owner,
  mapResourceNames,
  reservedAp,
  apMax,
  metal,
  supply,
  fleetsCount,
  legionsCount,
  canBuildBelt,
  previewPlanetId,
  message,
  busy,
  flowData,
  buildings,
  highlightCategory,
  onHighlightCategory,
  onPreviewPlanet,
  onDrillPlanet,
  onArmBelt,
  onQuickMine,
  onOpenProduce,
  onRenameSystem,
  onRenamePlanet,
}: Props) {
  const [filter, setFilter] = useState<"all" | "own" | "empty">("all");
  const mine = systemMineInfo(system, factionId);
  const ordered = useMemo(
    () => planetsByOrbit(system.planets ?? []),
    [system.planets],
  );
  const totalPop = ordered.reduce((s, p) => s + (p.population ?? 0), 0);
  const ownCount = ordered.filter((p) =>
    isOwnSettled(p, system, factionId),
  ).length;
  const beltRes = system.resources ?? [];

  const flowRows = useMemo(
    () => calculateSystemFlows(system, factionId, flowData),
    [system, factionId, flowData],
  );

  const highlightPlanets = useMemo(() => {
    if (!highlightCategory || !buildings) return new Set<string>();
    return new Set(
      planetsThatCanBuildCategory(
        system,
        factionId,
        highlightCategory,
        buildings,
      ).map((m) => m.planetId),
    );
  }, [highlightCategory, buildings, system, factionId]);

  const visible = ordered.filter((p) => {
    if (filter === "own") return isOwnSettled(p, system, factionId);
    if (filter === "empty") {
      return (
        (p.population ?? 0) <= 0 &&
        (!p.colonyType || p.colonyType === "none")
      );
    }
    return true;
  });

  const hasFocus = !!previewPlanetId;

  return (
    <div className="sys-dive-dock">
      {/* Bento stats — Aceternity-ish grid, Stellaris top bar */}
      <div className="sys-dive-bento" aria-label="Сводка системы">
        <div className="sys-dive-bento__cell">
          <Users size={13} />
          <strong>{formatPop(totalPop)}</strong>
          <span>нас.</span>
        </div>
        <button
          type="button"
          className={`sys-dive-bento__cell sys-dive-bento__cell--btn sys-dive-bento__cell--${mine.status}`}
          title={systemMineLabel(mine.status)}
          onClick={() => {
            if (mine.status === "none" && canBuildBelt) onQuickMine();
            else onArmBelt();
          }}
        >
          <Orbit size={13} />
          <strong>
            {mine.status === "own"
              ? "добыча"
              : mine.status === "other"
                ? "чужой"
                : beltRes.length
                  ? "нет добычи"
                  : "—"}
          </strong>
          <span>пояс ×{beltRes.length}</span>
        </button>
        <button
          type="button"
          className="sys-dive-bento__cell sys-dive-bento__cell--btn"
          onClick={() => setFilter((f) => (f === "own" ? "all" : "own"))}
          title="Фильтр: ваши колонии"
        >
          <Sparkles size={13} />
          <strong>{ownCount}</strong>
          <span>колоний</span>
        </button>
        <div className="sys-dive-bento__cell sys-dive-bento__cell--ap">
          <strong>
            {reservedAp}/{apMax}
          </strong>
          <span>
            ОД · мет.{metal} · снаб.{supply}
          </span>
        </div>
      </div>

      <SystemFlows
        rows={flowRows}
        highlightCategory={highlightCategory}
        onCategoryClick={(letter) => onHighlightCategory?.(letter)}
      />

      {/* Actionable alert — Stellaris situation log style */}
      {mine.status === "none" && beltRes.length > 0 && canBuildBelt && (
        <button
          type="button"
          className="sys-dive-alert"
          disabled={busy}
          onClick={onQuickMine}
        >
          <span className="sys-dive-alert__glow" aria-hidden />
          <Pickaxe size={15} />
          <span className="sys-dive-alert__body">
            <strong>Пояс не добывается</strong>
            <em>
              {busy
                ? "Строим…"
                : "Нажми — mining-станция · или ПКМ на депозите"}
            </em>
          </span>
          <ChevronRight size={16} />
        </button>
      )}

      {message && (
        <div
          className={`sys-dive-msg${/не |ошиб|хват/i.test(message) ? " is-err" : ""}`}
          role="status"
        >
          {message}
        </div>
      )}

      {/* Compact identity */}
      <div className="sys-dive-identity">
        <div className="sys-dive-identity__owner">
          {owner?.emblemPath && (
            <img src={owner.emblemPath} alt="" className="faction-emblem-thumb" />
          )}
          <div>
            <span className="hint">Система</span>
            <strong>
              {canBuildBelt && onRenameSystem ? (
                <InlineRename
                  value={system.name}
                  title="Переименовать систему"
                  onCommit={onRenameSystem}
                />
              ) : (
                system.name
              )}
            </strong>
            <span className="hint" style={{ marginTop: 2 }}>
              {owner?.name ?? "—"}
            </span>
          </div>
        </div>
        <div className="sys-dive-identity__meta">
          <span>
            {SYSTEM_ACTIVITY_LABELS[system.activity ?? "none"]}
          </span>
          <span>
            ✦{fleetsCount} · ⚑{legionsCount}
          </span>
        </div>
      </div>

      {/* Resource rail — icon marks mined vs idle */}
      {beltRes.length > 0 && (
        <div className="sys-dive-res-rail" aria-label="Депозиты пояса">
          {beltRes.slice(0, 10).map((id) => {
            const mined = mine.status !== "none";
            const label = mapResourceNames?.[id] ?? id.replace(/^map\./, "");
            return (
              <button
                key={id}
                type="button"
                className={`sys-dive-res-pill${mined ? " is-mined" : " is-idle"}`}
                title={
                  mined
                    ? `${label} · добывается`
                    : `${label} · нет добычи · клик → mining`
                }
                onClick={() => {
                  if (!mined && canBuildBelt) onQuickMine();
                  else onArmBelt();
                }}
              >
                <ResourceIcon resourceId={id} size={14} />
                <span className="sys-dive-res-pill__mark" aria-hidden>
                  {mined ? (
                    <Pickaxe
                      size={11}
                      className={
                        mine.status === "own"
                          ? "sys-mine-ico--own"
                          : "sys-mine-ico--other"
                      }
                    />
                  ) : (
                    <CircleOff size={11} className="sys-mine-ico--idle" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Action bar */}
      {canBuildBelt && (
        <div className="sys-dive-actions">
          <button
            type="button"
            className="sys-dive-action sys-dive-action--primary"
            onClick={onArmBelt}
          >
            <Orbit size={14} />
            Пояс
          </button>
          <button
            type="button"
            className="sys-dive-action"
            onClick={onOpenProduce}
          >
            <Rocket size={14} />
            Верфь
          </button>
          <button
            type="button"
            className="sys-dive-action"
            onClick={onOpenProduce}
          >
            <Swords size={14} />
            Войска
          </button>
        </div>
      )}

      {/* Planet outliner — Focus Cards: settled own stay bright */}
      <div className="sys-dive-outliner">
        <div className="sys-dive-outliner__head">
          <strong>Планеты</strong>
          <span className="hint">{visible.length}/{ordered.length}</span>
          <div className="sys-dive-filters">
            {(
              [
                ["all", "Все"],
                ["own", "Свои"],
                ["empty", "Пустые"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`sys-dive-filter${filter === id ? " is-on" : ""}`}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <ul
          className={`sys-dive-planet-list${hasFocus ? " has-focus" : ""}`}
          role="list"
        >
          {visible.length === 0 && (
            <li className="hint" style={{ padding: "8px 4px" }}>
              Нет планет в фильтре
            </li>
          )}
          {visible.map((p) => {
            const own = isOwnSettled(p, system, factionId);
            const habit = classifyPlanet(p);
            const ct = colonyKey(p.colonyType);
            const surf = (p.surfaceBuildings ?? []).length;
            const surfMax = p.surfaceSlots ?? 8;
            const fill = surfMax > 0 ? Math.min(1, surf / surfMax) : 0;
            const selected = p.id === previewPlanetId;
            const chips = own
              ? planetContributionChips(p, system, factionId).slice(0, 3)
              : [];
            const res = (p.resources ?? []).slice(0, 4);
            const minedLocal = planetHasMine(p);
            const ecoHot = highlightPlanets.has(p.id);

            return (
              <li key={p.id}>
                <div
                  className={[
                    "sys-dive-planet",
                    habit,
                    own && "is-own",
                    selected && "is-selected",
                    hasFocus && !selected && "is-dim",
                    ecoHot && "is-eco-hot",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div
                    className="sys-dive-planet__main"
                    role="button"
                    tabIndex={0}
                    onClick={() => onPreviewPlanet(p.id)}
                    onDoubleClick={() => onDrillPlanet(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onPreviewPlanet(p.id);
                      }
                    }}
                    title={`${p.name} · ${HABIT_LABELS[habit]}`}
                  >
                    <span className="sys-dive-planet__orbit">
                      {p.orbitIndex ?? "—"}
                    </span>
                    <span className="sys-dive-planet__body">
                      <span className="sys-dive-planet__name">
                        {own && onRenamePlanet ? (
                          <InlineRename
                            value={p.name}
                            title="Переименовать планету"
                            onCommit={(name) => onRenamePlanet(p.id, name)}
                          />
                        ) : (
                          p.name
                        )}
                        {own && (
                          <em className="sys-dive-planet__badge">ваш</em>
                        )}
                      </span>
                      <span className="sys-dive-planet__sub">
                        {ct !== "none"
                          ? (COLONY_TYPE_LABELS[ct] ?? ct)
                          : HABIT_LABELS[habit]}
                        {p.population > 0
                          ? ` · ${formatPop(p.population)}`
                          : ""}
                      </span>
                      <span
                        className="sys-dive-planet__bar"
                        aria-hidden
                      >
                        <i style={{ width: `${fill * 100}%` }} />
                      </span>
                    </span>
                    <span className="sys-dive-planet__res">
                      {res.map((rid) => (
                        <span
                          key={rid}
                          className={`sys-dive-planet__res-wrap${minedLocal ? " is-mined" : " is-idle"}`}
                          title={
                            minedLocal
                              ? `${mapResourceNames?.[rid] ?? rid} · добыча`
                              : `${mapResourceNames?.[rid] ?? rid} · нет добычи`
                          }
                        >
                          <ResourceIcon resourceId={rid} size={12} />
                          {minedLocal ? (
                            <Pickaxe size={9} className="sys-mine-ico--own" />
                          ) : (
                            <CircleOff
                              size={9}
                              className="sys-mine-ico--idle"
                            />
                          )}
                        </span>
                      ))}
                      <span className="sys-dive-planet__slots">
                        {surf}/{surfMax}
                      </span>
                    </span>
                  </div>
                  <div className="sys-dive-planet__actions">
                    <button
                      type="button"
                      className="sys-dive-planet__act"
                      title="Осмотр"
                      onClick={() => onPreviewPlanet(p.id)}
                    >
                      <Eye size={13} />
                    </button>
                    <button
                      type="button"
                      className="sys-dive-planet__act sys-dive-planet__act--primary"
                      title="Управлять"
                      onClick={() => onDrillPlanet(p.id)}
                    >
                      <Wrench size={13} />
                    </button>
                  </div>
                  {own && chips.length > 0 && (
                    <div className="sys-dive-planet__chips">
                      {chips.map((c) => (
                        <span
                          key={c.id}
                          className={`system-yield-chip system-yield-chip--${c.tone ?? "muted"}`}
                          title={c.title ?? c.label}
                        >
                          {c.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <SystemHistory history={system.history} />
    </div>
  );
}
