/**
 * Tax tier lookup. Ported verbatim (as pure functions — GMap kept these
 * module-private, exported here since domain/* functions are meant to be
 * unit-tested directly, see CLAUDE.md rule 3) from GMap/server/
 * economyTick.mjs's taxRateFor/resolveTaxSlotId. Parity verified in
 * taxes.parity.test.mjs.
 */

export function resolveTaxSlotId(content, slot) {
  const def = content?.taxes?.[slot];
  if (def?.aliasOf && content?.taxes?.[def.aliasOf]) return def.aliasOf;
  return slot;
}

export function taxRateFor(eco, content, slot) {
  const resolved = resolveTaxSlotId(content, slot);
  const tierId = eco.taxes?.[resolved] || eco.taxes?.[slot] || "none";
  const def = content.taxes?.[resolved] || content.taxes?.[slot];
  const tier = def?.tiers?.find((t) => t.id === tierId);
  return tier?.rate ?? 0;
}
