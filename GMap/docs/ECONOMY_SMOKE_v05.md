# Economy v0.5 smoke — 2026-08-09

Script: `node scripts/smoke-economy-v05.mjs`  
Restores `data/ledger.json` + `data/fx-exchange.json` after the run.

## Result: SMOKE OK 7/7

| Check | Result |
|-------|--------|
| tick_runs | PASS |
| strategic_extraction_present | PASS — belator: solari, blumatid, titan |
| named_stock_increases | PASS — `map.solari` 17466 → 17551 (+85) |
| treasury_channel_is_peg_not_materia | PASS — `map.solari→treasury` |
| rolescore_energy_grows_for_solari | PASS — 0 → 425 |
| fx_rates_or_credits | PASS — 10 pairs, 3 peg credits, `ema_inertia` |
| fx_pairs_not_all_identical | PASS — distinct buys |

## Notes

- Board turn at smoke: **20**, faction `faction_belator`, peg `map.solari`.
- Extraction forecast is float; ledger credit uses `floor` (+85).
- Live save was not left mutated.
