import type { ReactNode } from "react";
import { AnimatedTooltip } from "../../../ui/AnimatedTooltip";

type Props = {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom";
  /** Hover delay before tip (ms). Default 280 in AnimatedTooltip. */
  delayMs?: number;
};

/** Economy alias for AnimatedTooltip (imperial chrome). */
export function EcoTip(props: Props) {
  return <AnimatedTooltip {...props} />;
}
