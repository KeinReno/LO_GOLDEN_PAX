import { useMemo, useState } from "react";
import type { ViewerPayload } from "../state/types";
import { getCachedContent } from "../state/contentCatalog";

type Tab = "fleets" | "legions" | "catalog";

type CatalogShip = {
  id: string;
  name: string;
  tier?: number;
  faction?: string;
  roles?: string[];
  stats?: Record<string, number>;
  slots?: Array<{ role: string; count?: number }>;
};

type CatalogUnit = CatalogShip;

const VET_BONUS_HINTS = [
  "нет бонуса",
  "defense ×1.05",
  "defense ×1.10 · damage ×1.05",
  "defense ×1.15 · damage ×1.10",
  "defense ×1.20 · damage ×1.15",
  "defense ×1.25 · damage ×1.20",
];

function veterancyTooltip(c: {
  xp?: number;
  level?: number;
}): string {
  const level = Math.min(5, Math.max(0, c.level ?? 0));
  const xp = c.xp ?? 0;
  return `Veterancy ${level}/5 · XP ${xp} · ${VET_BONUS_HINTS[level] ?? ""}`;
}

/**
 * Armory / OOB workbench: formations + unit catalog with stats.
 */
export function ForcesArmory({
  payload,
  selectedFleetId,
  selectedLegionId,
  onSelectFleet,
  onSelectLegion,
  onFocusOnMap,
  onOrderWithFleet,
  onOrderWithLegion,
}: {
  payload: ViewerPayload;
  selectedFleetId?: string | null;
  selectedLegionId?: string | null;
  onSelectFleet?: (id: string) => void;
  onSelectLegion?: (id: string) => void;
  onFocusOnMap?: (systemId: string) => void;
  onOrderWithFleet?: (id: string) => void;
  onOrderWithLegion?: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("fleets");
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const fid = payload.factionId;

  const fleets = (payload.world.fleets ?? []).filter((f) => f.factionId === fid);
  const legions = (payload.world.legions ?? []).filter(
    (l) => l.factionId === fid,
  );

  const { ships, units } = useMemo(() => {
    const c = getCachedContent();
    return {
      ships: Object.values(c?.ships || {}) as CatalogShip[],
      units: Object.values(c?.units || {}) as CatalogUnit[],
    };
  }, []);

  const selectedFleet = fleets.find((f) => f.id === selectedFleetId) ?? null;
  const selectedLegion =
    legions.find((l) => l.id === selectedLegionId) ?? null;

  const catalogItem = useMemo(() => {
    if (!catalogId) return null;
    return (
      ships.find((s) => s.id === catalogId) ||
      units.find((u) => u.id === catalogId) ||
      null
    );
  }, [catalogId, ships, units]);

  const systemName = (id: string) =>
    payload.world.systems.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="armory">
      <div className="armory-tabs anim-tabs" role="tablist">
        {(
          [
            ["fleets", `Флоты · ${fleets.length}`],
            ["legions", `Легионы · ${legions.length}`],
            ["catalog", "Каталог юнитов"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`armory-tab ${tab === id ? "on" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="armory-grid">
        <aside className="armory-list">
          {tab === "fleets" && (
            <>
              <h3>Соединения</h3>
              {fleets.length === 0 ? (
                <div className="hq-empty">
                  <span className="hq-empty-reveal" aria-hidden />
                  <p className="hint">Нет своих флотов в зоне видимости.</p>
                </div>
              ) : (
                <ul>
                  {fleets.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        className={`armory-list-btn ${selectedFleetId === f.id ? "on" : ""}`}
                        onClick={() => onSelectFleet?.(f.id)}
                      >
                        <strong>{f.name}</strong>
                        <span className="hint">
                          {systemName(f.systemId)} · {f.stance}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {tab === "legions" && (
            <>
              <h3>Легионы</h3>
              {legions.length === 0 ? (
                <div className="hq-empty">
                  <span className="hq-empty-reveal" aria-hidden />
                  <p className="hint">Нет своих легионов в зоне видимости.</p>
                </div>
              ) : (
                <ul>
                  {legions.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        className={`armory-list-btn ${selectedLegionId === l.id ? "on" : ""}`}
                        onClick={() => onSelectLegion?.(l.id)}
                      >
                        <strong>{l.name}</strong>
                        <span className="hint">
                          {systemName(l.systemId)} · сила {l.strength ?? "—"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {tab === "catalog" && (
            <>
              <h3>Корабли</h3>
              <ul>
                {ships.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`armory-list-btn ${catalogId === s.id ? "on" : ""}`}
                      onClick={() => setCatalogId(s.id)}
                    >
                      <strong>{s.name}</strong>
                      <span className="hint">
                        T{s.tier ?? "?"} · {(s.roles || []).join(", ") || "—"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <h3>Наземные</h3>
              <ul>
                {units.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className={`armory-list-btn ${catalogId === u.id ? "on" : ""}`}
                      onClick={() => setCatalogId(u.id)}
                    >
                      <strong>{u.name}</strong>
                      <span className="hint">
                        T{u.tier ?? "?"} · {(u.roles || []).join(", ") || "—"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>

        <section className="armory-detail">
          {tab === "fleets" && selectedFleet && (
            <>
              <header className="armory-detail-head">
                <h3>{selectedFleet.name}</h3>
                <p className="hint">
                  {systemName(selectedFleet.systemId)} · стойка{" "}
                  {selectedFleet.stance}
                </p>
              </header>
              <h4>Состав</h4>
              <ul className="armory-comp">
                {(selectedFleet.composition ?? []).length === 0 ? (
                  <li className="hint">Состав не указан.</li>
                ) : (
                  (selectedFleet.composition ?? []).map((c, i) => {
                    const def = ships.find(
                      (s) => s.id === c.type || s.name === c.type,
                    );
                    return (
                      <li key={`${c.type}-${i}`}>
                        <button
                          type="button"
                          className="armory-comp-btn"
                          onClick={() => {
                            if (def) {
                              setTab("catalog");
                              setCatalogId(def.id);
                            }
                          }}
                        >
                          <strong>
                            {def?.name ?? c.type} ×{c.count}
                            <span
                              className="armory-vet-stars"
                              title={veterancyTooltip(c)}
                              aria-label={`Veterancy ${Math.min(5, Math.max(0, c.level ?? 0))}`}
                            >
                              {"★".repeat(Math.min(5, Math.max(0, c.level ?? 0)))}
                              {"☆".repeat(
                                Math.max(0, 5 - Math.min(5, Math.max(0, c.level ?? 0))),
                              )}
                            </span>
                          </strong>
                          {def?.stats && (
                            <span className="hint">
                              урон {def.stats.damage ?? "—"} · броня{" "}
                              {def.stats.armor ?? "—"} · HP{" "}
                              {def.stats.hp ?? "—"}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
              <div className="armory-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => onFocusOnMap?.(selectedFleet.systemId)}
                >
                  На карту
                </button>
                {onOrderWithFleet && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => onOrderWithFleet(selectedFleet.id)}
                  >
                    В очередь приказов…
                  </button>
                )}
              </div>
              <p className="hint">
                Снаряжение слотов (орудия / щиты / корпус) — следующий шаг
                конструктора; сейчас видны статы из каталога.
              </p>
            </>
          )}
          {tab === "fleets" && !selectedFleet && (
            <p className="hint">Выберите флот слева.</p>
          )}

          {tab === "legions" && selectedLegion && (
            <>
              <header className="armory-detail-head">
                <h3>{selectedLegion.name}</h3>
                <p className="hint">
                  {systemName(selectedLegion.systemId)} ·{" "}
                  {selectedLegion.status}
                </p>
              </header>
              <p className="hint">
                Сила: <strong>{selectedLegion.strength ?? "—"}</strong>
              </p>
              {(selectedLegion.composition ?? []).length > 0 && (
                <>
                  <h4>Состав</h4>
                  <ul className="armory-comp">
                    {(selectedLegion.composition ?? []).map((c, i) => {
                      const def = units.find(
                        (u) =>
                          u.id === c.defId ||
                          u.id === c.type ||
                          u.name === c.type,
                      );
                      return (
                        <li key={`${c.defId || c.type}-${i}`}>
                          <strong>
                            {def?.name ?? c.defId ?? c.type} ×{c.count}
                            <span
                              className="armory-vet-stars"
                              title={veterancyTooltip(c)}
                              aria-label={`Veterancy ${Math.min(5, Math.max(0, c.level ?? 0))}`}
                            >
                              {"★".repeat(
                                Math.min(5, Math.max(0, c.level ?? 0)),
                              )}
                              {"☆".repeat(
                                Math.max(
                                  0,
                                  5 - Math.min(5, Math.max(0, c.level ?? 0)),
                                ),
                              )}
                            </span>
                          </strong>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              <div className="armory-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => onFocusOnMap?.(selectedLegion.systemId)}
                >
                  На карту
                </button>
                {onOrderWithLegion && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => onOrderWithLegion(selectedLegion.id)}
                  >
                    В очередь приказов…
                  </button>
                )}
              </div>
            </>
          )}
          {tab === "legions" && !selectedLegion && (
            <p className="hint">Выберите легион слева.</p>
          )}

          {tab === "catalog" && catalogItem && (
            <div className="armory-unit-card">
              <header className="armory-detail-head">
                <p className="armory-unit-kicker">
                  T{catalogItem.tier ?? "?"} ·{" "}
                  {(catalogItem.roles || []).join(" · ") || "без роли"}
                </p>
                <h3>{catalogItem.name}</h3>
                <p className="hint">{catalogItem.id}</p>
              </header>
              <h4>Характеристики</h4>
              <dl className="armory-stats">
                {Object.entries(catalogItem.stats || {}).map(([k, v]) => (
                  <div key={k} className="armory-stat-chip">
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <h4>Слоты оснащения</h4>
              {(catalogItem.slots || []).length === 0 ? (
                <p className="hint">Слоты не заданы.</p>
              ) : (
                <ul className="armory-slots">
                  {(catalogItem.slots || []).map((s, i) => (
                    <li key={`${s.role}-${i}`}>
                      <strong>{s.role}</strong>
                      <span className="hint"> ×{s.count ?? 1}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {tab === "catalog" && !catalogItem && (
            <div className="hq-empty">
              <span className="hq-empty-reveal" aria-hidden />
              <p className="hint">Выберите тип юнита в каталоге.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
