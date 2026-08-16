import { useEffect } from "react";
import { CanvasRevealEffect } from "./components/ui/aceternity/CanvasRevealEffect";
import { useWorldStore } from "./state/worldStore";
import { startAudioSubsystem } from "./audio";
import { LoginScreen } from "./ui/player/PlayerLogin";
import { PlayerShell } from "./ui/player/PlayerShell";
import { GmShell } from "./ui/gm/GmShell";

export function App() {
  const sessionMode = useWorldStore((s) => s.sessionMode);
  const view = useWorldStore((s) => s.view);
  const campaignId = useWorldStore((s) => s.campaignId);
  const checkHealth = useWorldStore((s) => s.checkHealth);

  useEffect(() => {
    checkHealth();
    startAudioSubsystem();
  }, [checkHealth]);

  if (sessionMode === "gm" && view) {
    return (
      <CanvasRevealEffect className="h-screen" once durationMs={800}>
        <GmShell key={`gm-${campaignId}`} />
      </CanvasRevealEffect>
    );
  }

  if (sessionMode === "player" && view) {
    return (
      <CanvasRevealEffect className="h-screen" once durationMs={800}>
        <PlayerShell key={`player-${campaignId}`} />
      </CanvasRevealEffect>
    );
  }

  return <LoginScreen />;
}
