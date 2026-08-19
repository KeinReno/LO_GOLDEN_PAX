import { useSyncExternalStore } from "react";
import { Swords, X } from "lucide-react";
import type { MapStyleId } from "../../../renderers/styles/mapTheme";
import {
  getStaffSfxVolume,
  isStaffSfxMuted,
  playStaffCue,
  setStaffSfxMuted,
  setStaffSfxVolume,
  subscribeStaffSfx,
} from "../../../audio/staffSfx";
import {
  formatForceOdMeter,
  formatOdMeter,
} from "../../../state/playerUiTerms";
import type { ViewerPayload } from "../../../state/types";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerMapPrefsStore } from "../../../state/viewerMapPrefsStore";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import { MAP_STYLE_OPTIONS } from "../../../ui/mapStylePrefs";
import {
  MAP_MODE_PRESETS,
  activeMapModePreset,
  applyLayerPreset,
} from "../../../ui/mapLayers";
import {
  GRAPHICS_TOGGLES,
  clampPerfForDevice,
  type GraphicsPrefKey,
} from "../../../ui/viewerGraphics";
import { MapLayersPopover } from "../map-viewport/MapLayersPopover";
import { navigateViewerRoom } from "../rooms-router/navigateViewerRoom";
import { PERF_OPTIONS, type PerfMode } from "../../viewerSessionPrefs";

type Props = {
  payload: ViewerPayload;
  mobile: boolean;
  syncHint: string | null;
  onLogout: () => void;
  onLoginPerf: (mode: PerfMode) => void;
  onLoginMapStyle: (style: MapStyleId) => void;
};

export function ViewerPlayDrawers({
  payload,
  mobile,
  syncHint,
  onLogout,
  onLoginPerf,
  onLoginMapStyle,
}: Props) {
  const menuOpen = useViewerChromeStore((s) => s.menuOpen);
  const settingsOpen = useViewerChromeStore((s) => s.settingsOpen);
  const mapFiltersOpen = useViewerChromeStore((s) => s.mapFiltersOpen);
  const setMenuOpen = useViewerChromeStore((s) => s.setMenuOpen);
  const setSettingsOpen = useViewerChromeStore((s) => s.setSettingsOpen);
  const setMapFiltersOpen = useViewerChromeStore((s) => s.setMapFiltersOpen);
  const openSettingsOnly = useViewerChromeStore((s) => s.openSettingsOnly);
  const openMapFiltersOnly = useViewerChromeStore((s) => s.openMapFiltersOnly);

  const viewMode = useViewerSessionStore((s) => s.viewMode);
  const apMax = useViewerOrderSessionStore((s) => s.apMax);
  const reservedAp = useViewerOrderSessionStore((s) => s.reservedAp);
  const forceApMax = useViewerOrderSessionStore((s) => s.forceApMax);
  const reservedForceAp = useViewerOrderSessionStore((s) => s.reservedForceAp);

  const perfMode = useViewerMapPrefsStore((s) => s.perfMode);
  const graphics = useViewerMapPrefsStore((s) => s.graphics);
  const mapStyle = useViewerMapPrefsStore((s) => s.mapStyle);
  const applyPerfModeStore = useViewerMapPrefsStore((s) => s.applyPerfMode);
  const applyMapStyleStore = useViewerMapPrefsStore((s) => s.applyMapStyle);
  const setGraphicFlag = useViewerMapPrefsStore((s) => s.setGraphicFlag);
  const layers = useViewerMapPrefsStore((s) => s.layers);
  const commitLayers = useViewerMapPrefsStore((s) => s.commitLayers);
  const activeMapMode = activeMapModePreset(layers);
  const sfxMuted = useSyncExternalStore(
    subscribeStaffSfx,
    isStaffSfxMuted,
    () => true,
  );
  const sfxVolume = useSyncExternalStore(
    subscribeStaffSfx,
    getStaffSfxVolume,
    () => 0.7,
  );

  const faction = payload.world.factions.find((f) => f.id === payload.factionId);

  const closeDrawers = () => {
    setMenuOpen(false);
    setSettingsOpen(false);
    setMapFiltersOpen(false);
  };

  const applyPerfMode = (mode: PerfMode, withPresets = false) => {
    applyPerfModeStore(mode, withPresets);
    onLoginPerf(clampPerfForDevice(mode));
  };

  const applyMapStyle = (style: MapStyleId) => {
    applyMapStyleStore(style);
    onLoginMapStyle(style);
  };

  const toggleGraphic = (key: GraphicsPrefKey) => {
    if (key === "cinematic" && mobile) return;
    setGraphicFlag(key, !graphics[key]);
  };

  return (
    <>
      {(menuOpen || settingsOpen || mapFiltersOpen) && (
        <button
          type="button"
          className="viewer-backdrop"
          aria-label="Закрыть"
          onClick={closeDrawers}
        />
      )}

      <aside
        className={`viewer-drawer ${settingsOpen ? "open" : ""}`}
        inert={settingsOpen ? undefined : true}
        aria-hidden={!settingsOpen}
      >
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
          <h3>Режим карты</h3>
          <p className="hint">
            Политика, война, экономика и остальные слои. F4–F8 и F10 — с
            клавиатуры, не с карты.
          </p>
          <div className="layer-preset-row">
            {MAP_MODE_PRESETS.filter((mode) => mode.id !== "gm").map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`btn ghost ${activeMapMode === mode.id ? "active" : ""}`}
                title={`${mode.hint} · ${mode.hotkey}`}
                onClick={() => commitLayers(applyLayerPreset(layers, mode.id))}
              >
                {mode.label}
                <kbd className="map-mode-kbd">{mode.hotkey}</kbd>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Производительность</h3>
          <p className="hint">
            Суперлайт / Лайт — легче. Качество — красиво на телефоне без
            перерисовки каждый кадр. Максимум — все эффекты (ПК). Кино —
            дополнительная красота, только на ПК (тяжелее).
          </p>
          <div className="viewer-perf-row">
            {PERF_OPTIONS.filter((opt) => !(mobile && opt.desktopOnly)).map(
              (opt) => (
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
              ),
            )}
          </div>
          <p className="hint">
            Смена режима подставляет пресет слоёв и графики. Отдельные слои —
            кнопка «Фильтры».
          </p>
        </section>

        <section>
          <h3>Язык карты</h3>
          <p className="hint">
            Визуальный язык территорий и систем. Классика, Империя и Голо
            меняют отрисовку карты сразу.
          </p>
          <div
            className="viewer-perf-row"
            role="radiogroup"
            aria-label="Язык карты"
          >
            {MAP_STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={mapStyle === opt.id}
                className={`btn ghost ${mapStyle === opt.id ? "active" : ""}`}
                title={opt.hint}
                onClick={() => applyMapStyle(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Графика</h3>
          <p className="hint">
            Влияет на плавность. «Перерисовка при зуме» лучше оставить выкл.
            Кино — звёзды, тени, пульс; тяжелее, для ПК.
          </p>
          <div className="layer-chip-grid">
            {GRAPHICS_TOGGLES.filter(
              (t) => !(mobile && t.key === "cinematic"),
            ).map((t) => (
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
          <h3>Звук</h3>
          <p className="hint">
            Рация стола: ход, контакт, печать, сброс, RP. Клики хрома и музыка
            сюда не входят.
          </p>
          <div className="layer-chip-grid">
            <button
              type="button"
              className={`layer-chip ${sfxMuted ? "" : "on"}`}
              aria-pressed={!sfxMuted}
              title="Выключить прерывания рации"
              onClick={() => setStaffSfxMuted(!sfxMuted)}
            >
              <span>Рация</span>
            </button>
          </div>
          <label className="slider-row">
            <span>Громкость {Math.round(sfxVolume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(sfxVolume * 100)}
              disabled={sfxMuted}
              aria-valuetext={`${Math.round(sfxVolume * 100)} процентов`}
              onChange={(e) =>
                setStaffSfxVolume(Number(e.currentTarget.value) / 100)
              }
              onPointerUp={() => {
                if (!isStaffSfxMuted() && getStaffSfxVolume() > 0) {
                  playStaffCue("radio_squelch");
                }
              }}
              onKeyUp={() => {
                if (!isStaffSfxMuted() && getStaffSfxVolume() > 0) {
                  playStaffCue("radio_squelch");
                }
              }}
            />
          </label>
        </section>
      </aside>

      <MapLayersPopover />

      <aside
        className={`viewer-drawer viewer-drawer--menu-v2 ${menuOpen ? "open" : ""}`}
        inert={menuOpen ? undefined : true}
        aria-hidden={!menuOpen}
      >
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

        <section className="menu-v2-you">
          <h3>Вы</h3>
          <p className="meta-line">
            <span
              className="swatch"
              style={{ background: faction?.color, display: "inline-block" }}
            />{" "}
            {faction?.name}
            <br />
            Ход {payload.world.meta.turn} · {formatOdMeter(reservedAp, apMax)} ·{" "}
            {formatForceOdMeter(reservedForceAp, forceApMax)}
          </p>
          {syncHint && <p className="hint ok-hint">{syncHint}</p>}
        </section>

        <section className="menu-v2-legend">
          <h3>На карте</h3>
          <ul className="viewer-legend viewer-legend--compact">
            <li>
              <span className="leg-icon">
                <Swords size={14} strokeWidth={2} aria-hidden />
              </span>
              бой · красный
            </li>
            <li>
              <span className="leg-ship" /> флот · форма = тип
            </li>
            <li>
              <span className="leg-shield" /> сигналы у системы
            </li>
          </ul>
          <p className="hint">
            Комнаты — нижний док. Приказы — drag / ПКМ на карте.
          </p>
        </section>

        <section className="menu-v2-actions">
          <button
            type="button"
            className="btn ghost block"
            onClick={openSettingsOnly}
          >
            Настройки карты
          </button>
          {viewMode === "map" && (
            <button
              type="button"
              className="btn ghost block"
              onClick={openMapFiltersOnly}
            >
              Фильтры карты
            </button>
          )}
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              setMenuOpen(false);
              navigateViewerRoom("hq");
            }}
          >
            Штаб · сводка хода
          </button>
          <button
            type="button"
            className="btn danger block"
            onClick={() => {
              onLogout();
              setMenuOpen(false);
            }}
          >
            Выйти
          </button>
        </section>
      </aside>
    </>
  );
}
