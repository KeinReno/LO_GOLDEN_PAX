import type { TechnologyDef } from "../../../state/contentCatalog";
import type { ViewerPayload } from "../../../state/types";

type OfferBag = NonNullable<
  NonNullable<ViewerPayload["economy"]>["currentOffers"]
>;

export type VisibleGraphOpts = {
  /** Prereq-met, offer-eligible techs not in the current 3 — paid ×1.5 path. */
  includeBypass?: boolean;
};

/** Ids currently sitting in research offers (any direction / legacy A–F key). */
export function collectOfferCandidateIds(
  currentOffers: OfferBag | undefined,
): Set<string> {
  const ids = new Set<string>();
  if (!currentOffers) return ids;
  for (const offer of Object.values(currentOffers)) {
    if (!offer?.candidates) continue;
    for (const id of offer.candidates) {
      if (id) ids.add(id);
    }
  }
  return ids;
}

function isOfferChannelTech(tech: TechnologyDef): boolean {
  if (tech.catalogPending || tech.alchemyOnly) return false;
  const tags = tech.tags || [];
  if (tags.includes("alchemy") || tags.includes("combo")) return false;
  if (tech.opensPath) return false;
  if ((tech.effects || []).some((e) => e.effect === "open_path")) return false;
  return true;
}

/** Payable outside the offer: prereqs met, not researched, not an offer card. */
export function isBypassFrontierTech(
  tech: TechnologyDef,
  unlocked: ReadonlySet<string>,
  offerIds: ReadonlySet<string>,
): boolean {
  if (unlocked.has(tech.id) || offerIds.has(tech.id)) return false;
  if (!isOfferChannelTech(tech)) return false;
  return (tech.prerequisites || []).every((p) => unlocked.has(p));
}

/**
 * Player graph is not the catalog: it grows from researched nodes,
 * current offers, and queue. Bypass frontier is opt-in.
 */
export function visibleGraphTechs(
  techs: TechnologyDef[],
  unlocked: ReadonlySet<string>,
  currentOffers: OfferBag | undefined,
  queueIds?: ReadonlySet<string>,
  opts?: VisibleGraphOpts,
): TechnologyDef[] {
  const offers = collectOfferCandidateIds(currentOffers);
  return techs.filter((t) => {
    if (unlocked.has(t.id) || offers.has(t.id) || !!queueIds?.has(t.id)) {
      return true;
    }
    if (!opts?.includeBypass) return false;
    return isBypassFrontierTech(t, unlocked, offers);
  });
}
