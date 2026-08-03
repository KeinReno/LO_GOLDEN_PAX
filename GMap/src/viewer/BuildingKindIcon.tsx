import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Castle,
  Factory,
  FlaskConical,
  Hammer,
  Home,
  Leaf,
  Orbit,
  Pickaxe,
  Rocket,
  Shield,
  Swords,
  Warehouse,
} from "lucide-react";

const KIND_ICON: Record<string, LucideIcon> = {
  residential: Home,
  farm: Leaf,
  mine: Pickaxe,
  factory: Factory,
  lab: FlaskConical,
  barracks: Swords,
  capitol: Castle,
  defense: Shield,
  spaceport: Rocket,
  shipyard: Orbit,
  habitat: Warehouse,
  custom: Building2,
};

const KIND_COLOR: Record<string, string> = {
  residential: "#7a9bb8",
  farm: "#5cdb95",
  mine: "#c4a882",
  factory: "#e8a54c",
  lab: "#6ec8d9",
  barracks: "#e85d4c",
  capitol: "#e8c547",
  defense: "#8a96a8",
  spaceport: "#5fd0e6",
  shipyard: "#5fd0e6",
  habitat: "#5cdb95",
  custom: "#8a96a8",
};

export function buildingKindColor(kind?: string): string {
  return KIND_COLOR[kind ?? "custom"] ?? "#8a96a8";
}

export function BuildingKindIcon({
  kind,
  size = 16,
  className,
}: {
  kind?: string;
  size?: number;
  className?: string;
}) {
  const Icon = KIND_ICON[kind ?? "custom"] ?? Hammer;
  const color = buildingKindColor(kind);
  return (
    <Icon
      size={size}
      className={className}
      style={{ color }}
      strokeWidth={2.1}
      aria-hidden
    />
  );
}
