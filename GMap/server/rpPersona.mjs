/**
 * Speak-as personas for RP posts.
 * Players may speak as self or a court NPC. Narrator / alias / anonymous / master are GM-only.
 */
export function normalizeRpPersona(persona, isMaster) {
  const p = typeof persona === "string" && persona.trim() ? persona.trim() : "self";
  if (isMaster) return p;
  if (p === "npc") return "npc";
  return "self";
}
