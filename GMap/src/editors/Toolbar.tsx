import { useRef, useState } from "react";
import {
  BookOpen,
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
} from "../ui/mapLayers";
import { LAYER_LUCIDE } from "../ui/layerIcons";
import { useCampaignSessionCtx } from "./CampaignSessionContext";
import { IntentsInbox } from "./IntentsInbox";
import { EconomyPanel } from "./EconomyPanel";
import { CombatPanel } from "./CombatPanel";
import { GmOpsPanel } from "./GmOpsPanel";
import { CampaignPanel } from "./CampaignPanel";
import { RESOURCE_POOL } from "../state/defaults";

type TabId = "tools" | "layers" | "file" | "session" | "campaign";

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
        label: "Связь",
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
    tools: [
      {
        id: "paint_resource",
        label: "Сыпать…",
        hint: "Выберите ресурс ниже и кликайте системы. Часть попадёт на планеты, часть — в систему",
      },
    ],
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

const ALL_TOOLS = TOOL_GROUPS.flatMap((g) => g.tools);

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

const TABS: { id: TabId; label: string; Icon: typeof Wrench }[] = [
  { id: "tools", label: "Инструменты", Icon: Wrench },
  { id: "layers", label: "Слои", Icon: Layers },
  { id: "file", label: "Файл", Icon: FolderOpen },
  { id: "session", label: "Сессия", Icon: Radio },
  { id: "campaign", label: "Кампания", Icon: BookOpen },
];

export function Toolbar() {
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

  const tool = useWorldStore((s) => s.tool);
  const setTool = useWorldStore((s) => s.setTool);
  const brush = useWorldStore((s) => s.brush);
  const setBrushDensity = useWorldStore((s) => s.setBrushDensity);
  const setBrushMinDistance = useWorldStore((s) => s.setBrushMinDistance);
  const setBrushLinkDistance = useWorldStore((s) => s.setBrushLinkDistance);
  const setBrushCorridorChance = useWorldStore((s) => s.setBrushCorridorChance);
  const applyMapLayerFlags = useWorldStore((s) => s.applyMapLayerFlags);
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
        showJumpRange: s.showJumpRange,
        showSupply: s.showSupply,
        showCaravans: s.showCaravans,
        showBlockades: s.showBlockades,
        showDeadZones: s.showDeadZones,
        showTraffic: s.showTraffic,
        showQuests: s.showQuests,
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
      loadWorld(await importCampaignZip(file));
    } else {
      loadWorld(await importCampaignJson(file));
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
      loadWorld(data);
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
    loadWorld(draft);
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
      loadWorld({ ...world, orders });
      setSyncMsg(`Загружено приказов: ${orders.length}`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <aside className="panel panel-left">
      <nav className="tab-bar" aria-label="Разделы панели">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            <t.Icon size={14} strokeWidth={2.25} aria-hidden />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

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
                  onChange={(e) => setActiveFaction(e.target.value)}
                  disabled={!!pendingCapitalFactionId}
                >
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

            {TOOL_GROUPS.map((group) => (
              <section key={group.title}>
                <h3>{group.title}</h3>
                <div className="tool-grid">
                  {group.tools.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={tool === t.id ? "tool active" : "tool"}
                      title={t.hint}
                      onClick={() => setTool(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <p className="hint">{ALL_TOOLS.find((t) => t.id === tool)?.hint}</p>

            {(tool === "paint_resource" ||
              TOOL_GROUPS.find((g) => g.title === "Ресурсы")?.tools.some(
                (t) => t.id === tool,
              )) && (
              <section>
                <h3>Какой ресурс</h3>
                <div className="tool-grid">
                  {RESOURCE_POOL.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={
                        tool === "paint_resource" && activeResource === r
                          ? "tool active"
                          : "tool"
                      }
                      title={`Сыпать «${r}» в системы (рандом: система / планета)`}
                      onClick={() => setActiveResource(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <p className="hint">
                  Клик по системе: ~55% на случайную планету, иначе в системные
                  запасы. В карточке планеты — только на неё.
                </p>
              </section>
            )}

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
                  Красит mask для <strong>активной фракции</strong>. Игрок не
                  видит системы в mask, пока нет флота/владения/permanent reveal.
                  Включите «Туман (превью)» в слоях, чтобы видеть veil.
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
            <h3>Режимы обзора</h3>
            <p className="hint">Быстрые пресеты слоёв — как в 4X-картах.</p>
            <div className="layer-preset-row">
              {LAYER_PRESET_BUTTONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn ghost"
                  title={p.hint}
                  onClick={() => applyMapLayerFlags(p.flags)}
                >
                  {p.label}
                </button>
              ))}
            </div>

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
                Сохранение — кнопкой сверху. Здесь загрузка, экспорт и ход.
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
                  Плакат PNG (ход)
                </button>
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
            <section>
              <h3>Сессия мастера</h3>
              <p className="hint">
                Ссылка для игроков — кнопка «Открыть для игроков» сверху.
                Здесь токен, публикация и приказы.
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

            <EconomyPanel />
            <CombatPanel />
            <GmOpsPanel />
            <IntentsInbox />

            {world.orders.length > 0 && (
              <section>
                <h3>Приказы ({world.orders.length})</h3>
                <div className="order-list">
                  {world.orders.map((o) => {
                    const faction = world.factions.find((f) => f.id === o.factionId);
                    return (
                      <div key={o.id} className="order-card">
                        <div>
                          <strong>{faction?.name ?? o.factionId}</strong> · {o.type}
                          <br />
                          <span className="hint">{o.status}</span>
                        </div>
                        {o.status === "pending" && (
                          <div className="order-actions">
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => setOrderStatus(o.id, "accepted")}
                            >
                              OK
                            </button>
                            <button
                              type="button"
                              className="btn danger"
                              onClick={() => setOrderStatus(o.id, "rejected")}
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

        {tab === "campaign" && (
          <CampaignPanel
            mode="master"
            masterToken={masterToken}
            onMsg={setSyncMsg}
          />
        )}
      </div>

      {syncMsg && <p className="status-toast">{syncMsg}</p>}
    </aside>
  );
}

function slug(name: string): string {
  return name.replace(/[^\wа-яё\-]+/gi, "_").slice(0, 40) || "campaign";
}
