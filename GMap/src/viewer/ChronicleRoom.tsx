import type { ViewerPayload } from "../state/types";
import type { RpChatProps } from "../editors/RpChat";
import { RpStage } from "./RpStage";

export type ChronicleRoomProps = {
  payload: ViewerPayload;
  password: string;
  onMsg?: (m: string | null) => void;
  onMessagesLoaded?: RpChatProps["onMessagesLoaded"];
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
