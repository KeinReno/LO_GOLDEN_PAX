/**
 * syncTraitsToLiveBoard.mjs — копирует faction.traits из файла кампании
 * в текущий live board, НЕ сбрасывая ход. Сохраняет весь прогресс (turn, systems, etc.),
 * добавляя только поле traits к фракциям.
 *
 * Запуск: node scripts/syncTraitsToLiveBoard.mjs
 */
import fs from "node:fs";
import { readLiveBoard, writeLiveBoard } from "../server/tableStore.mjs";

const CAMPAIGN = "public/campaigns/lo_golden_pax.json";

const live = readLiveBoard();
if (!live) {
  console.error("Live board не опубликован. Сначала опубликуй кампанию.");
  process.exit(1);
}

const campaign = JSON.parse(fs.readFileSync(CAMPAIGN, "utf8"));
const traitMap = new Map(
  (campaign.factions || []).map((f) => [f.id, f.traits || []]),
);

let updated = 0;
let skipped = 0;
for (const f of live.factions || []) {
  const traits = traitMap.get(f.id);
  if (traits && traits.length > 0) {
    f.traits = traits;
    updated++;
  } else {
    skipped++;
  }
}

const written = writeLiveBoard(live, {
  backup: true,
  reason: "sync_traits",
});

console.log(
  `Live board (ход ${live.meta?.turn}) обновлён: ${updated} фракциям вживлены trait-ы, ${skipped} без изменений.`,
);
console.log(`tableRevision: ${written?.tableRevision ?? "?"}`);
