/**
 * Persist a mapGalaxy() result through campaign stores. Direct DB (not
 * HTTP): 978 systems / 2774 planets would be thousands of round-trips;
 * the stores are the validation boundary the GM routes already use.
 *
 * Does not call colonizePlanet — that transfers population off other
 * worlds. Migrated colonies are created already-built, with population
 * from planetCapFromBuildings.
 */
import { createCampaign, addFaction } from "./campaignStore.mjs";
import { seedFactionAccounts } from "./seed.mjs";
import { createSystem, createPlanet, savePlanet } from "./planetStore.mjs";
import { createSystemLink } from "./systemLinksStore.mjs";
import { createSector } from "./sectorStore.mjs";

export function persistMappedGalaxy(db, mapped, { content, campaignName = "GMap galaxy" } = {}) {
  if (!mapped?.ok) {
    const detail = mapped?.unresolvedCombos?.length
      ? `unmapped kind/zone: ${mapped.unresolvedCombos.join(", ")}`
      : mapped?.errors?.[0]?.error || "mapGalaxy failed";
    throw new Error(detail);
  }

  const started = Date.now();
  const persist = db.transaction(() => {
    const campaign = createCampaign(db, { name: campaignName });
    for (const f of mapped.factions) {
      addFaction(db, campaign.id, {
        id: f.id,
        name: f.name,
        raceId: f.raceId,
        colorHex: f.colorHex,
        isNpc: true,
      });
      seedFactionAccounts(db, campaign.id, f.id, content);
    }
    for (const sector of mapped.sectors) {
      createSector(db, campaign.id, sector);
    }
    for (const sys of mapped.systems) {
      createSystem(db, campaign.id, {
        id: sys.id,
        name: sys.name,
        ownerFactionId: sys.ownerFactionId,
        x: sys.x,
        y: sys.y,
        kind: sys.kind,
        stars: sys.stars,
        spaceObjects: sys.spaceObjects,
      });
    }
    let skippedDuplicateLinks = 0;
    for (const link of mapped.links) {
      const made = createSystemLink(db, campaign.id, link);
      if (!made.ok && made.error === "link_exists") {
        skippedDuplicateLinks += 1;
        continue;
      }
      if (!made.ok) throw new Error(`link ${link.fromId}→${link.toId}: ${made.error}`);
    }
    for (const planet of mapped.planets) {
      createPlanet(db, campaign.id, planet.systemId, {
        id: planet.id,
        name: planet.name,
        type: planet.type,
        climate: planet.climate,
        habitable: planet.habitable,
        colonizable: planet.colonizable,
        colonyType: planet.colonyType,
        ownerFactionId: planet.ownerFactionId,
        grade: planet.grade,
        orbitalGrade: planet.orbitalGrade,
        raceComposition: planet.raceComposition,
        resources: planet.resources,
        population: planet.population,
      });
      savePlanet(db, campaign.id, planet);
    }
    return { campaign, skippedDuplicateLinks };
  });

  const { campaign, skippedDuplicateLinks } = persist();
  return { campaign, elapsedMs: Date.now() - started, skippedDuplicateLinks };
}
