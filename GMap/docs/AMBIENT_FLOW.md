# Ambient D/E + primary-before-secondary convert

v0.5 playtest port (`Golden_PAX_v0_5/notes/2026-08-14-ambient-flow-economy-grill.md`). Replaces GMap’s flat per-inhabited-planet trickle (`D += inhabited×2`, `E += max(1, inhabited)`).

## Formula

Faction-wide owned population `P` (sum of planet `population` on systems this faction owns). Empty `colonyType` tiles do not mint resources.

- `D[1] += max(1, ceil(P × 0.6))` — ambient energia (sun/geo)
- `E[1] += max(1, ceil(P × 0.5))` — subsistence bios
- `P ≤ 0` → add nothing

Same `P` on 1 planet or 4 planets → same ambient. Coefficients are v0.5 live defaults (`AMBIENT_ENERGIA_PER_POP` / `AMBIENT_BIOS_PER_POP`).

## Convert

Tick path: primary input converts immediately; secondary/catalyst claims wait until every building has run, then leftover supply is split. A lab’s E-as-primary is satisfied before a factory’s E-as-catalyst, independent of placement order.

`applyFlowConvert` itself is unchanged (greedy). Labor job-slots, deposit gate, peg-after-all-extract, and the metal/supply floor are unchanged.

## Check

`npm run test:ambient` (from `GMap/`).
