/** Which civ the deal desk should open on. Focused inbox beats current, then first incoming. */
export function pickDiploPartnerId(opts: {
  knownIds: string[];
  incoming: { id: string; fromFactionId: string }[];
  focusOfferId?: string | null;
  currentId: string;
}): string {
  const known = new Set(opts.knownIds);
  if (opts.focusOfferId) {
    const o = opts.incoming.find((x) => x.id === opts.focusOfferId);
    if (o && known.has(o.fromFactionId)) return o.fromFactionId;
  }
  if (opts.currentId && known.has(opts.currentId)) return opts.currentId;
  const firstIn = opts.incoming.find((o) => known.has(o.fromFactionId));
  if (firstIn) return firstIn.fromFactionId;
  return opts.knownIds[0] ?? "";
}
