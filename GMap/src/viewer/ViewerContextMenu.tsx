import type { MapContextPick } from "../renderers/MapCanvas";
import type { ViewerPayload } from "../state/types";
import { canAttackSystem } from "../state/combatEligibility";
import { formatHopDistance, hopDistance } from "../state/pathfinding";
import { isWithinMoveRange } from "../state/movementRange";
import { FloatingPopover } from "../ui/FloatingPopover";

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
    opts: { fleetId?: string; legionId?: string; systemId?: string },
  ) => void;
  onOpenOrders: () => void;
  onOpenRp: () => void;
  onScoutReveal?: (systemId: string) => void;
  scoutApCost?: number;
  reservedAp?: number;
  apMax?: number;
  reservedForceAp?: number;
  forceApMax?: number;
};

/** Player-facing RMB menu — Floating UI flip/shift, action-at-source. */
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
  onScoutReveal,
  scoutApCost = 1,
  reservedAp = 0,
  apMax = 15,
}: Props) {
  if (!menu) return null;

  const world = payload.world;
  const factionId = payload.factionId;

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
  const visibleSet = new Set(payload.visibleSystemIds);

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
      const hops = hopDistance(world, ownFleet.systemId, system.id, "fleet");
      const pathOk =
        Number.isFinite(hops) &&
        hops > 0 &&
        isWithinMoveRange(world, ownFleet.systemId, system.id, "fleet");
      const inVision = visibleSet.has(system.id);
      items.push({
        type: "action",
        label: !inVision
          ? "вне обзора"
          : pathOk
            ? `Идти сюда (${formatHopDistance(hops)})`
            : Number.isFinite(hops) && hops > 0
              ? "вне радиуса"
              : "Идти сюда (нет пути)",
        disabled: !inVision || !pathOk,
        run: () => {
          if (pathOk && inVision) onMoveUnit("fleet", ownFleet.id, system.id, hops);
        },
      });
      items.push({
        type: "action",
        label: inVision ? "Атаковать систему" : "вне обзора",
        disabled: !inVision,
        run: () => {
          if (inVision) {
            onOrderType("attack_system", {
              fleetId: ownFleet.id,
              systemId: system.id,
            });
          }
        },
      });
    } else if (
      system &&
      system.id === ownFleet.systemId &&
      canAttackSystem(world, factionId, system.id).eligible
    ) {
      items.push({
        type: "action",
        label: "Атаковать в системе",
        danger: true,
        run: () => {
          onOrderType("attack_system", {
            fleetId: ownFleet.id,
            systemId: system.id,
          });
        },
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
      const hops = hopDistance(world, ownLegion.systemId, system.id, "legion");
      const pathOk =
        Number.isFinite(hops) &&
        hops > 0 &&
        isWithinMoveRange(world, ownLegion.systemId, system.id, "legion");
      const inVision = visibleSet.has(system.id);
      items.push({
        type: "action",
        label: !inVision
          ? "вне обзора"
          : pathOk
            ? `Марш сюда (${formatHopDistance(hops)})`
            : Number.isFinite(hops) && hops > 0
              ? "вне радиуса"
              : "Марш сюда (нет пути)",
        disabled: !inVision || !pathOk,
        run: () => {
          if (pathOk && inVision) onMoveUnit("legion", ownLegion.id, system.id, hops);
        },
      });
      items.push({
        type: "action",
        label: inVision ? "Атаковать систему" : "вне обзора",
        disabled: !inVision,
        run: () => {
          if (inVision) {
            onOrderType("attack_system", {
              legionId: ownLegion.id,
              systemId: system.id,
            });
          }
        },
      });
    } else if (
      system &&
      system.id === ownLegion.systemId &&
      canAttackSystem(world, factionId, system.id).eligible
    ) {
      items.push({
        type: "action",
        label: "Атаковать в системе",
        danger: true,
        run: () => {
          onOrderType("attack_system", {
            legionId: ownLegion.id,
            systemId: system.id,
          });
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
    if (onScoutReveal) {
      const scoutBlocked =
        scoutApCost > 0 && reservedAp + scoutApCost > apMax;
      items.push({
        type: "action",
        label: scoutBlocked
          ? `Разведка (${scoutApCost} ОД — не хватает ОД)`
          : scoutApCost > 0
            ? `Разведка · открыть (${scoutApCost} ОД)`
            : "Разведка · открыть",
        disabled: scoutBlocked,
        run: () => onScoutReveal(system.id),
      });
    }
    if (system.ownerFactionId !== factionId) {
      const inVision = visibleSet.has(system.id);
      items.push({
        type: "action",
        label: inVision ? "Захватить (приказ)" : "вне обзора",
        disabled: !inVision,
        run: () => {
          if (inVision) onOrderType("claim_system", { systemId: system.id });
        },
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
    <FloatingPopover
      open
      onClose={onClose}
      x={menu.screenX}
      y={menu.screenY}
      className="ctx-menu"
      role="menu"
    >
      <div onContextMenu={(e) => e.preventDefault()}>
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
    </FloatingPopover>
  );
}
