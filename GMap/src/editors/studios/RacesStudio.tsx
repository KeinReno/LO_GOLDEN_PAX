import { useCallback, useEffect, useMemo, useState } from "react";
import { useCampaignSessionCtx } from "../CampaignSessionContext";
import { fetchContent, getCachedContent } from "../../state/contentCatalog";
import { StudioEffectList } from "./StudioEffectEditor";

export type RaceTraitEffect = {
  effect: string;
  args: Record<string, unknown>;
};

export type RaceTrait = {
  id: string;
  name?: string;
  effects: RaceTraitEffect[];
  balanceBudget: number;
};

export type RaceEntry = {
  id: string;
  name: string;
  lore?: string;
  tags?: string[];
  base?: string;
  parent?: string;
  forked_from?: string;
  traits?: RaceTrait[];
  customProps?: Record<string, unknown>;
};

const PRESET_TAGS = [
  "baseline",
  "adaptable",
  "synthetic",
  "cybernetic",
  "swarm",
  "lithoid",
  "aquatic",
  "psionic",
  "nomadic",
  "agrarian",
  "subterranean",
  "exotic",
];

export function RacesStudio() {
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [races, setRaces] = useState<Record<string, RaceEntry>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [viewMode, setViewMode] = useState<"visual" | "json">("visual");
  const [jsonText, setJsonText] = useState("");
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  const selectedRace = selectedId ? races[selectedId] ?? null : null;

  const loadRaces = useCallback(async () => {
    setBusy(true);
    try {
      let raw: Record<string, RaceEntry> | null = null;
      try {
        const res = await fetch("/api/gm/content/document?catalog=races", {
          headers: { "X-Master-Token": masterToken },
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok !== false) {
            raw = (data.document || data.data || data) as Record<string, RaceEntry>;
          }
        }
      } catch {
        /* fallback to public content */
      }
      if (!raw || Object.keys(raw).length === 0) {
        const content = getCachedContent() || (await fetchContent(true));
        if (content?.races) {
          raw = content.races as unknown as Record<string, RaceEntry>;
        }
      }
      if (raw && Object.keys(raw).length > 0) {
        setRaces(raw);
        if (!selectedId || !raw[selectedId]) {
          setSelectedId(Object.keys(raw)[0] ?? null);
        }
      }
    } catch (e) {
      setSyncMsg(`Ошибка загрузки рас: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [masterToken, selectedId, setSyncMsg]);

  useEffect(() => {
    void loadRaces();
  }, [loadRaces]);

  useEffect(() => {
    if (selectedRace) {
      setJsonText(JSON.stringify(selectedRace, null, 2));
      setJsonErr(null);
    }
  }, [selectedRace]);

  const saveRace = async (race: RaceEntry) => {
    setBusy(true);
    try {
      const res = await fetch("/api/gm/content/entry?catalog=races", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({ catalog: "races", key: race.id, data: race, value: race }),
      });
      if (!res.ok) throw new Error(await res.text());
      setRaces((prev) => ({ ...prev, [race.id]: race }));
      await fetchContent();
      setSyncMsg(`✓ Раса «${race.name}» сохранена`);
    } catch (e) {
      setSyncMsg(`Ошибка сохранения: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteRace = async (id: string) => {
    if (!confirm(`Удалить расу «${races[id]?.name || id}»?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/gm/content/entry?catalog=races&key=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "X-Master-Token": masterToken },
      });
      if (!res.ok) throw new Error(await res.text());
      setRaces((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      const remaining = Object.keys(races).filter((k) => k !== id);
      setSelectedId(remaining[0] ?? null);
      await fetchContent();
      setSyncMsg(`Раса «${id}» удалена`);
    } catch (e) {
      setSyncMsg(`Ошибка удаления: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateNew = () => {
    const nextNum = Object.keys(races).length + 1;
    const newId = `race_custom_${Date.now().toString(36)}`;
    const newEntry: RaceEntry = {
      id: newId,
      name: `Новая цивилизация #${nextNum}`,
      tags: ["baseline", "adaptable"],
      traits: [
        {
          id: `trait.${newId}.core`,
          name: "Базовый признак",
          balanceBudget: 0,
          effects: [
            {
              effect: "production_mult",
              args: { mult: 1.05, resource: "currency.supply" },
            },
          ],
        },
      ],
    };
    void saveRace(newEntry).then(() => {
      setSelectedId(newId);
    });
  };

  const filteredIds = useMemo(() => {
    return Object.keys(races).filter((id) => {
      const r = races[id];
      if (!r) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = r.name?.toLowerCase().includes(q);
        const matchId = id.toLowerCase().includes(q);
        const matchTag = r.tags?.some((t) => t.toLowerCase().includes(q));
        if (!matchName && !matchId && !matchTag) return false;
      }
      if (tagFilter !== "all") {
        if (!r.tags?.includes(tagFilter)) return false;
      }
      return true;
    });
  }, [races, search, tagFilter]);

  const calculateTotalBudget = (traits?: RaceTrait[]) => {
    return (traits || []).reduce((acc, t) => acc + (Number(t.balanceBudget) || 0), 0);
  };

  return (
    <div className="studio-layout">
      {/* Sidebar: Race List */}
      <aside className="studio-sidebar">
        <div className="studio-sidebar-header">
          <div>
            <p className="panel-kicker">GM · Genesis</p>
            <h3>Редактор рас</h3>
          </div>
          <button
            type="button"
            className="btn primary tiny"
            disabled={busy}
            onClick={handleCreateNew}
          >
            + Создать расу
          </button>
        </div>

        <div className="studio-search-box">
          <input
            type="text"
            className="studio-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск расы / тега..."
          />
        </div>

        <div className="studio-tag-filter">
          <button
            type="button"
            className={`studio-filter-chip ${tagFilter === "all" ? "active" : ""}`}
            onClick={() => setTagFilter("all")}
          >
            Все ({Object.keys(races).length})
          </button>
          {PRESET_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              className={`studio-filter-chip ${tagFilter === t ? "active" : ""}`}
              onClick={() => setTagFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <ul className="studio-items-list">
          {filteredIds.map((id) => {
            const r = races[id];
            const isSelected = id === selectedId;
            const totalBudget = calculateTotalBudget(r.traits);
            return (
              <li
                key={id}
                className={`studio-item-card ${isSelected ? "is-selected" : ""}`}
                onClick={() => setSelectedId(id)}
              >
                <div className="studio-item-main">
                  <strong>{r.name || id}</strong>
                  <span className="studio-item-id">{id}</span>
                </div>
                <div className="studio-item-meta">
                  <span className="studio-badge">
                    Трейтов: {r.traits?.length || 0}
                  </span>
                  <span
                    className={`studio-badge ${
                      totalBudget > 0
                        ? "is-good"
                        : totalBudget < 0
                          ? "is-warn"
                          : "is-neutral"
                    }`}
                  >
                    Бюджет: {totalBudget > 0 ? `+${totalBudget}` : totalBudget}
                  </span>
                </div>
                {r.tags && r.tags.length > 0 && (
                  <div className="studio-tags-row">
                    {r.tags.map((tg) => (
                      <span key={tg} className="studio-tag">
                        {tg}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Main Studio Area */}
      <main className="studio-workspace">
        {selectedRace ? (
          <div className="studio-detail-panel">
            <header className="studio-workspace-header">
              <div className="studio-title-group">
                <span className="studio-hero-icon">🧬</span>
                <div>
                  <input
                    type="text"
                    className="studio-title-input"
                    value={selectedRace.name || ""}
                    onChange={(e) => {
                      const updated = { ...selectedRace, name: e.target.value };
                      setRaces((prev) => ({ ...prev, [selectedRace.id]: updated }));
                    }}
                    onBlur={() => void saveRace(selectedRace)}
                    placeholder="Название цивилизации..."
                  />
                  <p className="hint">
                    ID: <code>{selectedRace.id}</code>
                    {selectedRace.base ? ` · Подраса от «${selectedRace.base}»` : ""}
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
                  onClick={() => void saveRace(selectedRace)}
                >
                  {busy ? "Сохранение…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  className="btn danger"
                  disabled={busy}
                  onClick={() => void deleteRace(selectedRace.id)}
                >
                  Удалить
                </button>
              </div>
            </header>

            {viewMode === "visual" ? (
              <div className="studio-scroll-body">
                {/* Section 1: Core Profile & Tags */}
                <section className="studio-section-card">
                  <h4>Паспорт цивилизации & Теги</h4>
                  <div className="studio-form-grid">
                    <label className="studio-field">
                      <span className="studio-label">Описание / Лор</span>
                      <textarea
                        className="studio-textarea"
                        rows={2}
                        value={selectedRace.lore || ""}
                        onChange={(e) => {
                          const updated = { ...selectedRace, lore: e.target.value };
                          setRaces((prev) => ({ ...prev, [selectedRace.id]: updated }));
                        }}
                        placeholder="Происхождение, физиология, менталитет..."
                      />
                    </label>

                    <label className="studio-field">
                      <span className="studio-label">Базовая раса (для подрас)</span>
                      <select
                        className="studio-select"
                        value={selectedRace.base || ""}
                        onChange={(e) => {
                          const val = e.target.value || undefined;
                          const updated = { ...selectedRace, base: val };
                          setRaces((prev) => ({ ...prev, [selectedRace.id]: updated }));
                        }}
                      >
                        <option value="">— Самостоятельная раса —</option>
                        {Object.keys(races)
                          .filter((k) => k !== selectedRace.id)
                          .map((k) => (
                            <option key={k} value={k}>
                              {races[k]?.name || k} ({k})
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <span className="studio-label">Теги и особенности</span>
                    <div className="studio-chips-builder">
                      {PRESET_TAGS.map((tg) => {
                        const active = selectedRace.tags?.includes(tg);
                        return (
                          <button
                            key={tg}
                            type="button"
                            className={`alt-chip-btn ${active ? "is-selected" : ""}`}
                            onClick={() => {
                              const cur = selectedRace.tags || [];
                              const next = active
                                ? cur.filter((x) => x !== tg)
                                : [...cur, tg];
                              const updated = { ...selectedRace, tags: next };
                              setRaces((prev) => ({ ...prev, [selectedRace.id]: updated }));
                            }}
                          >
                            {tg}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>

                {/* Section 2: Race Traits & Balance */}
                <section className="studio-section-card">
                  <div className="studio-section-head">
                    <div>
                      <h4>Видовые трейты & Баланс</h4>
                      <p className="hint">
                        Суммарный баланс-бюджет:{" "}
                        <strong
                          style={{
                            color:
                              calculateTotalBudget(selectedRace.traits) >= 0
                                ? "var(--signal-build, #22c55e)"
                                : "var(--signal-warning, #eab308)",
                          }}
                        >
                          {calculateTotalBudget(selectedRace.traits) > 0
                            ? `+${calculateTotalBudget(selectedRace.traits)}`
                            : calculateTotalBudget(selectedRace.traits)}
                        </strong>{" "}
                        (рекомендуется в пределах 0.0 .. 2.0)
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn ghost tiny"
                      onClick={() => {
                        const nextTrait: RaceTrait = {
                          id: `trait.${selectedRace.id}.${Date.now().toString(36)}`,
                          name: "Новый трейт",
                          balanceBudget: 0.5,
                          effects: [
                            {
                              effect: "production_mult",
                              args: { mult: 1.05 },
                            },
                          ],
                        };
                        const updated = {
                          ...selectedRace,
                          traits: [...(selectedRace.traits || []), nextTrait],
                        };
                        setRaces((prev) => ({ ...prev, [selectedRace.id]: updated }));
                      }}
                    >
                      + Добавить трейт
                    </button>
                  </div>

                  <div className="studio-traits-list">
                    {(selectedRace.traits || []).map((tr, trIdx) => (
                      <div key={tr.id || trIdx} className="studio-trait-card">
                        <div className="studio-trait-header">
                          <input
                            type="text"
                            className="studio-input studio-input--sm"
                            value={tr.name || tr.id}
                            onChange={(e) => {
                              const copy = [...(selectedRace.traits || [])];
                              copy[trIdx] = { ...copy[trIdx], name: e.target.value };
                              const updated = { ...selectedRace, traits: copy };
                              setRaces((prev) => ({ ...prev, [selectedRace.id]: updated }));
                            }}
                            placeholder="Название трейта..."
                          />
                          <div className="studio-trait-budget">
                            <span className="hint">Бюджет:</span>
                            <input
                              type="number"
                              step="0.5"
                              className="studio-input studio-input--num"
                              value={tr.balanceBudget ?? 0}
                              onChange={(e) => {
                                const copy = [...(selectedRace.traits || [])];
                                copy[trIdx] = {
                                  ...copy[trIdx],
                                  balanceBudget: Number(e.target.value) || 0,
                                };
                                const updated = { ...selectedRace, traits: copy };
                                setRaces((prev) => ({ ...prev, [selectedRace.id]: updated }));
                              }}
                            />
                          </div>
                          <button
                            type="button"
                            className="btn tiny danger"
                            onClick={() => {
                              const copy = (selectedRace.traits || []).filter(
                                (_, idx) => idx !== trIdx,
                              );
                              const updated = { ...selectedRace, traits: copy };
                              setRaces((prev) => ({ ...prev, [selectedRace.id]: updated }));
                            }}
                          >
                            ✕
                          </button>
                        </div>

                        {/* Effects inside Trait */}
                        <div style={{ marginTop: 8 }}>
                          <StudioEffectList
                            title="Эффекты трейта"
                            context="race"
                            effects={(tr.effects || []).map((e) => ({
                              effect: e.effect,
                              args: e.args,
                            }))}
                            onChange={(updatedEffs) => {
                              const copyTraits = [...(selectedRace.traits || [])];
                              copyTraits[trIdx] = {
                                ...copyTraits[trIdx],
                                effects: updatedEffs.map((e) => ({
                                  effect: e.effect,
                                  args: e.args || {},
                                })),
                              };
                              const updated = { ...selectedRace, traits: copyTraits };
                              setRaces((prev) => ({ ...prev, [selectedRace.id]: updated }));
                            }}
                          />
                        </div>
                      </div>
                    ))}
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
                      const parsed = JSON.parse(e.target.value) as RaceEntry;
                      setJsonErr(null);
                      setRaces((prev) => ({ ...prev, [selectedRace.id]: parsed }));
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
            <span className="studio-empty-icon">🧬</span>
            <p>Выберите расу слева или создайте новую</p>
          </div>
        )}
      </main>
    </div>
  );
}
