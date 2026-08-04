import type { LucideIcon } from "lucide-react";
import {
  Ban,
  Castle,
  Crosshair,
  Flame,
  Pause,
  Shield,
  Tent,
  ArrowRight,
  Wrench,
  Zap,
  Package,
  Recycle,
  Settings2,
} from "lucide-react";

export type DropZoneId = "forge" | "disband" | "reserve" | "equip";

export type StripMode = "summary" | "equip" | "confirm-disband";

export const STANCE_ICONS: Record<string, LucideIcon> = {
  idle: Pause,
  attack: Crosshair,
  defend: Shield,
  move: ArrowRight,
  repair: Wrench,
  blockade: Ban,
  fortify: Castle,
  garrison: Tent,
  assault: Flame,
  recovering: Zap,
};

export const STANCE_LABELS: Record<string, string> = {
  idle: "Ожидание",
  attack: "Атака",
  defend: "Оборона",
  move: "Ход",
  repair: "Ремонт",
  blockade: "Блокада",
  fortify: "Укрепление",
  garrison: "Гарнизон",
  assault: "Штурм",
  recovering: "Восстановление",
};

/** Ship combat roles from content (roles[]). */
export const COMBAT_ROLE_LABELS: Record<string, string> = {
  screen: "Экран",
  line: "Линия",
  capital: "Флагман",
  carrier: "Авианосец",
  bombard: "Обстрел",
  psi: "Пси",
};

export const SLOT_ROLE_LABELS: Record<string, string> = {
  hull: "Корпус",
  weapon: "Орудие",
  shield: "Щит",
  reactor: "Реактор",
  crew: "Экипаж",
  structure: "Структура",
};

export const TIER_COLORS: Record<number, string> = {
  1: "var(--tier-1, #9ca3af)",
  2: "var(--tier-2, var(--signal-build, #22c55e))",
  3: "var(--tier-3, var(--signal-move, #3b82f6))",
  4: "var(--tier-4, #a855f7)",
  5: "var(--tier-5, var(--signal-warning, #f59e0b))",
};

export const DROP_ZONES: Array<{
  id: DropZoneId;
  label: string;
  hint: string;
  Icon: LucideIcon;
  /** RGB triples for CanvasRevealEffect hover. */
  revealColors: number[][];
}> = [
  {
    id: "forge",
    label: "КУЗНИЦА",
    hint: "ветеран +1",
    Icon: Flame,
    revealColors: [
      [245, 158, 11],
      [234, 88, 12],
    ],
  },
  {
    id: "disband",
    label: "УТИЛЬ",
    hint: "списать · возврат",
    Icon: Recycle,
    revealColors: [
      [239, 68, 68],
      [248, 113, 113],
    ],
  },
  {
    id: "reserve",
    label: "РЕЗЕРВ",
    hint: "вывести из колоды",
    Icon: Package,
    revealColors: [
      [34, 197, 94],
      [74, 222, 128],
    ],
  },
  {
    id: "equip",
    label: "ОСНАЩЕНИЕ",
    hint: "модули корабля",
    Icon: Settings2,
    revealColors: [
      [56, 189, 248],
      [14, 165, 233],
    ],
  },
];

export const METAL_CURRENCY = "currency.metal";
export const FORGE_METAL_COST = 50;
/** Fraction of forge cost refunded when scrapping one unit. */
export const DISBAND_METAL_REFUND = 20;

export type SlotRequire = {
  category?: string;
  tier?: string;
  properties?: string[];
};

export type CatalogSlot = {
  role: string;
  count?: number;
  require?: SlotRequire;
};

export type CatalogShip = {
  id: string;
  name: string;
  tier?: number;
  faction?: string;
  roles?: string[];
  stats?: Record<string, number>;
  slots?: CatalogSlot[];
};
