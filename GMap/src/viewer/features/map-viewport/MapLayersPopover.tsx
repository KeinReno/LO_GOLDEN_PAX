import { Flag, Landmark, Layers, X } from "lucide-react";
import {
  VIEWER_LAYER_CHIPS,
  LAYER_PRESET_BUTTONS,
  MAP_MODE_PRESETS,
  activeMapModePreset,
  applyLayerPreset,
  type MapLayerKey,
  type LayerPresetId,
} from "../../../ui/mapLayers";
import { LAYER_LUCIDE } from "../../../ui/layerIcons";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerMapPrefsStore } from "../../../state/viewerMapPrefsStore";

/** Filters drawer — prefs via Zustand, no callback drilling. */
export function MapLayersPopover() {
  const open = useViewerChromeStore((s) => s.mapFiltersOpen);
  const setMapFiltersOpen = useViewerChromeStore((s) => s.setMapFiltersOpen);
  const layers = useViewerMapPrefsStore((s) => s.layers);
  const commitLayers = useViewerMapPrefsStore((s) => s.commitLayers);
  const setLayerFlag = useViewerMapPrefsStore((s) => s.setLayerFlag);
  const activeMapMode = activeMapModePreset(layers);

  const toggleLayer = (key: MapLayerKey) => {
    setLayerFlag(key, !layers[key]);
  };
  const applyPreset = (id: LayerPresetId) => {
    commitLayers(applyLayerPreset(layers, id));
  };

  return (
    <aside
      className={`viewer-drawer ${open ? "open" : ""}`}
      inert={open ? undefined : true}
      aria-hidden={!open}
    >
      <div className="viewer-drawer-head">
        <h2>Фильтры карты</h2>
        <button
          type="button"
          className="viewer-icon-btn"
          onClick={() => setMapFiltersOpen(false)}
        >
          <X size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>

      <section>
        <h3>Режим карты</h3>
        <p className="hint">
          F4–F8 и F10 с клавиатуры. Ниже — доп. пресеты и отдельные слои.
        </p>
        <div className="layer-preset-row">
          {MAP_MODE_PRESETS.filter((mode) => mode.id !== "gm").map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`btn ghost ${activeMapMode === mode.id ? "active" : ""}`}
              title={`${mode.hint} · ${mode.hotkey}`}
              onClick={() => applyPreset(mode.id)}
            >
              {mode.label}
              <kbd className="map-mode-kbd">{mode.hotkey}</kbd>
            </button>
          ))}
        </div>
        <div className="layer-preset-row">
          {LAYER_PRESET_BUTTONS.map((p) => (
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
  );
}
