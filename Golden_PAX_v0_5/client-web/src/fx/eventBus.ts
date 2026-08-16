/**
 * Typed game-event bus. Domain logic on the server produces events (see
 * server/domain/narrative); the client turns a tick/API response into
 * these events. Renderers never trigger fx/audio directly — they only
 * draw current state — so a rendering rewrite (WebGL tuning, or someday a
 * different client entirely) never has to carry effect-triggering logic
 * with it. See CLAUDE.md rule 7.
 */

export type GameEvent =
  | { type: "faction:income"; factionId: string; currencyId: string; delta: number }
  | { type: "combat:engaged"; engagementId: string; factionIds: string[] };

type Listener = (event: GameEvent) => void;

const listeners = new Set<Listener>();

export function onGameEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitGameEvent(event: GameEvent): void {
  for (const listener of listeners) listener(event);
}
