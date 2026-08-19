import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Layers,
  Radio,
  Wrench,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useWorldStore } from "../state/worldStore";
import type { EditorTool, PlayerOrder } from "../state/types";
import type { MapLayerFlags } from "../ui/mapLayers";
import {
  downloadBlob,
  exportCampaignJson,
  exportCampaignZip,
  importCampaignJson,
  importCampaignZip,
  parseWorldJson,
} from "../io/campaignIo";
import {
  downloadText,
  exportCampaignMarkdown,
  exportMapPng,
  exportMapPosterPng,
  exportMapPlayerPosterPng,
  exportMapPlayerPng,
} from "../io/exportExtras";
import {
  clearDraft,
  getDraftMeta,
  loadDraft,
  markSaved,
} from "../io/draftPersist";
import {
  EDITOR_LAYER_GROUPS,
  LAYER_PRESET_BUTTONS,
  MAP_MODE_PRESETS,
  activeMapModePreset,
  applyLayerPreset,
  mapModePresetFromHotkey,
  type LayerPresetId,
} from "../ui/mapLayers";
import { LAYER_LUCIDE } from "../ui/layerIcons";
import { useCampaignSessionCtx } from "./CampaignSessionContext";
import { GmLiveConductor } from "./gm";
import type { GmLiveDomainId } from "../state/types";
import { depositPaintPool } from "../state/depositPaint";
import { RESOURCE_ICON_SLUGS } from "../state/resourcePool.generated";
import { MAP_STYLE_OPTIONS } from "../ui/mapStylePrefs";

type TabId = "tools" | "layers" | "file" | "session";

const TOOL_GROUPS: {
  title: string;
  tools: { id: EditorTool; label: string; hint: string }[];
}[] = [
  {
    title: "Карта",
    tools: [
      {
        id: "select",
        label: "Выбор",
        hint: "Клик — выбрать · Ctrl — добавить · рамка по пустому · перенос флотов/легионов · Shift+флот: маршрут · ПКМ — меню · СКМ — пан",
      },
      { id: "brush", label: "Кисть", hint: "Рисуйте область — системы и связи" },
      { id: "add_system", label: "Звезда", hint: "Клик — звёздная система" },
      { id: "add_corridor", label: "Коридор", hint: "Клик — узел без звезды" },
      {
        id: "add_link",
        label: "Сцена",
        hint: "Клик A → B: создать/снять гиперлинк. Клик по линии — выбрать",
      },
      {
        id: "draw_sector",
        label: "Сектор",
        hint: "Клики — вершины. Shift+клик / даблклик — замкнуть (≥3)",
      },
      {
        id: "delete",
        label: "Удалить",
        hint: "Удалить систему/флот/связь; при мультивыборе — все выделенные системы",
      },
    ],
  },
  {
    title: "Космос",
    tools: [
      {
        id: "mark_anomaly",
        label: "Аномалия",
        hint: "Клик — аномалия (дрейф по ходам). Ctrl+выделение — на группу",
      },
      {
        id: "mark_asteroid",
        label: "Астероиды",
        hint: "Астероидное поле на системе",
      },
      {
        id: "mark_nebula",
        label: "Туманность",
        hint: "Газопылевая туманность",
      },
      {
        id: "mark_debris",
        label: "Обломки",
        hint: "Поле мусора / обломки",
      },
      {
        id: "mark_pirate",
        label: "Пираты",
        hint: "Пиратское логово",
      },
      {
        id: "mark_hub",
        label: "Хаб",
        hint: "Торговый / вольный порт",
      },
      {
        id: "mark_ruin",
        label: "Руины",
        hint: "Руины / мёртвый мир",
      },
      {
        id: "mark_dead_zone",
        label: "Мёртвая зона",
        hint: "Помехи сканерам (можно вместе с другими метками)",
      },
      {
        id: "mark_minefield",
        label: "Мины",
        hint: "Минное поле — клик включает/выключает",
      },
      {
        id: "mark_relay",
        label: "Релей",
        hint: "Релей / маяк",
      },
      {
        id: "mark_storm",
        label: "Шторм",
        hint: "Ионный шторм",
      },
      {
        id: "mark_wormhole",
        label: "Червоточина",
        hint: "Портал / червоточина",
      },
      {
        id: "mark_black_hole",
        label: "Чёрная дыра",
        hint: "Гравитационная аномалия",
      },
      {
        id: "mark_comet",
        label: "Комета",
        hint: "Комета или рой комет",
      },
      {
        id: "mark_pulsar",
        label: "Пульсар",
        hint: "Пульсар / жёсткое излучение",
      },
      {
        id: "mark_shipyard",
        label: "Верфь",
        hint: "Орбитальная верфь",
      },
      {
        id: "mark_outpost",
        label: "Форпост",
        hint: "Военный / пограничный форпост",
      },
      {
        id: "mark_fortress",
        label: "Крепость",
        hint: "Укреплённый узел",
      },
      {
        id: "mark_beacon",
        label: "Маяк",
        hint: "Навигационный маяк",
      },
      {
        id: "mark_sanctuary",
        label: "Убежище",
        hint: "Святилище / убежище / нейтральная зона",
      },
      {
        id: "mark_refugees",
        label: "Беженцы",
        hint: "Лагерь беженцев (upkeep supply + давление)",
      },
      {
        id: "mark_quarantine",
        label: "Карантин",
        hint: "Запрет входа флотом + штраф роста pop",
      },
      {
        id: "mark_depot",
        label: "Депо",
        hint: "Снабжение фронта / дальность атак",
      },
      {
        id: "mark_propaganda",
        label: "Пропаганда",
        hint: "Вышка: стабильность / давление",
      },
      {
        id: "mark_forge",
        label: "Кузница",
        hint: "Орбитальная / системная кузница",
      },
      {
        id: "mark_frontline",
        label: "Фронт",
        hint: "Линия фронта",
      },
      {
        id: "mark_mining_platform",
        label: "Добыча",
        hint: "Автоматическая добычная платформа / шахты",
      },
      {
        id: "mark_abandoned_station",
        label: "Брош. станция",
        hint: "Покинутая торговая / орбитальная станция",
      },
      {
        id: "mark_science_arch",
        label: "Науч. арка",
        hint: "Научная арка / разрушенная исследбаза",
      },
      {
        id: "mark_agronomy",
        label: "Агродроны",
        hint: "Дроны-агрономы / орбитальное земледелие",
      },
      {
        id: "mark_biocupola",
        label: "Биокупол",
        hint: "Орбитальные биокупола",
      },
      {
        id: "mark_hydro_lab",
        label: "Гидролаб",
        hint: "Гидролаборатории / абиссальные станции",
      },
      {
        id: "mark_security_post",
        label: "Охрана",
        hint: "Охранная станция",
      },
      {
        id: "mark_grav_field",
        label: "Гравиполе",
        hint: "Гравитационные / магнитные пояса и аномалии",
      },
      {
        id: "clear_poi",
        label: "Сброс меток",
        hint: "Снять все космические метки с системы",
      },
      {
        id: "consequence_paint",
        label: "Последствие",
        hint: "Клик — пресет из панели GM (бой/эвак/карантин…)",
      },
    ],
  },
  {
    title: "Ресурсы",
    tools: [],
  },
  {
    title: "Владение",
    tools: [
      {
        id: "paint_faction",
        label: "Владение",
        hint: "Клик — основная держава (активная фракция); на выделенных — сразу на все",
      },
      {
        id: "paint_coowner",
        label: "Совладелец",
        hint: "Клик — добавить/снять активную фракцию как второго владельца (кондоминиум)",
      },
      {
        id: "mark_contested",
        label: "Спорная",
        hint: "Клик — пометить систему как спорную (пунктирное кольцо). Повтор — снять",
      },
      {
        id: "reveal",
        label: "Разведка",
        hint: "Клик — visibleTo для активной фракции (legacy)",
      },
      {
        id: "fog_paint",
        label: "Туман+",
        hint: "Кисть тумана: скрыть систему для активной фракции (сервер)",
      },
      {
        id: "fog_erase",
        label: "Туман−",
        hint: "Стереть туман с системы для активной фракции",
      },
    ],
  },
  {
    title: "Силы",
    tools: [
      { id: "place_fleet", label: "Флот", hint: "Клик — флот активной фракции" },
      { id: "place_legion", label: "Легион", hint: "Клик — легион активной фракции" },
    ],
  },
];

const SPACE_FREQUENT = new Set<EditorTool>([
  "mark_anomaly",
  "mark_nebula",
  "mark_wormhole",
  "mark_pirate",
  "mark_hub",
  "mark_dead_zone",
  "clear_poi",
  "consequence_paint",
]);

const FACTION_TOOLS: EditorTool[] = [
  "paint_faction",
  "paint_coowner",
  "mark_contested",
  "reveal",
  "fog_paint",
  "fog_erase",
  "place_fleet",
  "place_legion",
];

const TABS_PREP: { id: TabId; label: string; Icon: typeof Wrench }[] = [
  { id: "tools", label: "Инструменты", Icon: Wrench },
  { id: "layers", label: "Слои", Icon: Layers },
  { id: "file", label: "Файл", Icon: FolderOpen },
  { id: "session", label: "Ведущий", Icon: Radio },
];

export function Toolbar({
  onOpenDomain,
}: {
  onOpenDomain?: (id: GmLiveDomainId) => void;
} = {}) {
  const {
    world,
    dirty,
    rememberSave,
    setDraftMeta,
    syncMsg,
    setSyncMsg,
    masterToken,
    setMasterToken,
  } = useCampaignSessionCtx();
  const tabs = TABS_PREP;

  const tool = useWorldStore((s) => s.tool);
  const setTool = useWorldStore((s) => s.setTool);
  const setShowFogPreview = useWorldStore((s) => s.setShowFogPreview);
  const setGmOmniscientView = useWorldStore((s) => s.setGmOmniscientView);
  const brush = useWorldStore((s) => s.brush);
  const setBrushDensity = useWorldStore((s) => s.setBrushDensity);
  const setBrushMinDistance = useWorldStore((s) => s.setBrushMinDistance);
  const setBrushLinkDistance = useWorldStore((s) => s.setBrushLinkDistance);
  const setBrushCorridorChance = useWorldStore((s) => s.setBrushCorridorChance);
  const applyMapLayerFlags = useWorldStore((s) => s.applyMapLayerFlags);
  const editorGraphics = useWorldStore((s) => s.editorGraphics);
  const toggleEditorGraphic = useWorldStore((s) => s.toggleEditorGraphic);
  const mapStyle = useWorldStore((s) => s.mapStyle);
  const setMapStyle = useWorldStore((s) => s.setMapStyle);
  const layerFlags = useWorldStore(
    useShallow(
      (s): MapLayerFlags => ({
        showLinks: s.showLinks,
        showOwnership: s.showOwnership,
        showTerritory: s.showTerritory,
        showSectors: s.showSectors,
        showFactionLabels: s.showFactionLabels,
        showLabels: s.showLabels,
        showFleets: s.showFleets,
        showLegions: s.showLegions,
        showOrders: s.showOrders,
        showDiplomacy: s.showDiplomacy,
        showFogPreview: s.showFogPreview,
        gmOmniscientView: s.gmOmniscientView,
        showJumpRange: s.showJumpRange,
        showSupply: s.showSupply,
        showCaravans: s.showCaravans,
        showBlockades: s.showBlockades,
        showDeadZones: s.showDeadZones,
        showTraffic: s.showTraffic,
        showQuests: s.showQuests,
        showLoyalty: s.showLoyalty,
      }),
    ),
  );
  const pendingCapitalFactionId = useWorldStore(
    (s) => s.pendingCapitalFactionId,
  );
  const finishSectorDraft = useWorldStore((s) => s.finishSectorDraft);
  const undoSectorDraftPoint = useWorldStore((s) => s.undoSectorDraftPoint);
  const clearSectorDraft = useWorldStore((s) => s.clearSectorDraft);
  const sectorDraftPoints = useWorldStore((s) => s.sectorDraftPoints);
  const revealAllVisible = useWorldStore((s) => s.revealAllVisible);
  const clearFactionReveals = useWorldStore((s) => s.clearFactionReveals);
  const advanceTurn = useWorldStore((s) => s.advanceTurn);
  const restoreTurnSnapshot = useWorldStore((s) => s.restoreTurnSnapshot);
  const loadWorld = useWorldStore((s) => s.loadWorld);
  const resetWorld = useWorldStore((s) => s.resetWorld);
  const publishCampaign = useWorldStore((s) => s.publishCampaign);
  const publishStatus = useWorldStore((s) => s.publishStatus);
  const setOrderStatus = useWorldStore((s) => s.setOrderStatus);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const setActiveFaction = useWorldStore((s) => s.setActiveFaction);
  const activeResource = useWorldStore((s) => s.activeResource);
  const setActiveResource = useWorldStore((s) => s.setActiveResource);

  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabId>("tools");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    Карта: true,
  });
  const [spaceQuery, setSpaceQuery] = useState("");
  const [spaceAll, setSpaceAll] = useState(false);
  const resourceNames = depositPaintPool();

  const activeMapMode = activeMapModePreset(layerFlags);

  const applyMapMode = (id: LayerPresetId) => {
    applyMapLayerFlags(applyLayerPreset(layerFlags, id));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const id = mapModePresetFromHotkey(e.key);
      if (!id) return;
      /* F1–F4, F6–F9 = GM domains (F5 = browser refresh). Layers: Shift+F4–F9, F10 = logistics. */
      const layerHotkey =
        (e.key === "F10" && !e.shiftKey) ||
        (e.shiftKey && /^F[4-9]$/.test(e.key));
      if (!layerHotkey) return;
      e.preventDefault();
      const flags = useWorldStore.getState();
      applyMapLayerFlags(
        applyLayerPreset(
          {
            showLinks: flags.showLinks,
            showOwnership: flags.showOwnership,
            showTerritory: flags.showTerritory,
            showSectors: flags.showSectors,
            showFactionLabels: flags.showFactionLabels,
            showLabels: flags.showLabels,
            showFleets: flags.showFleets,
            showLegions: flags.showLegions,
            showOrders: flags.showOrders,
            showDiplomacy: flags.showDiplomacy,
            showFogPreview: flags.showFogPreview,
            gmOmniscientView: flags.gmOmniscientView,
            showJumpRange: flags.showJumpRange,
            showSupply: flags.showSupply,
            showCaravans: flags.showCaravans,
            showBlockades: flags.showBlockades,
            showDeadZones: flags.showDeadZones,
            showTraffic: flags.showTraffic,
            showQuests: flags.showQuests,
            showLoyalty: flags.showLoyalty,
          },
          id,
        ),
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyMapLayerFlags]);

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const activeFaction = world.factions.find((f) => f.id === activeFactionId);

  const onSaveZip = async () => {
    const blob = await exportCampaignZip(world);
    downloadBlob(blob, `${slug(world.meta.name)}.gmap.zip`);
    rememberSave();
  };

  const onSavePortableJson = () => {
    downloadBlob(exportCampaignJson(world), `${slug(world.meta.name)}.gmap.json`);
  };

  const onLoad = async (file: File) => {
    if (file.name.endsWith(".zip") || file.name.endsWith(".gmap.zip")) {
      loadWorld(await importCampaignZip(file), { resetUi: true });
    } else {
      loadWorld(await importCampaignJson(file), { resetUi: true });
    }
    rememberSave();
    setSyncMsg(`Загружен файл: ${file.name}`);
  };

  const loadLoreCampaign = async () => {
    if (
      dirty &&
      !confirm("Есть несохранённые правки / черновик новее. Заменить картой из лора?")
    ) {
      return;
    }
    setSyncMsg("Загрузка лора LO GOLDEN PAX…");
    try {
      const res = await fetch("/campaigns/lo_golden_pax.json");
      if (!res.ok) throw new Error(await res.text());
      const data = parseWorldJson(await res.json());
      loadWorld(data, { resetUi: true });
      rememberSave();
      setSyncMsg(
        `Лор загружен: ${data.systems.length} систем, ход ${data.meta.turn}`,
      );
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const restoreLocalDraft = () => {
    const draft = loadDraft();
    if (!draft) {
      setSyncMsg("Черновик в браузере пуст");
      return;
    }
    loadWorld(draft, { resetUi: true });
    const meta = getDraftMeta();
    if (meta) markSaved(meta.savedAt);
    setSyncMsg(`Черновик восстановлен · ${draft.systems.length} систем`);
  };

  const syncOrders = async () => {
    setSyncMsg("Загрузка приказов…");
    try {
      const res = await fetch("/api/orders", {
        headers: { "X-Master-Token": masterToken },
      });
      if (!res.ok) throw new Error(await res.text());
      const orders = (await res.json()) as PlayerOrder[];
      const w = useWorldStore.getState().world;
      loadWorld({ ...w, orders });
      setSyncMsg(`Загружено приказов: ${orders.length}`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <aside className="panel panel-left rail">
      <nav
        className="gm-mode-switch gm-mode-switch--studios rail-tabs"
        role="tablist"
        aria-label="Разделы панели"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`gm-mode-btn ${tab === t.id ? "on" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className="gm-mode-icon">
              <t.Icon size={13} strokeWidth={2.25} aria-hidden />
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {tab === "layers" && (
        <div className="map-mode-bar" role="toolbar" aria-label="Режимы карты">
          {MAP_MODE_PRESETS.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`layer-chip map-mode-chip ${activeMapMode === mode.id ? "on" : ""}`}
              aria-pressed={activeMapMode === mode.id}
              title={
                mode.hotkey === "F10"
                  ? `${mode.hint} · F10`
                  : `${mode.hint} · ⇧${mode.hotkey}`
              }
              onClick={() => applyMapMode(mode.id)}
            >
              <span>{mode.label}</span>
              <kbd className="map-mode-kbd">
                {mode.hotkey === "F10" ? "F10" : `⇧${mode.hotkey}`}
              </kbd>
            </button>
          ))}
          {LAYER_PRESET_BUTTONS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="layer-chip map-mode-chip"
              title={p.hint}
              onClick={() => applyMapMode(p.id)}
            >
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="tab-body">
        {tab === "tools" && (
          <>
            {(FACTION_TOOLS.includes(tool) || pendingCapitalFactionId) && (
              <div className="faction-chip">
                <span className="hint">
                  {pendingCapitalFactionId
                    ? "Столица для:"
                    : "Активная держава:"}
                </span>
                <select
                  value={
                    pendingCapitalFactionId ?? activeFactionId ?? ""
                  }
                  onChange={(e) => setActiveFaction(e.target.value || null)}
                  disabled={!!pendingCapitalFactionId}
                >
                  {!pendingCapitalFactionId && (
                    <option value="">— держава —</option>
                  )}
                  {world.factions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                {activeFaction && (
                  <span
                    className="swatch"
                    style={{ background: activeFaction.color }}
                    title={activeFaction.name}
                  />
                )}
              </div>
            )}
            {pendingCapitalFactionId && (
              <p className="hint polity-pending-hint">
                Кликните систему на карте, чтобы назначить столицу.
              </p>
            )}

            {TOOL_GROUPS.map((group) => {
              const open = !!openSections[group.title];
              const isResources = group.title === "Ресурсы";
              const isSpace = group.title === "Космос";
              const spaceQ = spaceQuery.trim().toLowerCase();
              const spaceTools = isSpace
                ? spaceQ
                  ? group.tools.filter(
                      (t) =>
                        t.label.toLowerCase().includes(spaceQ) ||
                        t.hint.toLowerCase().includes(spaceQ),
                    )
                  : spaceAll
                    ? group.tools
                    : group.tools.filter((t) => SPACE_FREQUENT.has(t.id))
                : group.tools;
              return (
                <section key={group.title} className="tool-section">
                  <button
                    type="button"
                    className="tool-section-toggle"
                    onClick={() => toggleSection(group.title)}
                    aria-expanded={open}
                  >
                    {open ? (
                      <ChevronDown size={14} aria-hidden />
                    ) : (
                      <ChevronRight size={14} aria-hidden />
                    )}
                    <h3>{group.title}</h3>
                    {(isResources || isSpace) && (
                      <span className="tool-section-count">
                        {isResources ? resourceNames.length : group.tools.length}
                      </span>
                    )}
                  </button>
                  {open && (
                    <div className="tool-section-body">
                      {isSpace && (
                        <>
                          <input
                            type="search"
                            className="tool-space-search"
                            placeholder="Найти метку…"
                            value={spaceQuery}
                            aria-label="Поиск космических меток"
                            onChange={(e) => {
                              setSpaceQuery(e.target.value);
                            }}
                          />
                          {!spaceQ && !spaceAll && (
                            <p className="hint">
                              Частые метки. Поиск или «все» — полный список.
                            </p>
                          )}
                        </>
                      )}
                      {!isResources && (
                        <div className={`tool-grid${isSpace ? " tool-grid--space" : ""}`}>
                          {(isSpace ? spaceTools : group.tools).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              className={tool === t.id ? "tool active" : "tool"}
                              title={t.hint}
                              onClick={() => {
                                setTool(t.id);
                                if (
                                  t.id === "fog_paint" ||
                                  t.id === "fog_erase"
                                ) {
                                  setShowFogPreview(true);
                                  setGmOmniscientView(true);
                                }
                              }}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {isSpace && !spaceQ && !spaceAll && (
                        <button
                          type="button"
                          className="btn ghost block"
                          onClick={() => setSpaceAll(true)}
                        >
                          Все метки · {group.tools.length}
                        </button>
                      )}
                      {isSpace && spaceAll && !spaceQ && (
                        <button
                          type="button"
                          className="btn ghost block"
                          onClick={() => setSpaceAll(false)}
                        >
                          Только частые
                        </button>
                      )}
                      {isSpace && spaceQ && spaceTools.length === 0 && (
                        <p className="hint">Нет меток по запросу.</p>
                      )}
                      {isResources && (
                        <>
                          <p className="hint">
                            Клик по ресурсу — режим «сыпать». Затем клик по
                            системе: ~55% на планету, иначе в системные запасы.
                          </p>
                          <div className="tool-grid resource-tool-grid">
                            {resourceNames.map((r) => {
                              const slug = RESOURCE_ICON_SLUGS[r];
                              const active =
                                tool === "paint_resource" &&
                                activeResource === r;
                              return (
                                <button
                                  key={r}
                                  type="button"
                                  className={
                                    active
                                      ? "tool resource-tool active"
                                      : "tool resource-tool"
                                  }
                                  title={`Сыпать «${r}»`}
                                  onClick={() => {
                                    setActiveResource(r);
                                    setTool("paint_resource");
                                  }}
                                >
                                  {slug ? (
                                    <img
                                      className="resource-tool-icon"
                                      src={`/icons/game/resources/${slug}.svg`}
                                      alt=""
                                      width={16}
                                      height={16}
                                    />
                                  ) : null}
                                  <span>{r}</span>
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
            {tool.startsWith("mark_") && (
              <p className="hint">
                Метки{" "}
                <strong>
                  складываются
                </strong>
                : повторный клик снимает. Можно держать пиратов + астероиды +
                аномалию на одной системе.
              </p>
            )}

            {tool === "draw_sector" && (
              <section>
                <h3>Чертёж сектора</h3>
                <p className="hint">
                  Точек: {Math.floor(sectorDraftPoints.length / 2)} (нужно ≥ 3)
                </p>
                <div className="btn-col">
                  <button
                    type="button"
                    className="btn"
                    disabled={sectorDraftPoints.length < 6}
                    onClick={() => finishSectorDraft()}
                  >
                    Замкнуть сектор
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => undoSectorDraftPoint()}
                  >
                    Отменить точку
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => clearSectorDraft()}
                  >
                    Очистить чертёж
                  </button>
                </div>
              </section>
            )}

            {tool === "reveal" && (
              <section>
                <h3>Туман войны (legacy reveal)</h3>
                <div className="btn-col">
                  <button type="button" className="btn ghost" onClick={revealAllVisible}>
                    Открыть всё активной фракции
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={clearFactionReveals}
                  >
                    Сбросить разведку фракции
                  </button>
                </div>
              </section>
            )}

            {(tool === "fog_paint" || tool === "fog_erase") && (
              <section>
                <h3>Туман (серверная кисть)</h3>
                <p className="hint">
                  Красит mask для <strong>активной фракции</strong>. Скрывает
                  чужие/нейтральные системы в зоне видимости;{" "}
                  <strong>свои миры и флоты туман не скрывает</strong>.
                  Превью включается автоматически.
                </p>
              </section>
            )}

            {tool === "brush" && (
              <section>
                <h3>Кисть генерации</h3>
                <label className="slider-row">
                  <span>Плотность ({brush.density.toFixed(2)})</span>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={brush.density}
                    onChange={(e) => setBrushDensity(Number(e.target.value))}
                  />
                </label>
                <label className="slider-row">
                  <span>Мин. дистанция ({brush.minDistance})</span>
                  <input
                    type="range"
                    min={24}
                    max={120}
                    step={2}
                    value={brush.minDistance}
                    onChange={(e) => setBrushMinDistance(Number(e.target.value))}
                  />
                </label>
                <label className="slider-row">
                  <span>Длина связей ({brush.linkDistance})</span>
                  <input
                    type="range"
                    min={60}
                    max={240}
                    step={10}
                    value={brush.linkDistance}
                    onChange={(e) => setBrushLinkDistance(Number(e.target.value))}
                  />
                </label>
                <label className="slider-row">
                  <span>Доля коридоров ({Math.round(brush.corridorChance * 100)}%)</span>
                  <input
                    type="range"
                    min={0}
                    max={0.5}
                    step={0.05}
                    value={brush.corridorChance}
                    onChange={(e) => setBrushCorridorChance(Number(e.target.value))}
                  />
                </label>
              </section>
            )}
          </>
        )}

        {tab === "layers" && (
          <section>
            {EDITOR_LAYER_GROUPS.map((group) => (
              <div key={group.title} className="layer-group">
                <h4 className="layer-group-title">{group.title}</h4>
                <div className="layer-chip-grid">
                  {group.items.map((item) => {
                    const on = layerFlags[item.key];
                    const Icon = LAYER_LUCIDE[item.icon];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={`layer-chip ${on ? "on" : ""}`}
                        aria-pressed={on}
                        onClick={() =>
                          applyMapLayerFlags({ [item.key]: !on })
                        }
                      >
                        <Icon size={13} strokeWidth={2.25} aria-hidden />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="layer-group">
              <h4 className="layer-group-title">Графика</h4>
              <p className="hint">
                Анимация должна пульсировать системы ~12 раз/сек без пана.
                Cinematic — доп. polish, тяжелее.
              </p>
              <div className="layer-chip-grid">
                {(
                  [
                    "animations",
                    "tableFx",
                    "battleFx",
                    "scarFx",
                    "cinematic",
                  ] as const
                ).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`layer-chip ${editorGraphics[key] ? "on" : ""}`}
                    aria-pressed={editorGraphics[key]}
                    title={
                      key === "animations"
                        ? "Пульс систем / звёзд без перетаскивания карты"
                        : key === "cinematic"
                          ? "Доп. polish: больше звёзд, тени, пульс. Только ПК."
                          : key
                    }
                    onClick={() => toggleEditorGraphic(key)}
                  >
                    <span>
                      {key === "animations"
                        ? "Анимация"
                        : key === "tableFx"
                          ? "Стол / фон"
                          : key === "battleFx"
                            ? "Бой FX"
                            : key === "scarFx"
                              ? "Шрамы"
                              : "Cinematic"}
                    </span>
                  </button>
                ))}
              </div>
              <h4 className="layer-group-title" style={{ marginTop: "0.75rem" }}>
                Язык карты
              </h4>
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
                    onClick={() => setMapStyle(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {tab === "file" && (
          <>
            <section>
              <h3>Кампания</h3>
              <p className="meta-line">
                Ход {world.meta.turn} · систем {world.systems.length} · флотов{" "}
                {world.fleets.length} · секторов {world.sectors.length}
              </p>
              <p className="hint">
                Номер хода — клик по «ход N» в полоске сверху (без тика).
                Сохранение — кнопкой сверху. Здесь загрузка и экспорт.
              </p>
              <div className="btn-col">
                <button type="button" className="btn ghost" onClick={restoreLocalDraft}>
                  Восстановить черновик браузера
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void loadLoreCampaign()}
                >
                  Загрузить лор LO GOLDEN PAX
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => fileRef.current?.click()}
                >
                  Открыть файл…
                </button>
              </div>
            </section>

            <section>
              <h3>Экспорт / ход</h3>
              <div className="btn-col">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const label = prompt(
                      "Метка снимка хода (необязательно):",
                      `Конец хода ${world.meta.turn}`,
                    );
                    if (label === null) return;
                    advanceTurn(label);
                  }}
                >
                  Следующий ход (снимок)
                </button>
                <button type="button" className="btn ghost" onClick={() => void onSaveZip()}>
                  Экспорт ZIP
                </button>
                <button type="button" className="btn ghost" onClick={onSavePortableJson}>
                  Экспорт portable JSON
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    downloadText(
                      exportCampaignMarkdown(world),
                      `${slug(world.meta.name)}.md`,
                      "text/markdown;charset=utf-8",
                    );
                  }}
                >
                  Экспорт Markdown
                </button>
              </div>
              <details className="insp-fold">
                <summary>Плакаты и PNG</summary>
                <div className="btn-col">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    void (async () => {
                      const ok = await exportMapPng(
                        `${slug(world.meta.name)}.png`,
                      );
                      if (!ok) {
                        alert(
                          "Карта ещё не готова — подождите кадр и повторите",
                        );
                      }
                    })();
                  }}
                >
                  Экспорт PNG
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    void (async () => {
                      const ok = await exportMapPosterPng(world, {
                        filename: `${slug(world.meta.name)}_ход${world.meta.turn}.png`,
                      });
                      if (!ok) {
                        alert(
                          "Карта ещё не готова — подождите кадр и повторите",
                        );
                      }
                    })();
                  }}
                >
                  Плакат PNG
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  title="Только видимая игроку область (активная держава + туман)"
                  onClick={() => {
                    void (async () => {
                      const fac = world.factions.find(
                        (f) => f.id === activeFactionId,
                      );
                      const ok = await exportMapPlayerPosterPng(world, {
                        factionId: activeFactionId,
                        factionName: fac?.name,
                      });
                      if (!ok) {
                        alert(
                          activeFactionId
                            ? "Нет видимых систем для этой державы — или карта ещё не готова"
                            : "Выберите державу в фокусе ГМ",
                        );
                      }
                    })();
                  }}
                >
                  Плакат · вид игрока
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  title="PNG без рамки — только видимая игроку область"
                  onClick={() => {
                    void (async () => {
                      const fac = world.factions.find(
                        (f) => f.id === activeFactionId,
                      );
                      const facSlug = (fac?.name || "игрок").replace(
                        /\s+/g,
                        "_",
                      );
                      const ok = await exportMapPlayerPng(
                        `${slug(world.meta.name)}_ход${world.meta.turn}_${facSlug}_вид.png`,
                        { factionId: activeFactionId },
                      );
                      if (!ok) {
                        alert(
                          activeFactionId
                            ? "Нет видимых систем для этой державы — или карта ещё не готова"
                            : "Выберите державу в фокусе ГМ",
                        );
                      }
                    })();
                  }}
                >
                  PNG · вид игрока
                </button>
                </div>
              </details>
              <div className="btn-col">
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    if (
                      confirm(
                        "Сбросить карту и очистить черновик браузера?",
                      )
                    ) {
                      clearDraft();
                      setDraftMeta(null);
                      resetWorld();
                      setSyncMsg("Карта сброшена");
                    }
                  }}
                >
                  Новая карта
                </button>
              </div>
              {(world.turnHistory?.length ?? 0) > 0 && (
                <div className="turn-history">
                  <div className="block-title">Снимки ходов</div>
                  {[...(world.turnHistory ?? [])].reverse().map((snap, revIdx) => {
                    const index = (world.turnHistory?.length ?? 0) - 1 - revIdx;
                    return (
                      <button
                        key={`${snap.turn}-${snap.savedAt}`}
                        type="button"
                        className="btn ghost block"
                        onClick={() => {
                          if (
                            confirm(
                              `Восстановить снимок хода ${snap.turn}? Текущее состояние после него будет потеряно.`,
                            )
                          ) {
                            restoreTurnSnapshot(index);
                          }
                        }}
                      >
                        Ход {snap.turn}: {snap.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <input
              ref={fileRef}
              type="file"
              accept=".zip,.json,.gmap.zip,.gmap.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onLoad(f);
                e.target.value = "";
              }}
            />
          </>
        )}

        {tab === "session" && (
          <>
            <GmLiveConductor onOpenDomain={onOpenDomain} />
            <section className="insp-sheet">
                  <h3>Публикация и токен</h3>
                  <p className="hint">
                    Ссылка для игроков — сверху. Сценарий хода — чип «сценарий»
                    в нотче. F7 — квесты, NPC, кубики.
                  </p>
                  <label className="field">
                    <span>Мастер-токен</span>
                    <input
                      value={masterToken}
                      onChange={(e) => setMasterToken(e.target.value)}
                    />
                  </label>
                  <div className="btn-col">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => void publishCampaign(masterToken)}
                    >
                      Опубликовать карту (без новой ссылки)
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => void syncOrders()}
                    >
                      Загрузить приказы игроков
                    </button>
                  </div>
                  {publishStatus && <p className="hint">{publishStatus}</p>}
                </section>

                {world.orders.length > 0 && (
                  <section>
                    <h3>Приказы (legacy · {world.orders.length})</h3>
                    <div className="order-list">
                      {world.orders.map((o) => {
                        const faction = world.factions.find(
                          (f) => f.id === o.factionId,
                        );
                        return (
                          <div key={o.id} className="order-card">
                            <div>
                              <strong>{faction?.name ?? o.factionId}</strong> ·{" "}
                              {o.type}
                              <br />
                              <span className="hint">{o.status}</span>
                            </div>
                            {o.status === "pending" && (
                              <div className="order-actions">
                                <button
                                  type="button"
                                  className="btn ghost"
                                  onClick={() =>
                                    setOrderStatus(o.id, "accepted")
                                  }
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  className="btn danger"
                                  onClick={() =>
                                    setOrderStatus(o.id, "rejected")
                                  }
                                >
                                  Нет
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
          </>
        )}
      </div>

      {syncMsg && <p className="status-toast">{syncMsg}</p>}
    </aside>
  );
}

function slug(name: string): string {
  return name.replace(/[^\wа-яё\-]+/gi, "_").slice(0, 40) || "campaign";
}
