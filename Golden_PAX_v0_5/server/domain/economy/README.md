# domain/economy

Resource income, upkeep, tiered stockpiles — the numeric core of a turn. Ported from `GMap/server/economyTick.mjs`, `GMap/server/ledger.mjs` and validated against `GMap/content/core/economy_balance.json` / `economy_schema.json`.

**Inputs/outputs**: a domain function here takes plain data (a faction's economy account, this turn's category income, its planets) and returns new state — plain data out, no DB or HTTP inside this folder. `server/api/routes/economy.mjs` is the only thing allowed to call these functions from a request handler and persist the result via `server/db`.

**Multiplayer**: every function is scoped per faction — there is no "the economy," only "faction X's economy this turn." `runEconomyTick` takes the full `factions[]` list and must not assume its length.

## Status: real formulas, simplified inputs — not full parity yet

What's ported **verbatim or with a byte-parity test against GMap**:

- `adjustStock.mjs` — the actual clamp/reserve/journal math from `ledger.mjs`'s `adjustStock` (behavior-tested — see file header for why this one couldn't be a direct cross-repo diff)
- `deficit.mjs` — the actual thresholds from `economyTick.mjs`'s `updateDeficit` (behavior-tested, same reason)
- `taxes.mjs` — the actual tier/alias resolution from `economyTick.mjs`'s `taxRateFor` (behavior-tested, same reason)
- `populationGrowth.mjs` — `naturalPopDeltaBeforeModifiers`, byte-parity tested by direct cross-repo import (it's the one GMap function here that's both pure and exported)
- `economyTick.mjs`'s empty-treasury emigration penalty (`-2%/turn` floor when `deficit === "empty"`) and the tax-pressure decay/cap (`×0.85` then clamp to `[0, 12]`) — both literal constants from GMap's `runEconomyTick`, behavior-tested (that function isn't independently callable for a direct diff, same reason as `adjustStock`/`deficit`/`taxes` above)
- `fxExchange.mjs`'s `instantPegCredit` — byte-parity with GMap; `computeFxExchangeState` is the file-I/O-stripped body of GMap's `refreshFxExchange` (EMA + bilateral rates). `marketRates.mjs` ports GM-override-wins merge. `currencyPeg.mjs`'s `strategicResourceIdSet` / `resolveTreasuryPeg` are parity-tested ports; `pegExchangeRate` / `convertPeggedResource` / `gmPegMultiplier` are **not** a port (dominance formula + bounded GM dial; GMap never auto-converts peg extraction into metal/supply).

`legacyIncome.mjs` is **not** a port — simplified stand-in for GMap's system-level metal/supply floor (this project has `planet.resources` only).

What `economyTick.mjs`'s `runEconomyTick` does **not** do yet: compute category income itself. That now happens in `server/campaign/turn.mjs` (flow income Pass 5 peg conversion + legacy floor + force upkeep) and is passed in as `categoryIncome`. The general `economy_schema.market` order-book stays a stub, same as GMap.
