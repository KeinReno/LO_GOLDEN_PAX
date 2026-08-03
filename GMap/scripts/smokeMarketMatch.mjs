/**
 * Smoke test: market partial-fill math + one integration match (temp files).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computePartialFill, matchMarketOffers } from "../server/marketOrders.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
const backupDir = path.join(dataDir, "_smoke_market_backup");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// --- unit: computePartialFill ---
{
  const full = computePartialFill(
    { giveAmount: 100, wantAmount: 50, giveCurrency: "A", wantCurrency: "B" },
    { giveAmount: 50, wantAmount: 100, giveCurrency: "B", wantCurrency: "A" },
  );
  assert(full?.fillGive === 100 && full?.fillWant === 50, "full complement fill");

  const partial = computePartialFill(
    { giveAmount: 100, wantAmount: 50, giveCurrency: "A", wantCurrency: "B" },
    { giveAmount: 10, wantAmount: 200, giveCurrency: "B", wantCurrency: "A" },
  );
  assert(partial?.fillGive === 20 && partial?.fillWant === 10, "B give clamp");

  const dust = computePartialFill(
    { giveAmount: 200, wantAmount: 1, giveCurrency: "A", wantCurrency: "B" },
    { giveAmount: 100, wantAmount: 50, giveCurrency: "B", wantCurrency: "A" },
  );
  assert(dust === null, "dust fill rejected (< 1 want unit)");

  console.log("computePartialFill: ok");
}

// --- integration: matchMarketOffers on temp snapshot ---
const marketPath = path.join(dataDir, "market-orders.json");
const ledgerPath = path.join(dataDir, "ledger.json");
const hadMarket = fs.existsSync(marketPath);
const hadLedger = fs.existsSync(ledgerPath);
const marketBackup = hadMarket ? fs.readFileSync(marketPath) : null;
const ledgerBackup = hadLedger ? fs.readFileSync(ledgerPath) : null;

try {
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const offerA = {
    id: "smoke_a",
    factionId: "faction.a",
    side: "sell",
    giveCurrency: "currency.extracta",
    giveAmount: 100,
    wantCurrency: "currency.materia",
    wantAmount: 50,
    createdTurn: 1,
    status: "open",
    escrowGiveAmount: 100,
  };
  const offerB = {
    id: "smoke_b",
    factionId: "faction.b",
    side: "sell",
    giveCurrency: "currency.materia",
    giveAmount: 10,
    wantCurrency: "currency.extracta",
    wantAmount: 200,
    createdTurn: 2,
    status: "open",
    escrowGiveAmount: 10,
  };

  fs.writeFileSync(marketPath, JSON.stringify({ offers: [offerA, offerB] }, null, 2));
  fs.writeFileSync(
    ledgerPath,
    JSON.stringify(
      {
        factions: {
          "faction.a": { factionId: "faction.a", stocks: { "currency.extracta": 0, "currency.materia": 0 } },
          "faction.b": { factionId: "faction.b", stocks: { "currency.extracta": 0, "currency.materia": 0 } },
        },
        entries: [],
      },
      null,
      2,
    ),
  );

  const { matched, journal } = matchMarketOffers(99);
  assert(matched === 1, `expected 1 match, got ${matched}`);
  assert(journal[0]?.giveAmount === 20 && journal[0]?.wantAmount === 10, "journal fill amounts");
  assert(journal[0]?.partial === true, "partial flag");

  const book = JSON.parse(fs.readFileSync(marketPath, "utf8"));
  const a = book.offers.find((o) => o.id === "smoke_a");
  const b = book.offers.find((o) => o.id === "smoke_b");
  assert(a?.status === "open" && a.giveAmount === 80 && a.wantAmount === 40, "A partial remainder");
  assert(b?.status === "filled" && b.giveAmount === 0, "B fully filled");

  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  assert(ledger.factions["faction.a"].stocks["currency.materia"] === 10, "A received materia");
  assert(ledger.factions["faction.b"].stocks["currency.extracta"] === 20, "B received extracta");

  console.log("matchMarketOffers integration: ok");
} finally {
  if (marketBackup) fs.writeFileSync(marketPath, marketBackup);
  else if (fs.existsSync(marketPath)) fs.unlinkSync(marketPath);
  if (ledgerBackup) fs.writeFileSync(ledgerPath, ledgerBackup);
  else if (fs.existsSync(ledgerPath)) fs.unlinkSync(ledgerPath);
}

console.log("smokeMarketMatch: all passed");
