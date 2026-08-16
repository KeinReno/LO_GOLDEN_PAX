import { useCallback, useEffect, useMemo, useState } from "react";
import { useCampaignSessionCtx } from "../CampaignSessionContext";
import { fetchContent, getCachedContent } from "../../state/contentCatalog";
import { StudioEffectList } from "./StudioEffectEditor";

export type BuildingEffect = {
  effect: string;
  args: Record<string, unknown>;
};

export type BuildingEntry = {
  id: string;
  name: string;
  zone?: "surface" | "orbit" | "deep_space";
  kind?: string;
  category?: string;
  tier: number;
  faction?: string;
  cost?: Record<string, number>;
  effects?: BuildingEffect[];
  slots?: Array<{ role: string; count: number; require?: Record<string, unknown> }>;
  upkeep_slots?: Array<{ count: number; require?: Record<string, unknown>; per?: string }>;
  laborSlots?: number;
  signature?: string;
  tradeoff?: string;
};

const ZONES = [
  { id: "surface", label: "Планетарная поверхность (Surface)" },
  { id: "orbit", label: "Орбитальные сооружения (Orbit)" },
  { id: "deep_space", label: "Глубокий космос / Мегаструктуры (Deep Space)" },
];

const CATEGORIES = ["A", "B", "C", "D", "E", "F"];

export function BuildingStudio() {
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [activeCatalog, setActiveCatalog] = useState<"buildings" | "stations" | "space_objects">("buildings");
  const [entries, setEntries] = useState<Record<string, BuildingEntry>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [viewMode, setViewMode] = useState<"visual" | "json">("visual");
  const [jsonText, setJsonText] = useState("");
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  const selectedBuilding = selectedId ? entries[selectedId] ?? null : null;

  const loadEntries = useCallback(async () => {
    setBusy(true);
    try {
      let raw: Record<string, BuildingEntry> | null = null;
      try {
        const res = await fetch(`/api/gm/content/document?catalog=${activeCatalog}`, {
          headers: { "X-Master-Token": masterToken },
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok !== false) {
            const doc = (data.document || data.data || data) as Record<string, unknown>;
            raw = ((doc && typeof doc === "object" && "objects" in doc && doc.objects)
              ? doc.objects
              : doc) as Record<string, BuildingEntry>;
          }
        }
      } catch {
        /* fallback to public content */
      }
      if (!raw || Object.keys(raw).length === 0) {
        const content = getCachedContent() || (await fetchContent(true));
        if (content) {
          if (activeCatalog === "buildings" && content.buildings) {
            raw = content.buildings as unknown as Record<string, BuildingEntry>;
          } else if (activeCatalog === "stations" && content.stations) {
            raw = content.stations as unknown as Record<string, BuildingEntry>;
          } else if (activeCatalog === "space_objects" && content.space_objects?.objects) {
            raw = content.space_objects.objects as unknown as Record<string, BuildingEntry>;
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
    if (selectedBuilding) {
      setJsonText(JSON.stringify(selectedBuilding, null, 2));
      setJsonErr(null);
    }
  }, [selectedBuilding]);

  const saveBuilding = async (building: BuildingEntry) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/gm/content/entry?catalog=${activeCatalog}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({
          catalog: activeCatalog,
          key: building.id,
          bag: activeCatalog === "space_objects" ? "objects" : undefined,
          data: building,
          value: building,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEntries((prev) => ({ ...prev, [building.id]: building }));
      await fetchContent();
      setSyncMsg(`✓ Сохранено: «${building.name}»`);
    } catch (e) {
      setSyncMsg(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteBuilding = async (id: string) => {
    if (!confirm(`Удалить «${entries[id]?.name || id}»?`)) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/gm/content/entry?catalog=${activeCatalog}&key=${encodeURIComponent(id)}${activeCatalog === "space_objects" ? "&bag=objects" : ""}`,
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
    const prefix =
      activeCatalog === "buildings"
        ? "building.custom"
        : activeCatalog === "stations"
          ? "station.custom"
          : "object.custom";
    const newId = `${prefix}_${Date.now().toString(36)}`;
    const newEntry: BuildingEntry = {
      id: newId,
      name: `Новое сооружение #${nextNum}`,
      zone: activeCatalog === "stations" ? "orbit" : "surface",
      tier: 1,
      category: "B",
      cost: { "currency.metal": 10, "currency.supply": 5 },
      effects: [
        {
          effect: "production_mult",
          args: { resource: "currency.extracta", mult: 1.1 },
        },
      ],
      laborSlots: 2,
    };
    void saveBuilding(newEntry).then(() => {
      setSelectedId(newId);
    });
  };

  const filteredIds = useMemo(() => {
    return Object.keys(entries).filter((id) => {
      const b = entries[id];
      if (!b) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = b.name?.toLowerCase().includes(q);
        const matchId = id.toLowerCase().includes(q);
        if (!matchName && !matchId) return false;
      }
      if (zoneFilter !== "all" && b.zone !== zoneFilter) return false;
      return true;
    });
  }, [entries, search, zoneFilter]);

  return (
    <div className="studio-layout">
      {/* Sidebar: Buildings list */}
      <aside className="studio-sidebar">
        <div className="studio-sidebar-header">
          <div>
            <p className="panel-kicker">GM · Foundry</p>
            <h3>Конструктор зданий & объектов</h3>
          </div>
          <button
            type="button"
            className="btn primary tiny"
            disabled={busy}
            onClick={handleCreateNew}
          >
            + Создать объект
          </button>
        </div>

        {/* Catalog Selector */}
        <div className="gm-mode-switch" style={{ margin: "6px 0" }}>
          <button
            type="button"
            className={`gm-mode-btn ${activeCatalog === "buildings" ? "on" : ""}`}
            onClick={() => setActiveCatalog("buildings")}
          >
            🏭 Здания
          </button>
          <button
            type="button"
            className={`gm-mode-btn ${activeCatalog === "stations" ? "on" : ""}`}
            onClick={() => setActiveCatalog("stations")}
          >
            🛰 Станции
          </button>
          <button
            type="button"
            className={`gm-mode-btn ${activeCatalog === "space_objects" ? "on" : ""}`}
            onClick={() => setActiveCatalog("space_objects")}
          >
            🪐 Космо-объекты
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

        {/* Zone Filter */}
        <div className="studio-tag-filter">
          <button
            type="button"
            className={`studio-filter-chip ${zoneFilter === "all" ? "active" : ""}`}
            onClick={() => setZoneFilter("all")}
          >
            Все зоны
          </button>
          {ZONES.map((z) => (
            <button
              key={z.id}
              type="button"
              className={`studio-filter-chip ${zoneFilter === z.id ? "active" : ""}`}
              onClick={() => setZoneFilter(z.id)}
            >
              {z.id === "surface" ? "Планета" : z.id === "orbit" ? "Орбита" : "Космос"}
            </button>
          ))}
        </div>

        <ul className="studio-items-list">
          {filteredIds.map((id) => {
            const b = entries[id];
            const isSelected = id === selectedId;
            return (
              <li
                key={id}
                className={`studio-item-card ${isSelected ? "is-selected" : ""}`}
                onClick={() => setSelectedId(id)}
              >
                <div className="studio-item-main">
                  <strong>{b.name || id}</strong>
                  <span className="studio-item-id">{id}</span>
                </div>
                <div className="studio-item-meta">
                  <span className="studio-badge is-accent">
                    {b.zone === "orbit" ? "🛰 Орбита" : "🪐 Поверхность"}
                  </span>
                  <span className="studio-badge">Тир {b.tier}</span>
                  {b.laborSlots && <span className="studio-badge is-good">👥 {b.laborSlots} слота</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Main Studio Area */}
      <main className="studio-workspace">
        {selectedBuilding ? (
          <div className="studio-detail-panel">
            <header className="studio-workspace-header">
              <div className="studio-title-group">
                <span className="studio-hero-icon">
                  {selectedBuilding.zone === "orbit" ? "🛰" : "🏭"}
                </span>
                <div>
                  <input
                    type="text"
                    className="studio-title-input"
                    value={selectedBuilding.name || ""}
                    onChange={(e) => {
                      const updated = { ...selectedBuilding, name: e.target.value };
                      setEntries((prev) => ({ ...prev, [selectedBuilding.id]: updated }));
                    }}
                    onBlur={() => void saveBuilding(selectedBuilding)}
                    placeholder="Название сооружения..."
                  />
                  <p className="hint">
                    ID: <code>{selectedBuilding.id}</code> · Зона: {selectedBuilding.zone || "surface"}
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
                  onClick={() => void saveBuilding(selectedBuilding)}
                >
                  {busy ? "Сохранение…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  className="btn danger"
                  disabled={busy}
                  onClick={() => void deleteBuilding(selectedBuilding.id)}
                >
                  Удалить
                </button>
              </div>
            </header>

            {viewMode === "visual" ? (
              <div className="studio-scroll-body">
                {/* Structure Parameters */}
                <section className="studio-section-card">
                  <h4>Размещение и параметры</h4>
                  <div className="studio-grid-3">
                    <label className="studio-field">
                      <span className="studio-label">Зона размещения</span>
                      <select
                        className="studio-select"
                        value={selectedBuilding.zone || "surface"}
                        onChange={(e) => {
                          const updated = {
                            ...selectedBuilding,
                            zone: e.target.value as "surface" | "orbit" | "deep_space",
                          };
                          setEntries((prev) => ({ ...prev, [selectedBuilding.id]: updated }));
                        }}
                      >
                        {ZONES.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="studio-field">
                      <span className="studio-label">Тир развития (1–5)</span>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        className="studio-input"
                        value={selectedBuilding.tier || 1}
                        onChange={(e) => {
                          const updated = {
                            ...selectedBuilding,
                            tier: Number(e.target.value) || 1,
                          };
                          setEntries((prev) => ({ ...prev, [selectedBuilding.id]: updated }));
                        }}
                      />
                    </label>

                    <label className="studio-field">
                      <span className="studio-label">Категория ветки</span>
                      <select
                        className="studio-select"
                        value={selectedBuilding.category || "B"}
                        onChange={(e) => {
                          const updated = {
                            ...selectedBuilding,
                            category: e.target.value,
                          };
                          setEntries((prev) => ({ ...prev, [selectedBuilding.id]: updated }));
                        }}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            Категория {c}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="studio-grid-2" style={{ marginTop: 10 }}>
                    <label className="studio-field">
                      <span className="studio-label">Слоты рабочей силы (Labor Slots 👥)</span>
                      <input
                        type="number"
                        min="0"
                        className="studio-input"
                        value={selectedBuilding.laborSlots ?? 1}
                        onChange={(e) => {
                          const updated = {
                            ...selectedBuilding,
                            laborSlots: Number(e.target.value) || 0,
                          };
                          setEntries((prev) => ({ ...prev, [selectedBuilding.id]: updated }));
                        }}
                      />
                    </label>

                    <label className="studio-field">
                      <span className="studio-label">Сигнатура / Короткий тег</span>
                      <input
                        type="text"
                        className="studio-input"
                        value={selectedBuilding.signature || ""}
                        onChange={(e) => {
                          const updated = {
                            ...selectedBuilding,
                            signature: e.target.value,
                          };
                          setEntries((prev) => ({ ...prev, [selectedBuilding.id]: updated }));
                        }}
                        placeholder="+production, +pop_cap..."
                      />
                    </label>
                  </div>
                </section>

                {/* Building Effects */}
                <section className="studio-section-card">
                  <StudioEffectList
                    title="Производственные и секторные эффекты"
                    context="building"
                    effects={(selectedBuilding.effects || []).map((e) => ({
                      effect: e.effect,
                      args: e.args,
                    }))}
                    onChange={(updatedEffects) => {
                      const updated = {
                        ...selectedBuilding,
                        effects: updatedEffects.map((e) => ({
                          effect: e.effect,
                          args: e.args || {},
                        })),
                      };
                      setEntries((prev) => ({ ...prev, [selectedBuilding.id]: updated }));
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
                      const parsed = JSON.parse(e.target.value) as BuildingEntry;
                      setJsonErr(null);
                      setEntries((prev) => ({ ...prev, [selectedBuilding.id]: parsed }));
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
            <span className="studio-empty-icon">🏭</span>
            <p>Выберите сооружение слева или создайте новое</p>
          </div>
        )}
      </main>
    </div>
  );
}
