import { useEffect, useMemo, useRef, useState } from "react";
import {
  Coins,
  Flag,
  Home,
  Info,
  Landmark,
  Layers,
  Menu,
  Settings,
  Swords,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  MapCanvas,
  type MapCanvasApi,
  type MapViewModel,
} from "../renderers/MapCanvas";
import type {
  OrderType,
  ViewerPayload,
  WorldState,
} from "../state/types";
import {
  VIEWER_LAYER_CHIPS,
  LAYER_PRESETS,
  applyLayerPreset,
  readStoredViewerLayers,
  writeStoredViewerLayers,
  layersForPerfChoice,
  type LayerPresetId,
  type MapLayerFlags,
  type MapLayerKey,
  type ViewerPerfChoice,
} from "../ui/mapLayers";
import {
  GRAPHICS_TOGGLES,
  graphicsForPerf,
  readStoredGraphics,
  writeStoredGraphics,
  type GraphicsPrefKey,
  type ViewerGraphicsPrefs,
} from "../ui/viewerGraphics";
import { LAYER_LUCIDE } from "../ui/layerIcons";

/** Modes shown to players (no vague «auto»). */
type PerfMode = ViewerPerfChoice;

interface FactionOption {
  id: string;
  name: string;
  color: string;
}

function isLikelyMobile(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia("(max-width: 900px)").matches ||
      window.matchMedia("(pointer: coarse)").matches
    );
  } catch {
    return false;
  }
}

function readStoredPerf(): PerfMode | null {
  try {
    const v = localStorage.getItem("gmap-viewer-perf");
    if (
      v === "quality" ||
      v === "quality_mobile" ||
      v === "mobile" ||
      v === "ultralight"
    )
      return v;
  } catch {
    /* ignore */
  }
  return null;
}

function defaultPerfForDevice(): PerfMode {
  return isLikelyMobile() ? "ultralight" : "quality";
}

const PERF_OPTIONS: {
  id: PerfMode;
  label: string;
  hint: string;
  mobileRec?: boolean;
}[] = [
  {
    id: "ultralight",
    label: "Суперлайт",
    hint: "Максимум FPS. Минимум эффектов — для слабых телефонов.",
    mobileRec: true,
  },
  {
    id: "mobile",
    label: "Лайт",
    hint: "Баланс: карта читается, анимаций меньше.",
  },
  {
    id: "quality_mobile",
    label: "Качество",
    hint: "Красивая карта без бешеной перерисовки — для телефонов.",
  },
  {
    id: "quality",
    label: "Максимум",
    hint: "Полный FX и анимации. Лучше на ПК.",
  },
];

export function ViewerPage() {
  const mobile = useMemo(() => isLikelyMobile(), []);
  const [factions, setFactions] = useState<FactionOption[]>([]);
  const [factionId, setFactionId] = useState("");
  const [password, setPassword] = useState("");
  const [loginPerf, setLoginPerf] = useState<PerfMode>(
    () => readStoredPerf() ?? defaultPerfForDevice(),
  );
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ViewerPayload | null>(null);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [selectedFleetId, setSelectedFleetId] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("move_fleet");
  const [orderNote, setOrderNote] = useState("");
  const [orderMsg, setOrderMsg] = useState<string | null>(null);
  const [apMax, setApMax] = useState(3);
  const [reservedAp, setReservedAp] = useState(0);
  const [targetSystemId, setTargetSystemId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [perfMode, setPerfMode] = useState<PerfMode>(
    () => readStoredPerf() ?? defaultPerfForDevice(),
  );
  const [graphics, setGraphics] = useState<ViewerGraphicsPrefs>(() => {
    const stored = readStoredGraphics();
    const mode = readStoredPerf() ?? defaultPerfForDevice();
    // If never customized, seed from perf profile
    try {
      if (!localStorage.getItem("gmap-viewer-graphics")) {
        return graphicsForPerf(mode);
      }
    } catch {
      /* ignore */
    }
    return stored;
  });
  const [layers, setLayers] = useState<MapLayerFlags>(() => {
    try {
      const hasStored = !!localStorage.getItem("gmap-viewer-layers");
      if (!hasStored && isLikelyMobile()) {
        return layersForPerfChoice("ultralight");
      }
    } catch {
      /* ignore */
    }
    return readStoredViewerLayers();
  });
  const [syncHint, setSyncHint] = useState<string | null>(null);
  const modelRef = useRef<MapViewModel | null>(null);
  const mapApiRef = useRef<MapCanvasApi | null>(null);
  const listeners = useRef(new Set<() => void>());
  const mapStampRef = useRef<string | null>(null);
  const credsRef = useRef({ factionId: "", password: "" });

  const bump = () => {
    for (const l of listeners.current) l();
  };

  const applyPerfMode = (mode: PerfMode, withPresets = false) => {
    setPerfMode(mode);
    setLoginPerf(mode);
    try {
      localStorage.setItem("gmap-viewer-perf", mode);
    } catch {
      /* ignore */
    }
    if (withPresets) {
      const nextLayers = layersForPerfChoice(mode);
      const nextGfx = graphicsForPerf(mode);
      setLayers(nextLayers);
      setGraphics(nextGfx);
      writeStoredViewerLayers(nextLayers);
      writeStoredGraphics(nextGfx);
    }
  };

  const toggleGraphic = (key: GraphicsPrefKey) => {
    setGraphics((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      writeStoredGraphics(next);
      return next;
    });
  };

  const toggleLayer = (key: MapLayerKey) => {
    setLayers((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      writeStoredViewerLayers(next);
      return next;
    });
  };

  const applyPreset = (id: LayerPresetId) => {
    setLayers((prev) => {
      const next = applyLayerPreset(prev, id);
      writeStoredViewerLayers(next);
      return next;
    });
  };

  useEffect(() => {
    bump();
  }, [layers, perfMode, graphics, selectedSystemId, selectedFleetId, payload]);

  useEffect(() => {
    void loadFactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live map refresh: master «Сохранить кампанию» → publish → players pick up
  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/map-version");
        if (!res.ok || cancelled) return;
        const ver = (await res.json()) as {
          updatedAt?: string | null;
          turn?: number;
          tableRevision?: number;
        };
        const stamp = `${ver.tableRevision ?? ""}|${ver.updatedAt ?? ""}|${ver.turn ?? ""}`;
        if (!mapStampRef.current) {
          mapStampRef.current = stamp;
          return;
        }
        if (stamp === mapStampRef.current) return;
        const { factionId: fid, password: pw } = credsRef.current;
        if (!fid || !pw) return;
        const r2 = await fetch("/api/view-refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ factionId: fid, password: pw }),
        });
        if (!r2.ok || cancelled) return;
        const data = (await r2.json()) as ViewerPayload & {
          updatedAt?: string | null;
        };
        mapStampRef.current = stamp;
        setPayload({
          world: data.world,
          factionId: data.factionId,
          visibleSystemIds: data.visibleSystemIds,
          updatedAt: data.updatedAt ?? ver.updatedAt,
        });
        setSyncHint(
          `Карта обновлена · ход ${data.world.meta.turn} · ${data.visibleSystemIds.length} систем`,
        );
        bump();
      } catch {
        /* ignore transient tunnel errors */
      }
    };
    const id = window.setInterval(() => void tick(), 4000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.factionId]);

  const loadFactions = async () => {
    setError(null);
    try {
      const res = await fetch("/api/factions");
      const raw = await res.text();
      let data: unknown = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        /* keep text */
      }
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: string }).error)
            : raw || res.statusText;
        throw new Error(msg);
      }
      const list = data as FactionOption[];
      setFactions(list);
      if (list[0]) setFactionId(list[0].id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes("не опубликована") || msg.includes("published")
          ? "Карта ещё не опубликована. Мастер: вкладка «Сессия» → «Опубликовать для игроков»."
          : msg ||
              "Не удалось загрузить список. Мастер должен нажать «Опубликовать».",
      );
    }
  };

  const login = async () => {
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factionId, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const data = (await res.json()) as ViewerPayload & {
        updatedAt?: string | null;
      };
      credsRef.current = { factionId, password };
      mapStampRef.current = `${data.world.meta.updatedAt ?? data.updatedAt ?? ""}|${data.world.meta.turn}`;

      const chosen = loginPerf;
      const nextLayers = layersForPerfChoice(chosen);
      const nextGfx = graphicsForPerf(chosen);
      try {
        localStorage.setItem("gmap-viewer-perf", chosen);
        writeStoredViewerLayers(nextLayers);
        writeStoredGraphics(nextGfx);
      } catch {
        /* ignore */
      }
      setPerfMode(chosen);
      setLayers(nextLayers);
      setGraphics(nextGfx);

      setPayload({
        ...data,
        updatedAt: data.updatedAt ?? data.world.meta.updatedAt,
      });
      setApMax(data.apMax ?? 3);
      setReservedAp(data.reservedAp ?? 0);
      setSelectedSystemId(null);
      setSelectedFleetId(null);
      setSyncHint(null);
      setSettingsOpen(false);
      setMenuOpen(false);
      modelRef.current = toModel(data.world, null, null, nextLayers);
      bump();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const readModel = () => {
    if (!payload) {
      return {
        world: emptyWorld(),
        selectedSystemId: null,
        selectedFleetId: null,
        selectedLegionId: null,
        selectedLinkId: null,
        selectedSectorId: null,
        linkDraftFromId: null,
        sectorDraftPoints: [],
        ...layers,
        perfMode,
        graphics,
      } satisfies MapViewModel;
    }
    const m: MapViewModel = {
      world: payload.world,
      selectedSystemId,
      selectedFleetId,
      selectedLegionId: null,
      selectedLinkId: null,
      selectedSectorId: null,
      linkDraftFromId: null,
      sectorDraftPoints: [],
      ...layers,
      activeFactionId: payload.factionId,
      perfMode,
      graphics,
    };
    modelRef.current = m;
    return m;
  };

  const subscribe = (cb: () => void) => {
    listeners.current.add(cb);
    return () => {
      listeners.current.delete(cb);
    };
  };

  const selectedSystem = useMemo(
    () => payload?.world.systems.find((s) => s.id === selectedSystemId) ?? null,
    [payload, selectedSystemId],
  );
  const selectedFleet = useMemo(
    () => payload?.world.fleets.find((f) => f.id === selectedFleetId) ?? null,
    [payload, selectedFleetId],
  );

  const submitOrder = async () => {
    if (!payload) return;
    setOrderMsg(null);
    const body = {
      factionId: payload.factionId,
      password,
      type: orderType,
      fleetId: selectedFleetId ?? undefined,
      fromSystemId:
        selectedFleet?.systemId ?? selectedSystemId ?? undefined,
      toSystemId: targetSystemId ?? selectedSystemId ?? undefined,
      note: orderNote,
    };
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const data = await res.json();
      setPayload({
        ...payload,
        world: {
          ...payload.world,
          orders: [...payload.world.orders, data.order],
        },
      });
      if (typeof data.apMax === "number") setApMax(data.apMax);
      if (typeof data.intent?.apCost === "number") {
        setReservedAp((r) => r + data.intent.apCost);
      }
      setOrderMsg(
        `Приказ принят · AP ${reservedAp + (data.intent?.apCost ?? 0)}/${data.apMax ?? apMax}`,
      );
      bump();
    } catch (e) {
      setOrderMsg(e instanceof Error ? e.message : String(e));
    }
  };

  if (!payload) {
    return (
      <div className="viewer-login">
        <div className="login-card">
          <p className="login-eyebrow">Доступ к карте кампании</p>
          <h1>LO GOLDEN PAX</h1>
          <p className="hint" style={{ textAlign: "center" }}>
            Держава, пароль и режим карты — потом можно сменить в настройках.
          </p>
          {factions.length === 0 && !error && (
            <p className="hint">Синхронизация списка держав…</p>
          )}
          <button type="button" className="btn" onClick={() => void loadFactions()}>
            Обновить список
          </button>
          {factions.length > 0 && (
            <>
              <label className="field">
                <span>Держава / фракция</span>
                <select
                  value={factionId}
                  onChange={(e) => setFactionId(e.target.value)}
                >
                  {factions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Код доступа</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="например solis"
                />
              </label>

              <div className="login-perf">
                <span className="login-perf-label">Режим карты</span>
                {mobile && (
                  <p className="hint login-perf-rec">
                    С телефона: <strong>Суперлайт</strong> — самый плавный,{" "}
                    <strong>Качество</strong> — красивее без лагов при зуме.
                  </p>
                )}
                <div className="login-perf-options" role="radiogroup" aria-label="Режим карты">
                  {PERF_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={loginPerf === opt.id}
                      className={`login-perf-card ${loginPerf === opt.id ? "active" : ""} ${
                        mobile && opt.mobileRec ? "recommended" : ""
                      }`}
                      onClick={() => setLoginPerf(opt.id)}
                    >
                      <strong>
                        {opt.label}
                        {mobile && opt.mobileRec ? " · реком." : ""}
                      </strong>
                      <span>{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="btn primary"
                onClick={() => void login()}
              >
                Войти к столу
              </button>
              <p className="hint" style={{ textAlign: "center" }}>
                Белатор — <code>solis</code> · Турон — <code>turon</code> · пираты —{" "}
                <code>pirate</code>
              </p>
            </>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  const faction = payload.world.factions.find((f) => f.id === payload.factionId);

  return (
    <div className="viewer-shell">
      <header className="viewer-topbar">
        <button
          type="button"
          className="viewer-icon-btn"
          aria-label="Меню"
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={18} strokeWidth={2} aria-hidden />
        </button>
        <div className="viewer-topbar-title">
          <span
            className="swatch"
            style={{ background: faction?.color ?? "#888" }}
          />
          <div>
            <strong>{faction?.name ?? "Игрок"}</strong>
            <span className="hint">
              видно систем: {payload.visibleSystemIds.length}
            </span>
          </div>
        </div>
        <div className="viewer-turn-seal" title="Текущий ход кампании">
          <span>ход</span>
          <strong>{payload.world.meta.turn}</strong>
        </div>
        <button
          type="button"
          className="viewer-icon-btn"
          aria-label="Настройки карты"
          title="Настройки"
          onClick={() => {
            setMenuOpen(false);
            setSettingsOpen(true);
          }}
        >
          <Settings size={18} strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          className="viewer-icon-btn"
          aria-label="Инфо"
          disabled={!selectedSystem && !selectedFleet}
          onClick={() => setSheetOpen(true)}
        >
          <Info size={18} strokeWidth={2} aria-hidden />
        </button>
      </header>

      <main className="viewer-map">
        <MapCanvas
          key={`viewer-map-${perfMode}`}
          mode="viewer"
          apiRef={mapApiRef}
          readModel={readModel}
          onModelSubscribe={subscribe}
          onSystemClick={(id) => {
            setSelectedSystemId(id);
            if (id) {
              setTargetSystemId(id);
              setSheetOpen(true);
            }
            bump();
          }}
          onFleetClick={(id) => {
            setSelectedFleetId(id);
            const fleet = payload.world.fleets.find((f) => f.id === id);
            if (fleet) setSelectedSystemId(fleet.systemId);
            setSheetOpen(true);
            bump();
          }}
        />
        <div className="viewer-zoom" aria-label="Масштаб">
          <button
            type="button"
            className="viewer-zoom-btn"
            aria-label="Приблизить"
            onClick={() => mapApiRef.current?.zoomBy(1.25)}
          >
            <ZoomIn size={20} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className="viewer-zoom-btn"
            aria-label="Отдалить"
            onClick={() => mapApiRef.current?.zoomBy(0.8)}
          >
            <ZoomOut size={20} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className="viewer-zoom-btn"
            aria-label="Сбросить вид"
            onClick={() => mapApiRef.current?.resetView()}
          >
            <Home size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className="viewer-map-hint">
          <Settings size={12} strokeWidth={2} aria-hidden /> настройки сверху ·
          щипок / зум · тап — досье
        </div>
      </main>

      {(menuOpen || settingsOpen) && (
        <button
          type="button"
          className="viewer-backdrop"
          aria-label="Закрыть"
          onClick={() => {
            setMenuOpen(false);
            setSettingsOpen(false);
          }}
        />
      )}

      <aside className={`viewer-drawer ${settingsOpen ? "open" : ""}`}>
        <div className="viewer-drawer-head">
          <h2>Настройки карты</h2>
          <button
            type="button"
            className="viewer-icon-btn"
            onClick={() => setSettingsOpen(false)}
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <section>
          <h3>Производительность</h3>
          <p className="hint">
            Суперлайт / Лайт — легче. Качество — красиво на телефоне без
            перерисовки каждый кадр. Максимум — полный FX (ПК).
          </p>
          <div className="viewer-perf-row">
            {PERF_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`btn ghost ${perfMode === opt.id ? "active" : ""}`}
                title={opt.hint}
                onClick={() => {
                  applyPerfMode(opt.id, true);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="hint">
            Смена режима подставляет пресет слоёв и графики — ниже можно
            донастроить вручную.
          </p>
        </section>

        <section>
          <h3>Графика</h3>
          <p className="hint">
            Влияет на FPS. «Перерисовка при зуме» лучше оставить выкл.
          </p>
          <div className="layer-chip-grid">
            {GRAPHICS_TOGGLES.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`layer-chip ${graphics[t.key] ? "on" : ""}`}
                aria-pressed={graphics[t.key]}
                title={t.hint}
                onClick={() => toggleGraphic(t.key)}
              >
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Что показывать</h3>
          <p className="hint">Пресеты или точечно — под свой комфорт.</p>
          <div className="layer-preset-row">
            {LAYER_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn ghost"
                title={p.hint}
                onClick={() => applyPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="layer-chip-grid">
            {VIEWER_LAYER_CHIPS.map((chip) => {
              const Icon = LAYER_LUCIDE[chip.icon];
              return (
                <button
                  key={chip.key}
                  type="button"
                  className={`layer-chip ${layers[chip.key] ? "on" : ""}`}
                  aria-pressed={layers[chip.key]}
                  onClick={() => toggleLayer(chip.key)}
                >
                  <Icon size={13} strokeWidth={2.25} aria-hidden />
                  <span>{chip.title}</span>
                </button>
              );
            })}
            <button
              type="button"
              className={`layer-chip ${layers.showFactionLabels ? "on" : ""}`}
              aria-pressed={layers.showFactionLabels}
              onClick={() => toggleLayer("showFactionLabels")}
            >
              <Flag size={13} strokeWidth={2.25} aria-hidden />
              <span>Имена держав</span>
            </button>
            <button
              type="button"
              className={`layer-chip ${layers.showSectors ? "on" : ""}`}
              aria-pressed={layers.showSectors}
              onClick={() => toggleLayer("showSectors")}
            >
              <Landmark size={13} strokeWidth={2.25} aria-hidden />
              <span>Секторы</span>
            </button>
            <button
              type="button"
              className={`layer-chip ${layers.showSupply ? "on" : ""}`}
              aria-pressed={layers.showSupply}
              onClick={() => toggleLayer("showSupply")}
            >
              <Layers size={13} strokeWidth={2.25} aria-hidden />
              <span>Снабжение</span>
            </button>
            <button
              type="button"
              className={`layer-chip ${layers.showTraffic ? "on" : ""}`}
              aria-pressed={layers.showTraffic}
              onClick={() => toggleLayer("showTraffic")}
            >
              <Layers size={13} strokeWidth={2.25} aria-hidden />
              <span>Трафик</span>
            </button>
            <button
              type="button"
              className={`layer-chip ${layers.showCaravans ? "on" : ""}`}
              aria-pressed={layers.showCaravans}
              onClick={() => toggleLayer("showCaravans")}
            >
              <Layers size={13} strokeWidth={2.25} aria-hidden />
              <span>Караваны</span>
            </button>
          </div>
        </section>
      </aside>

      <aside className={`viewer-drawer ${menuOpen ? "open" : ""}`}>
        <div className="viewer-drawer-head">
          <h2>Меню</h2>
          <button
            type="button"
            className="viewer-icon-btn"
            onClick={() => setMenuOpen(false)}
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <section>
          <h3>Легенда</h3>
          <ul className="viewer-legend">
            <li>
              <span className="leg-icon">
                <Swords size={14} strokeWidth={2} aria-hidden />
              </span>
              бой / спорная система
            </li>
            <li>
              <span className="leg-icon coin">
                <Coins size={14} strokeWidth={2} aria-hidden />
              </span>
              торговля · ресурсы
            </li>
            <li>
              <span className="leg-ship" /> флот (форма = тип)
            </li>
            <li>
              <span className="leg-shield" /> гарнизон / станция
            </li>
          </ul>
          {syncHint && <p className="hint ok-hint">{syncHint}</p>}
          <p className="hint">Карта подтягивается сама после сохранения мастера.</p>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              setMenuOpen(false);
              setSettingsOpen(true);
            }}
          >
            Открыть настройки карты
          </button>
        </section>

        <section>
          <h3>Вы</h3>
          <p className="meta-line">
            <span
              className="swatch"
              style={{ background: faction?.color, display: "inline-block" }}
            />{" "}
            {faction?.name}
            <br />
            Ход {payload.world.meta.turn} · видно систем:{" "}
            {payload.visibleSystemIds.length}
            <br />
            AP: {reservedAp}/{apMax} (занято / лимит)
          </p>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              setPayload(null);
              setPassword("");
              setMenuOpen(false);
            }}
          >
            Выйти
          </button>
        </section>

        <section>
          <h3>Директива на следующий ход</h3>
          <p className="hint">
            1) Флот или система. 2) Цель на карте. 3) Заверить приказ.
          </p>
          <label className="field">
            <span>Тип</span>
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as OrderType)}
            >
              <option value="move_fleet">Переместить флот</option>
              <option value="claim_system">Захватить / экспансия</option>
              <option value="attack_system">Атака</option>
            </select>
          </label>
          <p className="hint">
            Флот: {selectedFleet?.name ?? "—"}
            <br />
            Цель:{" "}
            {payload.world.systems.find((s) => s.id === targetSystemId)?.name ??
              "—"}
          </p>
          <label className="field">
            <span>Заметка</span>
            <input
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder="опционально"
            />
          </label>
          <button
            type="button"
            className="btn primary block"
            onClick={() => {
              void submitOrder();
              setMenuOpen(false);
            }}
          >
            Заверить приказ
          </button>
          {orderMsg && <p className="hint">{orderMsg}</p>}
        </section>

        <section>
          <h3>Ваши приказы (pending)</h3>
          <p className="hint">
            Committed = карта после последнего тика. Pending ниже — до 00:01 /
            тика мастера.
          </p>
          {payload.world.orders.filter((o) => o.status === "pending").length ===
            0 && <p className="hint">Пока нет</p>}
          {payload.world.orders
            .filter((o) => o.status === "pending")
            .map((o) => (
              <div key={o.id} className="order-card">
                <div>
                  {o.type} →{" "}
                  {payload.world.systems.find((s) => s.id === o.toSystemId)
                    ?.name ?? o.toSystemId}
                </div>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    void (async () => {
                      try {
                        const res = await fetch(`/api/intents/${o.id}/cancel`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            factionId: payload.factionId,
                            password,
                          }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || res.statusText);
                        setPayload({
                          ...payload,
                          world: {
                            ...payload.world,
                            orders: payload.world.orders.filter(
                              (x) => x.id !== o.id,
                            ),
                          },
                        });
                        setReservedAp((r) => Math.max(0, r - 1));
                        setOrderMsg("Приказ отменён");
                      } catch (e) {
                        setOrderMsg(
                          e instanceof Error ? e.message : String(e),
                        );
                      }
                    })();
                  }}
                >
                  Отменить
                </button>
              </div>
            ))}
        </section>
      </aside>

      {sheetOpen && (selectedSystem || selectedFleet) && (
        <button
          type="button"
          className="viewer-backdrop sheet"
          aria-label="Закрыть инфо"
          onClick={() => setSheetOpen(false)}
        />
      )}

      <aside
        className={`viewer-sheet ${sheetOpen && (selectedSystem || selectedFleet) ? "open" : ""}`}
      >
        <div className="viewer-sheet-grab">
          <p className="viewer-sheet-kicker">Сводка системы</p>
          <button
            type="button"
            className="viewer-sheet-close"
            onClick={() => setSheetOpen(false)}
          >
            Закрыть
          </button>
        </div>
        <div className="viewer-sheet-body">
          {!selectedSystem && !selectedFleet && (
            <p className="hint">Выберите систему на карте</p>
          )}
          {selectedSystem && (
            <div>
              <h2 className="system-title">{selectedSystem.name}</h2>
              <p className="hint">
                {selectedSystem.kind === "corridor" ||
                selectedSystem.stars.length === 0
                  ? "Коридорный узел (без звезды)"
                  : `Звёзд: ${selectedSystem.stars.length} · планет: ${selectedSystem.planets.length}`}
              </p>
              {selectedSystem.planets.length > 0 && (
                <div className="census-box">
                  {(() => {
                    const c = selectedSystem.planets.reduce(
                      (acc, p) => {
                        if (p.population > 0) acc.inhabited += 1;
                        else if (
                          p.type === "gas" ||
                          p.type === "toxic" ||
                          p.climate === "frozen" ||
                          p.climate === "infernal"
                        ) {
                          acc.uninhabitable += 1;
                        } else acc.habitable += 1;
                        return acc;
                      },
                      { inhabited: 0, habitable: 0, uninhabitable: 0 },
                    );
                    return (
                      <>
                        <div className="census-row">
                          <span className="pip inhabited" /> Заселённые:{" "}
                          {c.inhabited}
                        </div>
                        <div className="census-row">
                          <span className="pip habitable" /> Пригодные:{" "}
                          {c.habitable}
                        </div>
                        <div className="census-row">
                          <span className="pip uninhabitable" /> Непригодные:{" "}
                          {c.uninhabitable}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
              <p className="hint">
                Ресурсы:{" "}
                {selectedSystem.resources.length
                  ? selectedSystem.resources.join(", ")
                  : "—"}
              </p>
              {(selectedSystem.stations?.length ?? 0) > 0 && (
                <p className="hint">
                  Станции:{" "}
                  {selectedSystem.stations!.map((st) => st.name).join(", ")}
                </p>
              )}
              {selectedSystem.planets.map((p) => (
                <div key={p.id} className="planet-card">
                  <strong>
                    {p.orbitIndex != null ? `◉${p.orbitIndex} ` : ""}
                    {p.name}
                  </strong>
                  <div className="hint">
                    {p.type} / {p.climate}
                    {p.colonyType && p.colonyType !== "none"
                      ? ` · ${p.colonyType}`
                      : ""}
                    {p.population > 0
                      ? ` · нас. ${p.population}`
                      : " · без колонии"}
                  </div>
                </div>
              ))}
            </div>
          )}
          {selectedFleet && (
            <div className="planet-card">
              <strong>{selectedFleet.name}</strong>
              <div className="hint">
                {selectedFleet.composition
                  .map((c) => `${c.type}×${c.count}`)
                  .join(", ")}
              </div>
              <div className="hint">Стойка: {selectedFleet.stance}</div>
            </div>
          )}
          <button
            type="button"
            className="btn block"
            onClick={() => {
              setSheetOpen(false);
              setMenuOpen(true);
            }}
          >
            Сделать приказ…
          </button>
        </div>
      </aside>
    </div>
  );
}

function toModel(
  world: WorldState,
  selectedSystemId: string | null,
  selectedFleetId: string | null,
  layers: MapLayerFlags,
): MapViewModel {
  return {
    world,
    selectedSystemId,
    selectedFleetId,
    selectedLegionId: null,
    selectedLinkId: null,
    selectedSectorId: null,
    linkDraftFromId: null,
    sectorDraftPoints: [],
    ...layers,
  };
}

function emptyWorld(): WorldState {
  return {
    meta: {
      schemaVersion: 2,
      name: "",
      turn: 0,
      createdAt: "",
      updatedAt: "",
      width: 4000,
      height: 3000,
    },
    systems: [],
    links: [],
    sectors: [],
    factions: [],
    races: [],
    fleets: [],
    legions: [],
    diplomacy: [],
    orders: [],
    turnHistory: [],
    caravans: [],
    quests: [],
  };
}
