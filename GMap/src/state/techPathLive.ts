/** Breakthrough id only if the technology exists and is not a catalog stub. */
export function liveBreakthroughTechId(
  path: { breakthroughTechId?: string | null } | undefined,
  technologies:
    | Record<string, { catalogPending?: boolean; name?: string } | undefined>
    | undefined,
): string | null {
  const id = path?.breakthroughTechId;
  if (!id) return null;
  const def = technologies?.[id];
  if (!def || def.catalogPending) return null;
  return id;
}
