# Labor slots (job-slots vs `biosLaborScale`)

GMap’s flow tick used `biosLaborScale(eco)` — a faction-wide step function of `currency.bios` stock (0.25 / 0.5 / 0.75 / 1). That number only reached **B→C** converts via `applyFlowConvert`. Extraction and `yield_flat` ignored it. Population did not limit output.

v0.5 replaced that proxy with per-planet job slots (`allocateLabor`). GMap now does the same, GMap-shaped.

## Formula

- `need = laborSlots` on the building def, else `max(1, tier)` (first-pass default; content may set `laborSlots` later).
- Spend `planet.population` across enabled labor-consuming buildings in **placement order** (surface → orbital → `buildings`).
- First shortfall is partial (`used / need`); everything after it is 0.
- Extraction of a deposit × max staffed fraction among buildings that already pass `canExtractDeposit`.
- Building `yield_flat` / `flow_convert` × that building’s staffed fraction (`rateScale`).
- Housing (`pop_cap_add` only) does **not** consume workers.
- Upkeep, belt+mining-station (`skipExtractGate`), and the metal/supply survival floor are unchanged. Ambient D/E is now population-scaled — see `AMBIENT_FLOW.md`.
- Peg conversion still runs **after** all factions extract.

`biosLaborScale` remains exported for old scripts. It is not the production gate.

## Check

`npm run test:labor` (from `GMap/`) — or `node --test server/laborAllocation.test.mjs`.
