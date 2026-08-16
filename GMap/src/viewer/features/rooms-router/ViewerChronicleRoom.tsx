import type { ViewerPayload } from "../../../state/types";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { ChronicleRoom } from "../../ChronicleRoom";
import { writeRpSeenAt } from "../../viewerNavTypes";
import { navigateViewerRoom } from "./navigateViewerRoom";

type Props = {
  payload: ViewerPayload;
  password: string;
  mobile: boolean;
  factionColor?: string;
  avatarUrl?: string | null;
};

export function ViewerChronicleRoom({
  payload,
  password,
  mobile,
  factionColor,
  avatarUrl,
}: Props) {
  const setOrderMsg = useViewerOrderSessionStore((s) => s.setOrderMsg);
  const setRpUnread = useViewerChromeStore((s) => s.setRpUnread);

  return (
    <ChronicleRoom
      payload={payload}
      password={password}
      layout="fill"
      compact={mobile}
      onBack={() => navigateViewerRoom("map")}
      factionColor={factionColor}
      avatarUrl={avatarUrl}
      onMsg={(m) => setOrderMsg(m)}
      onMessagesLoaded={(msgs) => {
        const latest = msgs[msgs.length - 1];
        if (latest?.at) writeRpSeenAt(payload.factionId, latest.at);
        setRpUnread(0);
      }}
    />
  );
}
