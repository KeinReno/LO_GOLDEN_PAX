# scripts

Content validators, ported unchanged from `GMap/scripts/*` (same relative path structure to `content/` and `server/`, so no path edits were needed):

- `validateTechnologies.mjs` — schema/graph checks on `technologies.json`
- `validateTechRecipes.mjs` — alchemy recipe/combo checks
- `validateRaces.mjs` — race hierarchy + trait budget checks (uses `server/raceRegistry.mjs`)
- `lintBalance.mjs` — cross-content balance budget + cost-curve checks

Run all four with `npm run validate:content`. Live campaign smokes (need `node server/serve.mjs` first): `playtestCampaign.mjs`, `playtestCurrencyPeg.mjs`, `smokeForcesP2P3.mjs`, `smokePriority4.mjs`.
