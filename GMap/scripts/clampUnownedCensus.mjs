/**
 * Unowned systems must not carry leftover million-scale census.
 * Claiming such a world would mint hundreds of thousands of labor units.
 *
 * Usage: node scripts/clampUnownedCensus.mjs [--apply]
 */
import { readLiveBoard, writeLiveBoard } from "../server/tableStore.mjs";

const APPLY = process.argv.includes("--apply");

function main() {
  const world = readLiveBoard();
  if (!world) {
    console.error("no live board");
    process.exit(1);
  }

  let planets = 0;
  let cleared = 0;
  let heads = 0;
  let maxPop = 0;

  for (const sys of world.systems || []) {
    if (sys.ownerFactionId) continue;
    for (const p of sys.planets || []) {
      planets += 1;
      const pop = Math.max(0, Number(p.population) || 0);
      if (pop <= 0) continue;
      heads += pop;
      if (pop > maxPop) maxPop = pop;
      p.population = 0;
      delete p.censusLocked;
      cleared += 1;
    }
  }

  const report = { apply: APPLY, unownedPlanets: planets, cleared, heads, maxPop };
  console.log(JSON.stringify(report, null, 2));

  if (!APPLY) {
    console.log("dry-run; pass --apply to write");
    return;
  }
  const written = writeLiveBoard(world, {
    backup: true,
    reason: "clamp_unowned_census",
  });
  if (written?.ok === false) {
    console.error("write failed", written.error);
    process.exit(1);
  }
  console.log("WROTE live board");
}

main();
