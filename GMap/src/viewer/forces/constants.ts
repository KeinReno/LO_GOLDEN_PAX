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
  support: "Поддержка",
  bombard: "Обстрел",
  psi: "Пси",
  infantry: "Пехота",
  assault: "Штурм",
  garrison: "Гарнизон",
  armor: "Броня",
};

export const SLOT_ROLE_LABELS: Record<string, string> = {
  hull: "Корпус",
  weapon: "Орудие",
  shield: "Щит",
  reactor: "Реактор",
  engine: "Двигатель",
  armor: "Броня",
  crew: "Экипаж",
  structure: "Структура",
  tactic: "Тактика",
  small_arms: "Стрелковое",
  kit: "Снаряжение",
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
    label: "Ремонт",
    hint: "восстановить HP",
    Icon: Flame,
    revealColors: [
      [245, 158, 11],
      [234, 88, 12],
    ],
  },
  {
    id: "disband",
    label: "Лом",
    hint: "списать в лом · часть металла назад",
    Icon: Recycle,
    revealColors: [
      [239, 68, 68],
      [248, 113, 113],
    ],
  },
  {
    id: "reserve",
    label: "Резерв",
    hint: "вывести из колоды",
    Icon: Package,
    revealColors: [
      [34, 197, 94],
      [74, 222, 128],
    ],
  },
  {
    id: "equip",
    label: "Оснащение",
    hint: "модули со склада",
    Icon: Settings2,
    revealColors: [
      [56, 189, 248],
      [14, 165, 233],
    ],
  },
];

export const METAL_CURRENCY = "currency.metal";

export type SlotRequire = {
  category?: string;
  tier?: string;
  properties?: string[];
  theater?: string;
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
