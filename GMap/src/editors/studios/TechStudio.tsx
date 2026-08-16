import { useCallback, useEffect, useMemo, useState } from "react";
import { useCampaignSessionCtx } from "../CampaignSessionContext";
import { fetchContent, getCachedContent } from "../../state/contentCatalog";
import { ECO_CATEGORY_NAMES } from "../../viewer/economyFlowTypes";
import { RESEARCH_ERAS } from "../../viewer/research/techCellState";
import { StudioEffectList } from "./StudioEffectEditor";

export type TechEffect = {
  effect: string;
  args: Record<string, unknown>;
};

export type TechUpgrade = {
  id: string;
  name: string;
  cost: Record<string, number>;
  effects: TechEffect[];
  prerequisites?: string[];
  balanceBudget?: number;
};

export type TechEntry = {
  id: string;
  name: string;
  category: string;
  era: number;
  cost: Record<string, number>;
  prerequisites?: string[];
  effects?: TechEffect[];
  upgrades?: TechUpgrade[];
  gradeable?: boolean;
  sockets?: Array<{ role: string; label?: string; options: string[] }>;
  requiresRoleMilestone?: string;
  direction?: string;
  description?: string;
};

const CATEGORIES = (["A", "B", "C", "D", "E", "F"] as const).map((id) => ({
  id,
  label: `${id} · ${ECO_CATEGORY_NAMES[id]}`,
}));

export function TechStudio() {
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [techs, setTechs] = useState<Record<string, TechEntry>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [eraFilter, setEraFilter] = useState<number | "all">("all");
  const [busy, setBusy] = useState(false);
  const [viewMode, setViewMode] = useState<"visual" | "json">("visual");
  const [jsonText, setJsonText] = useState("");
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  const selectedTech = selectedId ? techs[selectedId] ?? null : null;

  const loadTechs = useCallback(async () => {
    setBusy(true);
    try {
      let raw: Record<string, TechEntry> | null = null;
      try {
        const res = await fetch("/api/gm/content/document?catalog=technologies", {
          headers: { "X-Master-Token": masterToken },
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok !== false) {
            raw = (data.document || data.data || data) as Record<string, TechEntry>;
          }
        }
      } catch {
        /* fallback to public content */
      }
      if (!raw || Object.keys(raw).length === 0) {
        const content = getCachedContent() || (await fetchContent(true));
        if (content?.technologies) {
          raw = content.technologies as unknown as Record<string, TechEntry>;
        }
      }
      if (raw && Object.keys(raw).length > 0) {
        setTechs(raw);
        if (!selectedId || !raw[selectedId]) {
          setSelectedId(Object.keys(raw)[0] ?? null);
        }
      }
    } catch (e) {
      setSyncMsg(`Ошибка загрузки технологий: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [masterToken, selectedId, setSyncMsg]);

  useEffect(() => {
    void loadTechs();
  }, [loadTechs]);

  useEffect(() => {
    if (selectedTech) {
      setJsonText(JSON.stringify(selectedTech, null, 2));
      setJsonErr(null);
    }
  }, [selectedTech]);

  const saveTech = async (tech: TechEntry) => {
    setBusy(true);
    try {
      const res = await fetch("/api/gm/content/entry?catalog=technologies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({ catalog: "technologies", key: tech.id, data: tech, value: tech }),
      });
      if (!res.ok) throw new Error(await res.text());
      setTechs((prev) => ({ ...prev, [tech.id]: tech }));
      await fetchContent();
      setSyncMsg(`✓ Технология «${tech.name}» сохранена`);
    } catch (e) {
      setSyncMsg(`Ошибка сохранения: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteTech = async (id: string) => {
    if (!confirm(`Удалить технологию «${techs[id]?.name || id}»?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/gm/content/entry?catalog=technologies&key=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "X-Master-Token": masterToken },
      });
      if (!res.ok) throw new Error(await res.text());
      setTechs((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      const remaining = Object.keys(techs).filter((k) => k !== id);
      setSelectedId(remaining[0] ?? null);
      await fetchContent();
      setSyncMsg(`Технология «${id}» удалена`);
    } catch (e) {
      setSyncMsg(`Ошибка удаления: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateNew = () => {
    const nextNum = Object.keys(techs).length + 1;
    const newId = `tech.custom_${Date.now().toString(36)}`;
    const newEntry: TechEntry = {
      id: newId,
      name: `Новая технология #${nextNum}`,
      category: "A",
      era: 1,
      cost: { "currency.cognitio": 15 },
      prerequisites: [],
      effects: [
        {
          effect: "unlock_tech_tier",
          args: { category: "A", to: 2 },
        },
      ],
      upgrades: [],
    };
    void saveTech(newEntry).then(() => {
      setSelectedId(newId);
    });
  };

  const filteredIds = useMemo(() => {
    return Object.keys(techs).filter((id) => {
      const t = techs[id];
      if (!t) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = t.name?.toLowerCase().includes(q);
        const matchId = id.toLowerCase().includes(q);
        if (!matchName && !matchId) return false;
      }
      if (catFilter !== "all" && t.category !== catFilter) return false;
      if (eraFilter !== "all" && t.era !== eraFilter) return false;
      return true;
    });
  }, [techs, search, catFilter, eraFilter]);

  return (
    <div className="studio-layout">
      {/* Sidebar: Tech list & filters */}
      <aside className="studio-sidebar">
        <div className="studio-sidebar-header">
          <div>
            <p className="panel-kicker">GM · Lab</p>
            <h3>Конструктор технологий</h3>
          </div>
          <button
            type="button"
            className="btn primary tiny"
            disabled={busy}
            onClick={handleCreateNew}
          >
            + Создать тех
          </button>
        </div>

        <div className="studio-search-box">
          <input
            type="text"
            className="studio-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск технологии..."
          />
        </div>

        {/* Category Filter */}
        <div className="studio-tag-filter">
          <button
            type="button"
            className={`studio-filter-chip ${catFilter === "all" ? "active" : ""}`}
            onClick={() => setCatFilter("all")}
          >
            Все ({Object.keys(techs).length})
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`studio-filter-chip ${catFilter === c.id ? "active" : ""}`}
              onClick={() => setCatFilter(c.id)}
            >
              Кат. {c.id}
            </button>
          ))}
        </div>

        {/* Era Filter */}
        <div className="studio-tag-filter" style={{ marginTop: 4 }}>
          <span className="studio-mini-label">Эра:</span>
          <button
            type="button"
            className={`studio-filter-chip ${eraFilter === "all" ? "active" : ""}`}
            onClick={() => setEraFilter("all")}
          >
            Все
          </button>
          {RESEARCH_ERAS.map((era) => (
            <button
              key={era}
              type="button"
              className={`studio-filter-chip ${eraFilter === era ? "active" : ""}`}
              onClick={() => setEraFilter(era)}
            >
              Эра {era}
            </button>
          ))}
        </div>

        <ul className="studio-items-list">
          {filteredIds.map((id) => {
            const t = techs[id];
            const isSelected = id === selectedId;
            const cognitioCost = t.cost?.["currency.cognitio"] ?? 0;
            return (
              <li
                key={id}
                className={`studio-item-card ${isSelected ? "is-selected" : ""}`}
                onClick={() => setSelectedId(id)}
              >
                <div className="studio-item-main">
                  <strong>{t.name || id}</strong>
                  <span className="studio-item-id">{id}</span>
                </div>
                <div className="studio-item-meta">
                  <span className="studio-badge is-accent">
                    Кат. {t.category} · Эра {t.era}
                  </span>
                  <span className="studio-badge">💡 {cognitioCost} Когн.</span>
                  {t.gradeable && <span className="studio-badge is-good">Грейды I–V</span>}
                  {t.sockets?.length ? (
                    <span className="studio-badge is-warn">Сокетов: {t.sockets.length}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Main Studio Area */}
      <main className="studio-workspace">
        {selectedTech ? (
          <div className="studio-detail-panel">
            <header className="studio-workspace-header">
              <div className="studio-title-group">
                <span className="studio-hero-icon">🔬</span>
                <div>
                  <input
                    type="text"
                    className="studio-title-input"
                    value={selectedTech.name || ""}
                    onChange={(e) => {
                      const updated = { ...selectedTech, name: e.target.value };
                      setTechs((prev) => ({ ...prev, [selectedTech.id]: updated }));
                    }}
                    onBlur={() => void saveTech(selectedTech)}
                    placeholder="Название технологии..."
                  />
                  <p className="hint">
                    ID: <code>{selectedTech.id}</code> · Категория {selectedTech.category} · Эра {selectedTech.era}
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
                  onClick={() => void saveTech(selectedTech)}
                >
                  {busy ? "Сохранение…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  className="btn danger"
                  disabled={busy}
                  onClick={() => void deleteTech(selectedTech.id)}
                >
                  Удалить
                </button>
              </div>
            </header>

            {viewMode === "visual" ? (
              <div className="studio-scroll-body">
                {/* Core Parameters */}
                <section className="studio-section-card">
                  <h4>Параметры и классификация</h4>
                  <div className="studio-grid-3">
                    <label className="studio-field">
                      <span className="studio-label">Категория</span>
                      <select
                        className="studio-select"
                        value={selectedTech.category}
                        onChange={(e) => {
                          const updated = { ...selectedTech, category: e.target.value };
                          setTechs((prev) => ({ ...prev, [selectedTech.id]: updated }));
                        }}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="studio-field">
                      <span className="studio-label">Эра развития</span>
                      <select
                        className="studio-select"
                        value={selectedTech.era}
                        onChange={(e) => {
                          const updated = {
                            ...selectedTech,
                            era: Number(e.target.value) || 1,
                          };
                          setTechs((prev) => ({ ...prev, [selectedTech.id]: updated }));
                        }}
                      >
                        {RESEARCH_ERAS.map((era) => (
                          <option key={era} value={era}>
                            Эра {era}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="studio-field">
                      <span className="studio-label">Стоимость (Когнитио 💡)</span>
                      <input
                        type="number"
                        min="1"
                        className="studio-input"
                        value={selectedTech.cost?.["currency.cognitio"] ?? 0}
                        onChange={(e) => {
                          const updated = {
                            ...selectedTech,
                            cost: {
                              ...selectedTech.cost,
                              "currency.cognitio": Number(e.target.value) || 0,
                            },
                          };
                          setTechs((prev) => ({ ...prev, [selectedTech.id]: updated }));
                        }}
                      />
                    </label>
                  </div>
                </section>

                {/* Sockets and Grading (P0/P1 Systems) */}
                <section className="studio-section-card">
                  <h4>Система грейдов I–V и Сокеты ресурсов</h4>
                  <div className="studio-form-grid">
                    <label className="alt-chip-btn is-selected" style={{ width: "fit-content" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedTech.gradeable)}
                        onChange={(e) => {
                          const updated = {
                            ...selectedTech,
                            gradeable: e.target.checked,
                          };
                          setTechs((prev) => ({ ...prev, [selectedTech.id]: updated }));
                        }}
                      />
                      <span>Разрешить улучшение грейда (I → V) с масштабированием эффекта</span>
                    </label>
                  </div>

                  {/* Sockets Builder */}
                  <div style={{ marginTop: 12 }}>
                    <div className="studio-section-head">
                      <span className="studio-label">Сокеты сырья:</span>
                      <button
                        type="button"
                        className="btn ghost tiny"
                        onClick={() => {
                          const nextSockets = [
                            ...(selectedTech.sockets || []),
                            {
                              role: "energy",
                              label: "Энерго-ячейка",
                              options: ["currency.solari", "currency.crystal"],
                            },
                          ];
                          const updated = { ...selectedTech, sockets: nextSockets };
                          setTechs((prev) => ({ ...prev, [selectedTech.id]: updated }));
                        }}
                      >
                        + Добавить сокет
                      </button>
                    </div>

                    {(selectedTech.sockets || []).map((sk, skIdx) => (
                      <div key={skIdx} className="studio-trait-card" style={{ marginTop: 6 }}>
                        <div className="studio-trait-header">
                          <input
                            type="text"
                            className="studio-input studio-input--sm"
                            value={sk.label || sk.role}
                            onChange={(e) => {
                              const copy = [...(selectedTech.sockets || [])];
                              copy[skIdx] = { ...copy[skIdx], label: e.target.value };
                              const updated = { ...selectedTech, sockets: copy };
                              setTechs((prev) => ({ ...prev, [selectedTech.id]: updated }));
                            }}
                            placeholder="Название сокета..."
                          />
                          <select
                            className="studio-select studio-select--sm"
                            value={sk.role}
                            onChange={(e) => {
                              const copy = [...(selectedTech.sockets || [])];
                              copy[skIdx] = { ...copy[skIdx], role: e.target.value };
                              const updated = { ...selectedTech, sockets: copy };
                              setTechs((prev) => ({ ...prev, [selectedTech.id]: updated }));
                            }}
                          >
                            <option value="energy">Энергия (Energy)</option>
                            <option value="catalyst">Катализатор (Catalyst)</option>
                            <option value="exotic">Экзотика (Exotic)</option>
                            <option value="organic">Биомасса (Organic)</option>
                          </select>
                          <button
                            type="button"
                            className="btn tiny danger"
                            onClick={() => {
                              const copy = (selectedTech.sockets || []).filter(
                                (_, i) => i !== skIdx,
                              );
                              const updated = { ...selectedTech, sockets: copy };
                              setTechs((prev) => ({ ...prev, [selectedTech.id]: updated }));
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Effects list */}
                <section className="studio-section-card">
                  <StudioEffectList
                    title="Эффекты при изучении технологии"
                    context="tech"
                    effects={(selectedTech.effects || []).map((e) => ({
                      effect: e.effect,
                      args: e.args,
                    }))}
                    onChange={(updatedEffects) => {
                      const updated = {
                        ...selectedTech,
                        effects: updatedEffects.map((e) => ({
                          effect: e.effect,
                          args: e.args || {},
                        })),
                      };
                      setTechs((prev) => ({ ...prev, [selectedTech.id]: updated }));
                    }}
                  />
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
                      const parsed = JSON.parse(e.target.value) as TechEntry;
                      setJsonErr(null);
                      setTechs((prev) => ({ ...prev, [selectedTech.id]: parsed }));
                    } catch (err) {
                      setJsonErr(err instanceof Error ? err.message : String(err));
                    }
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="studio-empty-state">
            <span className="studio-empty-icon">🔬</span>
            <p>Выберите технологию слева или создайте новую</p>
          </div>
        )}
      </main>
    </div>
  );
}
