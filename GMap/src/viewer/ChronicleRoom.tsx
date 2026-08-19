import type { ViewerPayload } from "../state/types";
import { RpStage, type RpStageProps } from "./RpStage";

export type ChronicleRoomProps = {
  payload: ViewerPayload;
  password: string;
  onMsg?: (m: string | null) => void;
  onMessagesLoaded?: RpStageProps["onMessagesLoaded"];
  factionColor?: string;
  avatarUrl?: string | null;
  layout?: "panel" | "fill";
  compact?: boolean;
  onBack?: () => void;
};

/** Player RP entry — immersive stage per polity. */
export function ChronicleRoom(props: ChronicleRoomProps) {
  return <RpStage {...props} />;
}
