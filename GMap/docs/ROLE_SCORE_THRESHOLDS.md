# RoleScore thresholds (first pass)

B2 shipped `threshold: 5000` on `structural` / `energy` as an explicit **placeholder**, not calibrated balance (`ECONOMY_TECH_REDESIGN_SPEC.md` §12, `role_milestones.json` meta). Expanding to 8 roles does **not** invent new magic numbers.

## First-pass numbers

| Role id | Threshold | Source |
|---|---|---|
| `structural` | 5000 | B2 stub, unchanged |
| `energy` | 5000 | B2 stub, unchanged |
| `offensive` | 5000 | copied B2 stub |
| `defensive` | 5000 | copied B2 stub |
| `mobility` | 5000 | copied B2 stub |
| `cognitive` | 5000 | copied B2 stub |
| `biological` | 5000 | copied B2 stub |
| `exotic` | 5000 | copied B2 stub |

Authoritative file: `content/core/role_milestones.json`. Mirror in `economy_schema.role_score_pilot.thresholds` is UI/API fallback only.

## Tick

`roleScore[role] += floor(extracted × max(1, tier))` per tick. Never spent, never decreases. Linear tier weight is the B2 choice.

## Gate

Reaching 5000 does **not** open the path. Breakthrough tech (`tech.path.<role>_breakthrough`) still requires RoleScore ≥ threshold **and** a paid `currency.cognitio` research. No `raceLock`.

## Not done here

Final balance (when 5000 is actually reachable, whether later roles should cost more) waits on live RoleScore traces. Path-signature tech catalogs are out of scope.
