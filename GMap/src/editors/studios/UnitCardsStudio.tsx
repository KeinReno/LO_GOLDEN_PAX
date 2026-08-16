import { useCallback, useEffect, useMemo, useState } from "react";
import { Heart, Hexagon, Rocket, Shield, Swords } from "lucide-react";
import { useCampaignSessionCtx } from "../CampaignSessionContext";
import { fetchContent, getCachedContent } from "../../state/contentCatalog";
import { cardProvidesEscort, roleLabel } from "../../state/cardBattleHints";
import { CombatCardMeta } from "../../viewer/forces/CombatCardMeta";

export type UnitStats = {
  damage?: number;
  armor?: number;
  defense?: number;
  shields?: number;
  hp?: number;
  accuracy?: number;
  speed?: number;
};

export type UnitSlot = {
  role: string;
  count: number;
  require?: {
    properties?: string[];
    tier?: string;
    category?: string;
  };
};

export type UnitCardEntry = {
  id: string;
  name: string;
  kind?: "ship" | "unit";
  faction?: string;
  tier: number;
  roles: string[];
  stats: UnitStats;
  keywords?: string[];
  energyCost?: number;
  slots?: UnitSlot[];
  targeting?: string;
  theaterMult?: {
    space?: number;
    assault?: number;
    ground?: number;
  };
};

const COMBAT_ROLES = [
  { id: "strike", label: "Ударный (Strike)" },
  { id: "escort", label: "Эскорт / Прикрытие (Escort)" },
  { id: "support", label: "Поддержка (Support)" },
  { id: "siege", label: "Осадный / Прорыв (Siege)" },
  { id: "screen", label: "Заслон / Разведка (Screen)" },
  { id: "capital", label: "Линейный (Capital)" },
  { id: "flagship", label: "Флагман (Flagship)" },
  { id: "infantry", label: "Пехота (Infantry)" },
  { id: "armor", label: "Бронетехника (Armor)" },
  { id: "artillery", label: "Артиллерия (Artillery)" },
];

const KEYWORDS = [
  { id: "escort", label: "🛡 Эскорт (−15% входящего урона соседям)" },
  { id: "support", label: "⚡ Поддержка (+15% исходящего урона союзникам)" },
  { id: "overwhelm", label: "💥 Прорыв (избыток урона переливается в базу)" },
  { id: "siege", label: "🏰 Осада (+50% урона по базам и укреплениям)" },
  { id: "brace", label: "🧱 Упорство (блокирует критический урон)" },
  { id: "first_strike", label: "⚡ Первый удар (наносит урон до ответа)" },
];

export function UnitCardsStudio() {
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [activeCatalog, setActiveCatalog] = useState<"ships" | "units">("ships");
  const [entries, setEntries] = useState<Record<string, UnitCardEntry>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<number | "all">("all");
  const [busy, setBusy] = useState(false);
  const [viewMode, setViewMode] = useState<"visual" | "json">("visual");
  const [jsonText, setJsonText] = useState("");
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  const selectedUnit = selectedId ? entries[selectedId] ?? null : null;

  const loadEntries = useCallback(async () => {
    setBusy(true);
    try {
      let raw: Record<string, UnitCardEntry> | null = null;
      try {
        const res = await fetch(`/api/gm/content/document?catalog=${activeCatalog}`, {
          headers: { "X-Master-Token": masterToken },
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok !== false) {
            raw = (data.document || data.data || data) as Record<string, UnitCardEntry>;
          }
        }
      } catch {
        /* fallback to public content */
      }
      if (!raw || Object.keys(raw).length === 0) {
        const content = getCachedContent() || (await fetchContent(true));
        if (content) {
          if (activeCatalog === "ships" && content.ships) {
            raw = content.ships as unknown as Record<string, UnitCardEntry>;
          } else if (activeCatalog === "units" && content.units) {
            raw = content.units as unknown as Record<string, UnitCardEntry>;
          }
        }
      }
      if (raw && Object.keys(raw).length > 0) {
        setEntries(raw);
        if (!selectedId || !raw[selectedId]) {
          setSelectedId(Object.keys(raw)[0] ?? null);
        }
      }
    } catch (e) {
      setSyncMsg(`Ошибка загрузки: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [activeCatalog, masterToken, selectedId, setSyncMsg]);

  useEffect(() => {
    void loadEntries();
  }, [activeCatalog]);

  useEffect(() => {
    if (selectedUnit) {
      setJsonText(JSON.stringify(selectedUnit, null, 2));
      setJsonErr(null);
    }
  }, [selectedUnit]);

  const saveUnit = async (unit: UnitCardEntry) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/gm/content/entry?catalog=${activeCatalog}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({ catalog: activeCatalog, key: unit.id, data: unit, value: unit }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEntries((prev) => ({ ...prev, [unit.id]: unit }));
      await fetchContent();
      setSyncMsg(`✓ Сохранено: «${unit.name}»`);
    } catch (e) {
      setSyncMsg(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteUnit = async (id: string) => {
    if (!confirm(`Удалить «${entries[id]?.name || id}»?`)) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/gm/content/entry?catalog=${activeCatalog}&key=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: { "X-Master-Token": masterToken },
        },
      );
      if (!res.ok) throw new Error(await res.text());
      setEntries((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      const remaining = Object.keys(entries).filter((k) => k !== id);
      setSelectedId(remaining[0] ?? null);
      await fetchContent();
      setSyncMsg(`Удалено: «${id}»`);
    } catch (e) {
      setSyncMsg(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateNew = () => {
    const nextNum = Object.keys(entries).length + 1;
    const prefix = activeCatalog === "ships" ? "ship.custom" : "unit.custom";
    const newId = `${prefix}_${Date.now().toString(36)}`;
    const newEntry: UnitCardEntry = {
      id: newId,
      name: `${activeCatalog === "ships" ? "Корабль" : "Юнит"} #${nextNum}`,
      faction: "generic",
      tier: 1,
      roles: activeCatalog === "ships" ? ["screen"] : ["infantry"],
      energyCost: 1,
      stats: {
        damage: 6,
        armor: 4,
        shields: 2,
        hp: 30,
        accuracy: 70,
        speed: 4,
      },
      slots: [
        { role: "weapon", count: 1 },
        { role: "hull", count: 1 },
      ],
      keywords: ["escort"],
    };
    void saveUnit(newEntry).then(() => {
      setSelectedId(newId);
    });
  };

  const filteredIds = useMemo(() => {
    return Object.keys(entries).filter((id) => {
      const u = entries[id];
      if (!u) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = u.name?.toLowerCase().includes(q);
        const matchId = id.toLowerCase().includes(q);
        if (!matchName && !matchId) return false;
      }
      if (tierFilter !== "all" && u.tier !== tierFilter) return false;
      return true;
    });
  }, [entries, search, tierFilter]);

  const energyCost =
    selectedUnit?.energyCost ??
    (selectedUnit?.tier ? Math.max(1, selectedUnit.tier) : 1);
  const previewRole = selectedUnit?.roles?.[0] || "strike";
  const previewHp = selectedUnit?.stats.hp ?? 0;
  const previewDmg = selectedUnit?.stats.damage ?? 0;
  const previewShields = selectedUnit?.stats.shields ?? 0;
  const previewEscort = selectedUnit
    ? cardProvidesEscort({
        role: previewRole,
        bonusKeywords: selectedUnit.keywords,
      })
    : false;

  return (
    <div className="studio-layout">
      {/* Sidebar: Units/Ships list */}
      <aside className="studio-sidebar">
        <div className="studio-sidebar-header">
          <div>
            <p className="panel-kicker">GM · Forge</p>
            <h3>Конструктор карт & юнитов</h3>
          </div>
          <button
            type="button"
            className="btn primary tiny"
            disabled={busy}
            onClick={handleCreateNew}
          >
            + Создать карту
          </button>
        </div>

        {/* Catalog Selector: Ships vs Ground Units */}
        <div className="gm-mode-switch" style={{ margin: "6px 0" }}>
          <button
            type="button"
            className={`gm-mode-btn ${activeCatalog === "ships" ? "on" : ""}`}
            onClick={() => setActiveCatalog("ships")}
          >
            🚀 Корабли флота
          </button>
          <button
            type="button"
            className={`gm-mode-btn ${activeCatalog === "units" ? "on" : ""}`}
            onClick={() => setActiveCatalog("units")}
          >
            🛡 Наземные легионы
          </button>
        </div>

        <div className="studio-search-box">
          <input
            type="text"
            className="studio-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию / ID..."
          />
        </div>

        {/* Tier Filter */}
        <div className="studio-tag-filter">
          <button
            type="button"
            className={`studio-filter-chip ${tierFilter === "all" ? "active" : ""}`}
            onClick={() => setTierFilter("all")}
          >
            Все тиры
          </button>
          {[1, 2, 3, 4, 5].map((t) => (
            <button
              key={t}
              type="button"
              className={`studio-filter-chip ${tierFilter === t ? "active" : ""}`}
              onClick={() => setTierFilter(t)}
            >
              Тир {t}
            </button>
          ))}
        </div>

        <ul className="studio-items-list">
          {filteredIds.map((id) => {
            const u = entries[id];
            const isSelected = id === selectedId;
            const dmg = u.stats?.damage ?? 0;
            const hp = u.stats?.hp ?? 0;
            return (
              <li
                key={id}
                className={`studio-item-card ${isSelected ? "is-selected" : ""}`}
                onClick={() => setSelectedId(id)}
              >
                <div className="studio-item-main">
                  <strong>{u.name || id}</strong>
                  <span className="studio-item-id">{id}</span>
                </div>
                <div className="studio-item-meta">
                  <span className="studio-badge is-accent">Тир {u.tier}</span>
                  <span className="studio-badge is-warn">⚔ {dmg}</span>
                  <span className="studio-badge is-good">❤ {hp}</span>
                  <span className="studio-badge">⚡ {u.energyCost ?? u.tier}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Main Studio Area */}
      <main className="studio-workspace">
        {selectedUnit ? (
          <div className="studio-unit-layout">
            <div className="studio-detail-panel" style={{ flex: "1 1 60%" }}>
              <header className="studio-workspace-header">
                <div className="studio-title-group">
                  <span className="studio-hero-icon">
                    {activeCatalog === "ships" ? "🚀" : "🛡"}
                  </span>
                  <div>
                    <input
                      type="text"
                      className="studio-title-input"
                      value={selectedUnit.name || ""}
                      onChange={(e) => {
                        const updated = { ...selectedUnit, name: e.target.value };
                        setEntries((prev) => ({ ...prev, [selectedUnit.id]: updated }));
                      }}
                      onBlur={() => void saveUnit(selectedUnit)}
                      placeholder="Название единицы..."
                    />
                    <p className="hint">
                      ID: <code>{selectedUnit.id}</code> · Фракция: {selectedUnit.faction || "generic"}
                    </p>
                  </div>
                </div>

                <div className="studio-header-actions">
                  <div className="gm-mode-switch">
                    <button
                      type="button"
                      className={`gm-mode-btn ${viewMode === "visual" ? "on" : ""}`}
                      onClick={() => setViewMode("visual")}
                    >
                      Форма
                    </button>
                    <button
                      type="button"
                      className={`gm-mode-btn ${viewMode === "json" ? "on" : ""}`}
                      onClick={() => setViewMode("json")}
                    >
                      JSON
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => void saveUnit(selectedUnit)}
                  >
                    {busy ? "Сохранение…" : "Сохранить"}
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    disabled={busy}
                    onClick={() => void deleteUnit(selectedUnit.id)}
                  >
                    Удалить
                  </button>
                </div>
              </header>

              {viewMode === "visual" ? (
                <div className="studio-scroll-body">
                  {/* Basic Stats Grid */}
                  <section className="studio-section-card">
                    <h4>Боевые характеристики (Stats)</h4>
                    <div className="studio-grid-3">
                      <label className="studio-field">
                        <span className="studio-label">Тир корабля / юнита</span>
                        <input
                          type="number"
                          min="1"
                          max="5"
                          className="studio-input"
                          value={selectedUnit.tier}
                          onChange={(e) => {
                            const updated = {
                              ...selectedUnit,
                              tier: Number(e.target.value) || 1,
                            };
                            setEntries((prev) => ({ ...prev, [selectedUnit.id]: updated }));
                          }}
                        />
                      </label>

                      <label className="studio-field">
                        <span className="studio-label">Стоимость энергии ⚡</span>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          className="studio-input"
                          value={selectedUnit.energyCost ?? selectedUnit.tier}
                          onChange={(e) => {
                            const updated = {
                              ...selectedUnit,
                              energyCost: Number(e.target.value) || 1,
                            };
                            setEntries((prev) => ({ ...prev, [selectedUnit.id]: updated }));
                          }}
                        />
                      </label>

                      <label className="studio-field">
                        <span className="studio-label">Урон (Damage ⚔)</span>
                        <input
                          type="number"
                          className="studio-input"
                          value={selectedUnit.stats.damage ?? 0}
                          onChange={(e) => {
                            const updated = {
                              ...selectedUnit,
                              stats: {
                                ...selectedUnit.stats,
                                damage: Number(e.target.value) || 0,
                              },
                            };
                            setEntries((prev) => ({ ...prev, [selectedUnit.id]: updated }));
                          }}
                        />
                      </label>

                      <label className="studio-field">
                        <span className="studio-label">Здоровье корпуса (HP ❤)</span>
                        <input
                          type="number"
                          className="studio-input"
                          value={selectedUnit.stats.hp ?? 0}
                          onChange={(e) => {
                            const updated = {
                              ...selectedUnit,
                              stats: {
                                ...selectedUnit.stats,
                                hp: Number(e.target.value) || 0,
                              },
                            };
                            setEntries((prev) => ({ ...prev, [selectedUnit.id]: updated }));
                          }}
                        />
                      </label>

                      <label className="studio-field">
                        <span className="studio-label">Броня / Защита (Armor 🛡)</span>
                        <input
                          type="number"
                          className="studio-input"
                          value={selectedUnit.stats.armor ?? selectedUnit.stats.defense ?? 0}
                          onChange={(e) => {
                            const updated = {
                              ...selectedUnit,
                              stats: {
                                ...selectedUnit.stats,
                                armor: Number(e.target.value) || 0,
                              },
                            };
                            setEntries((prev) => ({ ...prev, [selectedUnit.id]: updated }));
                          }}
                        />
                      </label>

                      <label className="studio-field">
                        <span className="studio-label">Энергощиты (Shields 🌐)</span>
                        <input
                          type="number"
                          className="studio-input"
                          value={selectedUnit.stats.shields ?? 0}
                          onChange={(e) => {
                            const updated = {
                              ...selectedUnit,
                              stats: {
                                ...selectedUnit.stats,
                                shields: Number(e.target.value) || 0,
                              },
                            };
                            setEntries((prev) => ({ ...prev, [selectedUnit.id]: updated }));
                          }}
                        />
                      </label>
                    </div>
                  </section>

                  {/* Combat Roles & Keywords */}
                  <section className="studio-section-card">
                    <h4>Ключевые слова и Боевые ауры</h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <span className="studio-label">Роли:</span>
                      <div className="studio-chips-builder">
                        {COMBAT_ROLES.map((r) => {
                          const active = selectedUnit.roles?.includes(r.id);
                          return (
                            <button
                              key={r.id}
                              type="button"
                              className={`alt-chip-btn ${active ? "is-selected" : ""}`}
                              onClick={() => {
                                const cur = selectedUnit.roles || [];
                                const next = active
                                  ? cur.filter((x) => x !== r.id)
                                  : [...cur, r.id];
                                const updated = { ...selectedUnit, roles: next };
                                setEntries((prev) => ({ ...prev, [selectedUnit.id]: updated }));
                              }}
                            >
                              {r.label}
                            </button>
                          );
                        })}
                      </div>

                      <span className="studio-label" style={{ marginTop: 8 }}>
                        Ауры и спец-свойства (Keywords):
                      </span>
                      <div className="studio-chips-builder">
                        {KEYWORDS.map((kw) => {
                          const active = selectedUnit.keywords?.includes(kw.id);
                          return (
                            <button
                              key={kw.id}
                              type="button"
                              className={`alt-chip-btn ${active ? "is-selected" : ""}`}
                              onClick={() => {
                                const cur = selectedUnit.keywords || [];
                                const next = active
                                  ? cur.filter((x) => x !== kw.id)
                                  : [...cur, kw.id];
                                const updated = { ...selectedUnit, keywords: next };
                                setEntries((prev) => ({ ...prev, [selectedUnit.id]: updated }));
                              }}
                            >
                              {kw.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="studio-json-editor">
                  {jsonErr && <p className="hint is-err">{jsonErr}</p>}
                  <textarea
                    className="studio-json-textarea"
                    value={jsonText}
                    onChange={(e) => {
                      setJsonText(e.target.value);
                      try {
                        const parsed = JSON.parse(e.target.value) as UnitCardEntry;
                        setJsonErr(null);
                        setEntries((prev) => ({ ...prev, [selectedUnit.id]: parsed }));
                      } catch (err) {
                        setJsonErr(err instanceof Error ? err.message : String(err));
                      }
                    }}
                  />
                </div>
              )}
            </div>

            {/* Live CCG Card Preview Panel */}
            <aside className="studio-card-preview-panel">
              <h4>Живой предпросмотр боевой карты</h4>
              <p className="hint">Так карта выглядит в бою на столе</p>

              <div className="cbt-preview-card-wrap">
                <div
                  className={[
                    "cbt-front-card",
                    "cbt-front-card--preview",
                    previewEscort ? "is-escort is-source-escort" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="cbt-card-header">
                    <strong className="cbt-card-title">{selectedUnit.name}</strong>
                    <span className="cbt-card-sub">
                      {roleLabel(previewRole)} · Тир {selectedUnit.tier}
                    </span>
                  </div>

                  <div className="cbt-card-art-box">
                    <span className="cbt-card-art-icon">
                      {activeCatalog === "ships" ? (
                        <Rocket size={28} strokeWidth={1.6} aria-hidden />
                      ) : (
                        <Shield size={28} strokeWidth={1.6} aria-hidden />
                      )}
                    </span>
                  </div>

                  <div className="cbt-card-stats">
                    <CombatCardMeta
                      role={previewRole}
                      energyCost={energyCost}
                      bonusKeywords={selectedUnit.keywords}
                      showMatchup
                      hpPercent={previewHp > 0 ? 100 : null}
                    />
                    <span className="cbt-stat cbt-stat--dmg" title="Урон">
                      <Swords size={12} aria-hidden /> {previewDmg}
                    </span>
                    <span className="cbt-stat cbt-stat--hp" title="HP">
                      <Heart size={12} aria-hidden /> {previewHp}/{previewHp || 1}
                    </span>
                    {previewShields > 0 && (
                      <span className="cbt-stat cbt-stat--shield" title="Щиты">
                        <Hexagon size={12} aria-hidden /> {previewShields}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        ) : (
          <div className="studio-empty-state">
            <span className="studio-empty-icon">🚀</span>
            <p>Выберите боевую единицу слева или создайте новую</p>
          </div>
        )}
      </main>
    </div>
  );
}
