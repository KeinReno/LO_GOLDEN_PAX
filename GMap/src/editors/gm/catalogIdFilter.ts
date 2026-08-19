export type CatalogOption = { id: string; name: string };

export function filterCatalogOptions(
  options: CatalogOption[],
  query: string,
): CatalogOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter(
    (o) =>
      o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q),
  );
}
