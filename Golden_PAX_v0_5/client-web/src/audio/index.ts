import { onGameEvent, type GameEvent } from "../fx/eventBus";

/**
 * No audio assets yet — this only proves the subscription pattern so sound
 * can be added later without touching renderers or domain code. See
 * src/audio/README.md and CLAUDE.md rule 7.
 */
function handleGameEvent(event: GameEvent): void {
  // eslint-disable-next-line no-console
  console.debug("[audio] would play a cue for", event.type);
}

let unsubscribe: (() => void) | null = null;

export function startAudioSubsystem(): void {
  if (unsubscribe) return;
  unsubscribe = onGameEvent(handleGameEvent);
}

export function stopAudioSubsystem(): void {
  unsubscribe?.();
  unsubscribe = null;
}
