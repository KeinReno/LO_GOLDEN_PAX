import { useEffect, useRef } from "react";
import { useWorldStore } from "../state/worldStore";
import { SYSTEM_POI_LABELS } from "../state/defaults";
import type { LinkType, SystemActivity, SystemPoiType } from "../state/types";
import { SPACE_OBJECT_TYPES } from "../state/types";

type MenuItem =
  | { type: "label"; text: string }
  | { type: "sep" }
  | {
      type: "action";
      label: string;
      danger?: boolean;
      run: () => void;
    };

export function MapContextMenu() {
  const menu = useWorldStore((s) => s.contextMenu);
  const setContextMenu = useWorldStore((s) => s.setContextMenu);
  const world = useWorldStore((s) => s.world);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    // Defer so the opening right-click doesn't instantly dismiss the menu
    let removeCloser: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      const onDown = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) {
          setContextMenu(null);
        }
      };
      window.addEventListener("pointerdown", onDown, true);
      removeCloser = () =>
        window.removeEventListener("pointerdown", onDown, true);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      removeCloser?.();
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, setContextMenu]);

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

  const close = () => setContextMenu(null);
  const items: MenuItem[] = [];

  if (fleet) {
    items.push({ type: "label", text: `Флот · ${fleet.name}` });
    items.push({
      type: "action",
      label: "Выбрать",
      run: () => {
        st.selectFleet(fleet.id);
        st.selectSystem(fleet.systemId);
        st.selectLegion(null);
        st.selectLink(null);
      },
    });
    items.push({ type: "sep" });
    items.push({ type: "label", text: "Приказ (клик по системе)" });
    items.push({
      type: "action",
      label: "→ Переместиться…",
      run: () => st.beginUnitOrder("fleet", fleet.id, "move"),
    });
    items.push({
      type: "action",
      label: "→ Атаковать…",
      run: () => st.beginUnitOrder("fleet", fleet.id, "attack"),
    });
    items.push({
      type: "action",
      label: "→ Укрепиться…",
      run: () => st.beginUnitOrder("fleet", fleet.id, "fortify"),
    });
    items.push({
      type: "action",
      label: "→ Блокировать…",
      run: () => st.beginUnitOrder("fleet", fleet.id, "blockade"),
    });
    items.push({
      type: "action",
      label: "Оборона на месте",
      run: () => st.updateFleet(fleet.id, { stance: "defend", route: [] }),
    });
    items.push({
      type: "action",
      label: "Ремонт / док",
      run: () => st.updateFleet(fleet.id, { stance: "repair", route: [] }),
    });
    items.push({
      type: "action",
      label: "Очистить маршрут",
      run: () => st.updateFleet(fleet.id, { route: [], stance: "idle" }),
    });
    items.push({ type: "sep" });
    items.push({
      type: "action",
      label: "Клонировать… (клик по системе)",
      run: () => st.beginFleetClone(fleet.id),
    });
    items.push({
      type: "action",
      label: "Удалить флот",
      danger: true,
      run: () => st.deleteFleet(fleet.id),
    });
  } else if (legion) {
    items.push({ type: "label", text: `Легион · ${legion.name}` });
    items.push({
      type: "action",
      label: "Выбрать",
      run: () => {
        st.selectLegion(legion.id);
        st.selectSystem(legion.systemId);
        st.selectFleet(null);
        st.selectLink(null);
      },
    });
    items.push({ type: "sep" });
    items.push({ type: "label", text: "Приказ (клик по системе)" });
    items.push({
      type: "action",
      label: "→ Марш…",
      run: () => st.beginUnitOrder("legion", legion.id, "move"),
    });
    items.push({
      type: "action",
      label: "→ Штурм…",
      run: () => st.beginUnitOrder("legion", legion.id, "attack"),
    });
    items.push({
      type: "action",
      label: "→ Укрепиться…",
      run: () => st.beginUnitOrder("legion", legion.id, "fortify"),
    });
    items.push({
      type: "action",
      label: "→ Блокировать…",
      run: () => st.beginUnitOrder("legion", legion.id, "blockade"),
    });
    items.push({
      type: "action",
      label: "Гарнизон на месте",
      run: () =>
        st.updateLegion(legion.id, { status: "garrison", route: [] }),
    });
    items.push({
      type: "action",
      label: "Очистить маршрут",
      run: () => st.updateLegion(legion.id, { route: [], status: "idle" }),
    });
    items.push({ type: "sep" });
    items.push({
      type: "action",
      label: "Удалить легион",
      danger: true,
      run: () => st.deleteLegion(legion.id),
    });
  } else if (link) {
    const a = world.systems.find((s) => s.id === link.fromId)?.name ?? "?";
    const b = world.systems.find((s) => s.id === link.toId)?.name ?? "?";
    items.push({ type: "label", text: `Связь · ${a} ↔ ${b}` });
    items.push({
      type: "action",
      label: "Выбрать",
      run: () => {
        st.selectLink(link.id);
        st.selectSystem(null);
        st.selectFleet(null);
        st.selectLegion(null);
      },
    });
    (["corridor", "gate", "unstable"] as LinkType[]).forEach((t) => {
      items.push({
        type: "action",
        label: `Тип: ${t}${link.type === t ? " ✓" : ""}`,
        run: () => st.updateLink(link.id, { type: t }),
      });
    });
    items.push({ type: "sep" });
    items.push({
      type: "action",
      label: "Удалить связь",
      danger: true,
      run: () => st.deleteLink(link.id),
    });
  } else if (system) {
    const multi = st.selectedSystemIds;
    const targets =
      multi.includes(system.id) && multi.length > 1 ? multi : [system.id];
    const kindLabel = system.kind === "corridor" ? "Узел" : "Система";
    items.push({
      type: "label",
      text:
        targets.length > 1
          ? `Выделено систем: ${targets.length}`
          : `${kindLabel} · ${system.name}`,
    });
    items.push({
      type: "action",
      label: "Открыть систему",
      run: () => {
        st.selectSystem(system.id);
        st.openSystemView(system.id);
      },
    });
    if (system.ownerFactionId) {
      const owner = world.factions.find((f) => f.id === system.ownerFactionId);
      items.push({
        type: "action",
        label: owner
          ? `Редактор державы · ${owner.name}`
          : "Редактор державы владельца",
        run: () => {
          st.selectSystem(system.id);
          st.setActiveFaction(system.ownerFactionId);
          st.openPolityEditor(system.ownerFactionId);
        },
      });
    }
    items.push({
      type: "action",
      label: "Выбрать",
      run: () => {
        st.selectSystem(system.id);
        st.selectFleet(null);
        st.selectLegion(null);
        st.selectLink(null);
        st.setTool("select");
      },
    });
    items.push({
      type: "action",
      label: "Добавить к выделению",
      run: () => {
        st.selectSystem(system.id, "add");
        st.setTool("select");
      },
    });
    items.push({
      type: "action",
      label: system.isCapital ? "Снять столицу" : "Сделать столицей",
      run: () => {
        st.selectSystem(system.id);
        st.updateSelectedSystem({ isCapital: !system.isCapital });
      },
    });
    items.push({
      type: "action",
      label: "Сбросить владение",
      run: () => {
        st.selectSystem(system.id);
        st.updateSelectedSystem({ ownerFactionId: null });
      },
    });
    items.push({ type: "sep" });
    items.push({
      type: "action",
      label: faction
        ? targets.length > 1
          ? `Владение → ${faction.name} (×${targets.length})`
          : `Владение → ${faction.name}`
        : "Владение (выбери фракцию справа)",
      run: () => {
        if (!activeFactionId) return;
        st.paintFactionMany(targets);
      },
    });
    items.push({
      type: "action",
      label: "Разведка (вкл/выкл)",
      run: () => st.revealSystem(system.id),
    });
    items.push({
      type: "action",
      label: "Поставить флот",
      run: () => {
        st.selectSystem(system.id);
        st.placeFleetOnSystem(system.id);
      },
    });
    items.push({
      type: "action",
      label: "Поставить легион",
      run: () => {
        st.selectSystem(system.id);
        st.placeLegionOnSystem(system.id);
      },
    });
    items.push({
      type: "action",
      label: "Начать связь отсюда",
      run: () => {
        st.setTool("add_link");
        st.setLinkDraftFrom(system.id);
        st.selectSystem(system.id);
      },
    });
    items.push({ type: "sep" });
    items.push({
      type: "action",
      label: system.contested ? "Снять «спорная»" : "Пометить спорной",
      run: () => st.toggleContestedMany(targets),
    });
    if (st.activeFactionId) {
      items.push({
        type: "action",
        label: "Совладелец = активная держава",
        run: () => st.paintCoOwnerMany(targets),
      });
    }
    items.push({ type: "sep" });
    items.push({ type: "label", text: "Космический объект" });
    ([...SPACE_OBJECT_TYPES, "none"] as SystemPoiType[]).forEach((poi) => {
      items.push({
        type: "action",
        label: `${SYSTEM_POI_LABELS[poi] ?? poi}${
          poi !== "none" &&
          (system.spaceObjects ?? []).includes(poi)
            ? " ✓"
            : system.poiType === poi
              ? " ✓"
              : ""
        }`,
        run: () => st.applySystemPoiMany(targets, poi),
      });
    });
    items.push({ type: "sep" });
    items.push({ type: "label", text: "Активность" });
    (["none", "battle", "trade", "garrison", "repair", "transit"] as SystemActivity[]).forEach(
      (a) => {
        items.push({
          type: "action",
          label: `${activityLabel(a)}${system.activity === a ? " ✓" : ""}`,
          run: () => {
            st.selectSystem(system.id);
            st.updateSelectedSystem({
              activity: a,
              tradeWithSystemId: a === "trade" ? system.tradeWithSystemId : null,
            });
          },
        });
      },
    );
    items.push({ type: "sep" });
    items.push({
      type: "action",
      label: targets.length > 1 ? `Удалить ×${targets.length}` : "Удалить",
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
    items.push({ type: "label", text: "Пустое место" });
    items.push({
      type: "action",
      label: "Звезда здесь",
      run: () => {
        st.setTool("add_system");
        st.addSystemAt(menu.worldX, menu.worldY);
      },
    });
    items.push({
      type: "action",
      label: "Коридор / узел здесь",
      run: () => {
        st.setTool("add_corridor");
        st.addSystemAt(menu.worldX, menu.worldY);
      },
    });
    items.push({ type: "sep" });
    items.push({
      type: "action",
      label: "Инструмент: Выбор",
      run: () => st.setTool("select"),
    });
    items.push({
      type: "action",
      label: "Инструмент: Кисть",
      run: () => st.setTool("brush"),
    });
    items.push({
      type: "action",
      label: "Инструмент: Аномалия",
      run: () => st.setTool("mark_anomaly"),
    });
    items.push({
      type: "action",
      label: "Инструмент: Астероиды",
      run: () => st.setTool("mark_asteroid"),
    });
    items.push({
      type: "action",
      label: "Инструмент: Владение",
      run: () => st.setTool("paint_faction"),
    });
    items.push({
      type: "action",
      label: "Инструмент: Связь",
      run: () => st.setTool("add_link"),
    });
  }

  const maxH = typeof window !== "undefined" ? window.innerHeight - 16 : 600;
  const top = Math.min(menu.screenY, maxH - 40);
  const left = Math.min(menu.screenX, (typeof window !== "undefined" ? window.innerWidth : 800) - 220);

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left, top }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.type === "sep") return <div key={`s${i}`} className="ctx-sep" />;
        if (item.type === "label")
          return (
            <div key={`l${i}`} className="ctx-label">
              {item.text}
            </div>
          );
        return (
          <button
            key={`a${i}`}
            type="button"
            className={item.danger ? "ctx-item danger" : "ctx-item"}
            role="menuitem"
            onClick={() => {
              item.run();
              close();
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function activityLabel(a: SystemActivity): string {
  switch (a) {
    case "none":
      return "Спокойно";
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
      return a;
  }
}
