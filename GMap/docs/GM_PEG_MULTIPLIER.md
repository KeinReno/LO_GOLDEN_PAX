# GM treasury peg multiplier

Conversion itself: `server/currencyPeg.mjs` (rate × `gmPegMultiplier`, clamp **0.8–1.5**). Stored on `world.meta.gmPegMultipliers[resourceId]`. Persist goes through `normalizeWorld` so a save/reload does not drop the dial.

## Where the dial lives

- **UI:** GM workbench → domain **Баланс** (`GmBalancePanel`) → section **Курс казны (peg)**. Slider + resource picker. Master token.
- **HTTP:** `GET /api/gm/peg-multipliers` (current map + strategic/pegged resources). `POST /api/gm/peg-multiplier` `{ resourceId, multiplier }`. Both require the master token. Helpers: `listGmPegMultipliers` / `setGmPegMultiplier` in `server/gmCockpit.mjs`.
- **Not** player viewer, not JSON hand-edit.

Check: `cd GMap && node scripts/smokeCurrencyPeg.mjs`.
