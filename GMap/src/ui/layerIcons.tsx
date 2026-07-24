import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CircleDot,
  EyeOff,
  Flag,
  Handshake,
  HelpCircle,
  Landmark,
  Map,
  Navigation,
  Radar,
  Route,
  Shield,
  Ship,
  Truck,
  Type,
  Zap,
} from "lucide-react";
import type { LayerLucideIcon } from "./mapLayers";

export const LAYER_LUCIDE: Record<LayerLucideIcon, LucideIcon> = {
  map: Map,
  route: Route,
  ship: Ship,
  shield: Shield,
  navigation: Navigation,
  type: Type,
  landmark: Landmark,
  "circle-dot": CircleDot,
  handshake: Handshake,
  "eye-off": EyeOff,
  flag: Flag,
  radar: Radar,
  truck: Truck,
  zap: Zap,
  "help-circle": HelpCircle,
  activity: Activity,
};
