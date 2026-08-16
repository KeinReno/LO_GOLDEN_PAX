/**
 * Court/NPC `stat_mult` → combat groups (COURT_AND_NPC_ROSTER_SPEC Part 4).
 * Parallel to combat_role_mult; does not replace it.
 * `stat:defense` maps onto GMap group.armor.
 */
import { buildModifierStack, applyFlatThenMult } from "./modifierStack.mjs";

export function applyCourtStatMultToGroups(groups, faction) {
  const effects = (faction?.activeEffects ?? []).filter(
    (e) => e?.effect === "stat_mult",
  );
  if (!effects.length || !groups?.length) return groups;
  return groups.map((g) => {
    const relevant = effects.filter((e) => {
      const scope = e.scope || "faction";
      if (scope === "faction") return true;
      if (
        scope === "legion" &&
        g.parentKind === "legion" &&
        g.parentId === e.targetId
      ) {
        return true;
      }
      if (
        scope === "fleet" &&
        g.parentKind === "fleet" &&
        g.parentId === e.targetId
      ) {
        return true;
      }
      return false;
    });
    if (!relevant.length) return g;
    const channels = buildModifierStack(relevant).channels;
    const next = { ...g };
    for (const [key, ch] of Object.entries(channels)) {
      if (!key.startsWith("stat:")) continue;
      const stat = key.slice("stat:".length);
      if (!stat || stat === "*") {
        if (next.damage != null) {
          next.damage = applyFlatThenMult(Number(next.damage) || 0, ch);
        }
        continue;
      }
      const field = stat === "defense" ? "armor" : stat;
      if (next[field] == null) continue;
      next[field] = applyFlatThenMult(Number(next[field]) || 0, ch);
    }
    return next;
  });
}
