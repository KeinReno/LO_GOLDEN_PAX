/** System to focus from Economy «К системе»: deficit signal first, else first owned. */
export function pickFocusBuildSystemId(
  factionId: string,
  systems: Array<{ id: string; ownerFactionId?: string | null }>,
  signals: Array<{ systemId?: string | null }>,
): string | null {
  for (const s of signals) {
    if (s.systemId) return s.systemId;
  }
  return systems.find((s) => s.ownerFactionId === factionId)?.id ?? null;
}
