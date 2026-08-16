import { useState } from "react";
import { useWorldStore } from "../state/worldStore";
import { SYSTEM_POI_LABELS } from "../state/defaults";
import type { LinkType, SystemActivity, SystemPoiType } from "../state/types";
import { SPACE_OBJECT_TYPES } from "../state/types";
import { FloatingPopover } from "../ui/FloatingPopover";

type MenuItem =
  | { type: "label"; text: string; icon?: string }
  | { type: "sep" }
  | {
      type: "action";
      label: string;
      icon?: string;
      shortcut?: string;
      active?: boolean;
      danger?: boolean;
      run: () => void;
    }
  | {
      type: "submenu";
      id: string;
      label: string;
      icon?: string;
      badge?: string | number;
      items: MenuItem[];
    };

function activityLabel(a: SystemActivity): string {
  switch (a) {
    case "battle":
      return "Бой";
    case "trade":
      return "Торговля";
    case "garrison":
      return "Гарнизон";
    case "repair":
      return "Ремонт";
    case "transit":
      return "Транзит";
    default:
      return "Нет";
  }
}

export function MapContextMenu() {
  const menu = useWorldStore((s) => s.contextMenu);
  const setContextMenu = useWorldStore((s) => s.setContextMenu);
  const world = useWorldStore((s) => s.world);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null);

  if (!menu) return null;

  const st = useWorldStore.getState();
  const system = menu.systemId
    ? world.systems.find((s) => s.id === menu.systemId)
    : null;
  const fleet = menu.fleetId
    ? world.fleets.find((f) => f.id === menu.fleetId)
    : null;
  const legion = menu.legionId
    ? world.legions.find((l) => l.id === menu.legionId)
    : null;
  const link = menu.linkId
    ? world.links.find((l) => l.id === menu.linkId)
    : null;
  const faction = world.factions.find((f) => f.id === activeFactionId);

  const close = () => {
    setOpenSubmenuId(null);
    setContextMenu(null);
  };

  const items: MenuItem[] = [];

  if (fleet) {
    items.push({ type: "label", text: `Флот · ${fleet.name}`, icon: "🚀" });
    items.push({
      type: "action",
      label: "Выбрать",
      icon: "🎯",
      run: () => {
        st.selectFleet(fleet.id);
        st.selectSystem(fleet.systemId);
        st.selectLegion(null);
        st.selectLink(null);
      },
    });
    items.push({
      type: "submenu",
      id: "fleet_orders",
      label: "Приказы (на цель)",
      icon: "⚡",
      items: [
        {
          type: "action",
          label: "→ Переместиться…",
          run: () => st.beginUnitOrder("fleet", fleet.id, "move"),
        },
        {
          type: "action",
          label: "→ Атаковать…",
          run: () => st.beginUnitOrder("fleet", fleet.id, "attack"),
        },
        {
          type: "action",
          label: "→ Укрепиться…",
          run: () => st.beginUnitOrder("fleet", fleet.id, "fortify"),
        },
        {
          type: "action",
          label: "→ Блокировать…",
          run: () => st.beginUnitOrder("fleet", fleet.id, "blockade"),
        },
        { type: "sep" },
        {
          type: "action",
          label: "Оборона на месте",
          run: () => st.updateFleet(fleet.id, { stance: "defend", route: [] }),
        },
        {
          type: "action",
          label: "Ремонт / док",
          run: () => st.updateFleet(fleet.id, { stance: "repair", route: [] }),
        },
        {
          type: "action",
          label: "Очистить маршрут",
          run: () => st.updateFleet(fleet.id, { route: [], stance: "idle" }),
        },
      ],
    });
    items.push({
      type: "action",
      label: "Клонировать… (клик по системе)",
      icon: "📋",
      run: () => st.beginFleetClone(fleet.id),
    });
    items.push({ type: "sep" });
    items.push({
      type: "action",
      label: "Удалить флот",
      icon: "🗑",
      danger: true,
      run: () => {
        if (confirm(`Удалить флот «${fleet.name}»?`)) {
          st.deleteFleet(fleet.id);
        }
      },
    });
  } else if (legion) {
    items.push({ type: "label", text: `Легион · ${legion.name}`, icon: "🛡" });
    items.push({
      type: "action",
      label: "Выбрать",
      icon: "🎯",
      run: () => {
        st.selectLegion(legion.id);
        st.selectSystem(legion.systemId);
        st.selectFleet(null);
        st.selectLink(null);
      },
    });
    items.push({
      type: "submenu",
      id: "legion_orders",
      label: "Приказы (на цель)",
      icon: "⚡",
      items: [
        {
          type: "action",
          label: "→ Марш…",
          run: () => st.beginUnitOrder("legion", legion.id, "move"),
        },
        {
          type: "action",
          label: "→ Штурм…",
          run: () => st.beginUnitOrder("legion", legion.id, "attack"),
        },
        {
          type: "action",
          label: "→ Укрепиться…",
          run: () => st.beginUnitOrder("legion", legion.id, "fortify"),
        },
        {
          type: "action",
          label: "→ Блокировать…",
          run: () => st.beginUnitOrder("legion", legion.id, "blockade"),
        },
        { type: "sep" },
        {
          type: "action",
          label: "Гарнизон на месте",
          run: () =>
            st.updateLegion(legion.id, { status: "garrison", route: [] }),
        },
        {
          type: "action",
          label: "Очистить маршрут",
          run: () => st.updateLegion(legion.id, { route: [], status: "idle" }),
        },
      ],
    });
    items.push({ type: "sep" });
    items.push({
      type: "action",
      label: "Удалить легион",
      icon: "🗑",
      danger: true,
      run: () => {
        if (confirm(`Удалить легион «${legion.name}»?`)) {
          st.deleteLegion(legion.id);
        }
      },
    });
  } else if (link) {
    const a = world.systems.find((s) => s.id === link.fromId)?.name ?? "?";
    const b = world.systems.find((s) => s.id === link.toId)?.name ?? "?";
    items.push({ type: "label", text: `Связь · ${a} ↔ ${b}`, icon: "🔗" });
    items.push({
      type: "action",
      label: "Выбрать",
      icon: "🎯",
      run: () => {
        st.selectLink(link.id);
        st.selectSystem(null);
        st.selectFleet(null);
        st.selectLegion(null);
      },
    });
    items.push({
      type: "submenu",
      id: "link_type",
      label: `Тип связи: ${link.type}`,
      icon: "✨",
      items: (["corridor", "gate", "unstable"] as LinkType[]).map((t) => ({
        type: "action",
        label: `${t === "corridor" ? "Коридор" : t === "gate" ? "Врата" : "Нестабильный"}${link.type === t ? " ✓" : ""}`,
        active: link.type === t,
        run: () => st.updateLink(link.id, { type: t }),
      })),
    });
    items.push({ type: "sep" });
    items.push({
      type: "action",
      label: "Удалить связь",
      icon: "🗑",
      danger: true,
      run: () => {
        if (confirm(`Удалить связь «${a} ↔ ${b}»?`)) {
          st.deleteLink(link.id);
        }
      },
    });
  } else if (system) {
    const multi = st.selectedSystemIds;
    const targets =
      multi.includes(system.id) && multi.length > 1 ? multi : [system.id];
    const kindLabel = system.kind === "corridor" ? "Узел" : "Система";
    const owner = system.ownerFactionId
      ? world.factions.find((f) => f.id === system.ownerFactionId)
      : null;

    items.push({
      type: "label",
      text:
        targets.length > 1
          ? `Выделено систем: ${targets.length}`
          : `${kindLabel} · ${system.name}${owner ? ` (${owner.name})` : ""}`,
      icon: system.isCapital ? "👑" : "🪐",
    });

    items.push({
      type: "action",
      label: "Открыть систему",
      icon: "🔍",
      shortcut: "Enter",
      run: () => {
        st.selectSystem(system.id);
        st.openSystemView(system.id);
      },
    });

    if (system.ownerFactionId) {
      items.push({
        type: "action",
        label: owner ? `Досье · ${owner.name}` : "Досье державы",
        icon: "🏛",
        run: () => {
          st.selectSystem(system.id);
          st.setActiveFaction(system.ownerFactionId);
          st.openPolityEditor(system.ownerFactionId);
        },
      });
    }

    items.push({
      type: "action",
      label: targets.length > 1 ? "Выбрать только эту" : "Выбрать",
      icon: "🎯",
      run: () => {
        st.selectSystem(system.id);
        st.selectFleet(null);
        st.selectLegion(null);
        st.selectLink(null);
        st.setTool("select");
      },
    });

    items.push({ type: "sep" });

    // Submenu: Владение & Суверенитет
    const sovereigntyItems: MenuItem[] = [
      {
        type: "action",
        label: faction
          ? targets.length > 1
            ? `Передать → ${faction.name} (×${targets.length})`
            : `Передать → ${faction.name}`
          : "Передать активной державе",
        icon: "🚩",
        run: () => {
          if (!activeFactionId) return;
          st.paintFactionMany(targets);
        },
      },
      {
        type: "action",
        label: system.isCapital ? "Снять статус столицы" : "Сделать столицей",
        icon: "👑",
        run: () => {
          st.selectSystem(system.id);
          st.updateSelectedSystem({ isCapital: !system.isCapital });
        },
      },
      {
        type: "action",
        label: system.contested ? "Снять статус «спорная»" : "Пометить как спорную",
        icon: "⚔",
        run: () => st.toggleContestedMany(targets),
      },
    ];

    if (st.activeFactionId) {
      sovereigntyItems.push({
        type: "action",
        label: "Совладелец = активная держава",
        icon: "🤝",
        run: () => st.paintCoOwnerMany(targets),
      });
    }

    sovereigntyItems.push({
      type: "action",
      label: "Сбросить владение (нейтрал)",
      icon: "⚪",
      danger: true,
      run: () => {
        st.selectSystem(system.id);
        st.updateSelectedSystem({ ownerFactionId: null });
      },
    });

    items.push({
      type: "submenu",
      id: "sovereignty",
      label: "Владение & Суверенитет",
      icon: "👑",
      badge: owner?.name || "Нейтрал",
      items: sovereigntyItems,
    });

    // Submenu: Силы & Войска
    items.push({
      type: "submenu",
      id: "forces",
      label: "Силы & Дислокация",
      icon: "🚀",
      items: [
        {
          type: "action",
          label: "Разместить флот",
          icon: "🚀",
          run: () => {
            st.selectSystem(system.id);
            st.placeFleetOnSystem(system.id);
          },
        },
        {
          type: "action",
          label: "Разместить легион",
          icon: "🛡",
          run: () => {
            st.selectSystem(system.id);
            st.placeLegionOnSystem(system.id);
          },
        },
        {
          type: "action",
          label: "Протянуть гиперсвязь отсюда",
          icon: "🔗",
          run: () => {
            st.setTool("add_link");
            st.setLinkDraftFrom(system.id);
            st.selectSystem(system.id);
          },
        },
      ],
    });

    // Submenu: Космические объекты (POI)
    const poiItems: MenuItem[] = ([...SPACE_OBJECT_TYPES, "none"] as SystemPoiType[]).map((poi) => {
      const isSet =
        poi !== "none"
          ? (system.spaceObjects ?? []).includes(poi) || system.poiType === poi
          : (!system.spaceObjects?.length || system.spaceObjects.includes("none")) &&
            (!system.poiType || system.poiType === "none");
      return {
        type: "action",
        label: `${SYSTEM_POI_LABELS[poi] ?? poi}${isSet ? " ✓" : ""}`,
        active: isSet,
        run: () => st.applySystemPoiMany(targets, poi),
      };
    });

    items.push({
      type: "submenu",
      id: "space_objects",
      label: "Объекты & Аномалии",
      icon: "🪐",
      badge: system.spaceObjects?.length ? system.spaceObjects.length : undefined,
      items: poiItems,
    });

    // Submenu: Активность
    const activityItems: MenuItem[] = (
      ["none", "battle", "trade", "garrison", "repair", "transit"] as SystemActivity[]
    ).map((a) => {
      const isCurrent = system.activity === a;
      return {
        type: "action",
        label: `${activityLabel(a)}${isCurrent ? " ✓" : ""}`,
        active: isCurrent,
        run: () => {
          st.selectSystem(system.id);
          st.updateSelectedSystem({
            activity: a,
            tradeWithSystemId: a === "trade" ? system.tradeWithSystemId : null,
          });
        },
      };
    });

    items.push({
      type: "submenu",
      id: "activity",
      label: "Активность сектора",
      icon: "⚡",
      badge: system.activity && system.activity !== "none" ? activityLabel(system.activity) : undefined,
      items: activityItems,
    });

    // Quick Action: Разведка
    items.push({
      type: "action",
      label: "Разведка / Туман (вкл/выкл)",
      icon: "👁",
      run: () => st.revealSystem(system.id),
    });

    items.push({ type: "sep" });
    items.push({
      type: "action",
      label: targets.length > 1 ? `Удалить систем: ${targets.length}` : "Удалить систему",
      icon: "🗑",
      danger: true,
      run: () => {
        if (
          confirm(
            targets.length > 1
              ? `Удалить ${targets.length} систем?`
              : `Удалить «${system.name}»?`,
          )
        ) {
          st.deleteSystems(targets);
        }
      },
    });
  } else {
    items.push({ type: "label", text: "Свободный космос", icon: "🌌" });
    items.push({
      type: "action",
      label: "Создать звезду здесь",
      icon: "⭐",
      run: () => {
        st.setTool("add_system");
        st.addSystemAt(menu.worldX, menu.worldY);
      },
    });
    items.push({
      type: "action",
      label: "Создать коридор / узел здесь",
      icon: "💠",
      run: () => {
        st.setTool("add_corridor");
        st.addSystemAt(menu.worldX, menu.worldY);
      },
    });
    items.push({ type: "sep" });
    items.push({
      type: "submenu",
      id: "gm_tools",
      label: "Инструменты кисти GM",
      icon: "🖌",
      items: [
        {
          type: "action",
          label: "Выбор (Select)",
          run: () => st.setTool("select"),
        },
        {
          type: "action",
          label: "Кисть (Brush)",
          run: () => st.setTool("brush"),
        },
        {
          type: "action",
          label: "Аномалия",
          run: () => st.setTool("mark_anomaly"),
        },
        {
          type: "action",
          label: "Астероиды",
          run: () => st.setTool("mark_asteroid"),
        },
        {
          type: "action",
          label: "Владение фракции",
          run: () => st.setTool("paint_faction"),
        },
        {
          type: "action",
          label: "Гиперсвязь",
          run: () => st.setTool("add_link"),
        },
      ],
    });
  }

  const renderMenuItem = (item: MenuItem, idx: number) => {
    if (item.type === "sep") {
      return <div key={`s-${idx}`} className="ctx-sep" />;
    }
    if (item.type === "label") {
      return (
        <div key={`l-${idx}`} className="ctx-label">
          {item.icon && <span className="ctx-icon">{item.icon}</span>}
          <span>{item.text}</span>
        </div>
      );
    }
    if (item.type === "submenu") {
      const isExpanded = openSubmenuId === item.id;
      return (
        <div key={`sub-${item.id}-${idx}`} className="ctx-submenu-group">
          <button
            type="button"
            className={`ctx-item ctx-submenu-trigger${isExpanded ? " is-open" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenSubmenuId(isExpanded ? null : item.id);
            }}
            onMouseEnter={() => setOpenSubmenuId(item.id)}
          >
            <span className="ctx-item-left">
              {item.icon && <span className="ctx-icon">{item.icon}</span>}
              <span className="ctx-item-text">{item.label}</span>
            </span>
            <span className="ctx-item-right">
              {item.badge && <span className="ctx-badge">{item.badge}</span>}
              <span className="ctx-chevron">{isExpanded ? "▾" : "▸"}</span>
            </span>
          </button>
          {isExpanded && (
            <div className="ctx-submenu-flyout">
              {item.items.map((subItem, sIdx) => renderMenuItem(subItem, sIdx))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={`a-${idx}`}
        type="button"
        className={[
          "ctx-item",
          item.danger ? "danger" : "",
          item.active ? "is-active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="menuitem"
        onClick={() => {
          item.run();
          close();
        }}
      >
        <span className="ctx-item-left">
          {item.icon && <span className="ctx-icon">{item.icon}</span>}
          <span className="ctx-item-text">{item.label}</span>
        </span>
        {item.shortcut && <kbd className="ctx-shortcut">{item.shortcut}</kbd>}
      </button>
    );
  };

  return (
    <FloatingPopover
      open
      onClose={close}
      x={menu.screenX}
      y={menu.screenY}
      className="ctx-menu ctx-menu--hierarchical"
      role="menu"
    >
      <div
        className="ctx-menu-inner"
        onContextMenu={(e) => e.preventDefault()}
        onMouseLeave={() => setOpenSubmenuId(null)}
      >
        {items.map((item, i) => renderMenuItem(item, i))}
      </div>
    </FloatingPopover>
  );
}
