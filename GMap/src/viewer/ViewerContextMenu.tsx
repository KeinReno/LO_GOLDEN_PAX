import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MapContextPick } from "../renderers/MapCanvas";
import type { ViewerPayload } from "../state/types";
import { formatHopTurns, hopDistance } from "../state/pathfinding";

type MenuItem =
  | { type: "label"; text: string }
  | { type: "sep" }
  | {
      type: "action";
      label: string;
      run: () => void;
      danger?: boolean;
      disabled?: boolean;
    };

type Props = {
  menu: MapContextPick | null;
  payload: ViewerPayload;
  onClose: () => void;
  onSelectFleet: (id: string) => void;
  onSelectLegion: (id: string) => void;
  onSelectSystem: (id: string) => void;
  onOpenSystem: (id: string) => void;
  onMoveUnit: (
    kind: "fleet" | "legion",
    unitId: string,
    toSystemId: string,
    hops?: number,
  ) => void;
  onOrderType: (
    kind: "attack_system" | "claim_system",
    opts: { fleetId?: string; systemId?: string },
  ) => void;
  onOpenOrders: () => void;
  onOpenRp: () => void;
};

/** Player-facing RMB menu — actions with GM/other players stay out. */
export function ViewerContextMenu({
  menu,
  payload,
  onClose,
  onSelectFleet,
  onSelectLegion,
  onSelectSystem,
  onOpenSystem,
  onMoveUnit,
  onOrderType,
  onOpenOrders,
  onOpenRp,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const world = payload.world;
  const factionId = payload.factionId;

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    let removeCloser: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      const onDown = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) onClose();
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
  }, [menu, onClose]);

  useLayoutEffect(() => {
    if (!menu) return;
    setPos({ left: menu.screenX, top: menu.screenY });
    const id = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const pad = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const mw = el.offsetWidth;
      const mh = el.offsetHeight;
      let left = menu.screenX;
      let top = menu.screenY;
      if (left + mw > vw - pad) left = Math.max(pad, vw - mw - pad);
      if (top + mh > vh - pad) top = Math.max(pad, vh - mh - pad);
      if (left < pad) left = pad;
      if (top < pad) top = pad;
      setPos({ left, top });
    });
    return () => cancelAnimationFrame(id);
  }, [menu]);

  if (!menu) return null;

  const fleet = menu.fleetId
    ? world.fleets.find((f) => f.id === menu.fleetId)
    : null;
  const legion = menu.legionId
    ? world.legions.find((l) => l.id === menu.legionId)
    : null;
  const system = menu.systemId
    ? world.systems.find((s) => s.id === menu.systemId)
    : null;
  const ownFleet = fleet?.factionId === factionId ? fleet : null;
  const ownLegion = legion?.factionId === factionId ? legion : null;

  const items: MenuItem[] = [];

  if (ownFleet) {
    items.push({ type: "label", text: `Флот · ${ownFleet.name}` });
    items.push({
      type: "action",
      label: "Выбрать",
      run: () => onSelectFleet(ownFleet.id),
    });
    items.push({ type: "sep" });
    items.push({
      type: "label",
      text: "Перетащите на систему или…",
    });
    if (system && system.id !== ownFleet.systemId) {
      const hops = hopDistance(world, ownFleet.systemId, system.id);
      const ok = Number.isFinite(hops) && hops > 0;
      items.push({
        type: "action",
        label: ok
          ? `Идти сюда (${formatHopTurns(hops)})`
          : "Идти сюда (нет пути)",
        disabled: !ok,
        run: () => {
          if (ok) onMoveUnit("fleet", ownFleet.id, system.id, hops);
        },
      });
      items.push({
        type: "action",
        label: "Атаковать систему",
        run: () =>
          onOrderType("attack_system", {
            fleetId: ownFleet.id,
            systemId: system.id,
          }),
      });
    }
    items.push({
      type: "action",
      label: "Открыть приказы…",
      run: () => onOpenOrders(),
    });
  } else if (ownLegion) {
    items.push({ type: "label", text: `Легион · ${ownLegion.name}` });
    items.push({
      type: "action",
      label: "Выбрать",
      run: () => onSelectLegion(ownLegion.id),
    });
    items.push({ type: "sep" });
    items.push({
      type: "label",
      text: "Перетащите на систему или…",
    });
    if (system && system.id !== ownLegion.systemId) {
      const hops = hopDistance(world, ownLegion.systemId, system.id);
      const ok = Number.isFinite(hops) && hops > 0;
      items.push({
        type: "action",
        label: ok
          ? `Марш сюда (${formatHopTurns(hops)})`
          : "Марш сюда (нет пути)",
        disabled: !ok,
        run: () => {
          if (ok) onMoveUnit("legion", ownLegion.id, system.id, hops);
        },
      });
    }
    items.push({
      type: "action",
      label: "Открыть приказы…",
      run: () => onOpenOrders(),
    });
  } else if (fleet) {
    items.push({ type: "label", text: `Флот · ${fleet.name}` });
    items.push({
      type: "action",
      label: "Смотреть на карте",
      run: () => onSelectFleet(fleet.id),
    });
  } else if (legion) {
    items.push({ type: "label", text: `Легион · ${legion.name}` });
    items.push({
      type: "action",
      label: "Смотреть на карте",
      run: () => onSelectLegion(legion.id),
    });
  } else if (system) {
    items.push({ type: "label", text: system.name });
    items.push({
      type: "action",
      label: "Провалиться в систему",
      run: () => onOpenSystem(system.id),
    });
    items.push({
      type: "action",
      label: "Выбрать на карте",
      run: () => onSelectSystem(system.id),
    });
    if (system.ownerFactionId !== factionId) {
      items.push({
        type: "action",
        label: "Захватить (приказ)",
        run: () =>
          onOrderType("claim_system", { systemId: system.id }),
      });
    }
    items.push({
      type: "action",
      label: "Сцена с мастером…",
      run: () => onOpenRp(),
    });
  } else {
    items.push({ type: "label", text: "Карта" });
    items.push({
      type: "action",
      label: "Сцена с мастером…",
      run: () => onOpenRp(),
    });
  }

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => {
        if (it.type === "sep") return <div key={`s${i}`} className="ctx-sep" />;
        if (it.type === "label")
          return (
            <div key={`l${i}`} className="ctx-label">
              {it.text}
            </div>
          );
        return (
          <button
            key={`a${i}`}
            type="button"
            className={it.danger ? "ctx-item danger" : "ctx-item"}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              if (it.disabled) return;
              it.run();
              onClose();
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
