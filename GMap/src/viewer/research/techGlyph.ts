import type { TechnologyDef } from "../../state/contentCatalog";
import { getCachedContent } from "../../state/contentCatalog";
import { resolveTechDirection } from "../../state/techDirections";

const DIR_GLYPH: Record<string, string> = {
  industry: "🏭",
  military: "⚔",
  culture: "🎭",
  commerce: "⚖",
  diplomacy: "🕊",
  governance: "👑",
};

export function techGlyph(tech: TechnologyDef): string {
  const icons = getCachedContent()?.tech_icons;
  const tagged = tech.iconTag ? icons?.[tech.iconTag]?.glyph : undefined;
  if (tagged) return tagged;
  const dir = resolveTechDirection(tech) || "industry";
  return DIR_GLYPH[dir] ?? "◆";
}
