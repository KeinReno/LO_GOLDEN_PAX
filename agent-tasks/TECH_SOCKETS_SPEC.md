# Tech Sockets & Resource Swaps — Implementation Spec

> **Handoff micro-spec for implementing agents.**  
> **Source Discovery:** `Golden_PAX_v0_5/notes/2026-08-14-tech-tree-redesign-grill.md` (Q6/Q7), `GMap/docs/TECH_PATHS_PLAN_v06.md`, `Golden_PAX_v0_5/agent-tasks/TECH_TREE_2_INTEGRATION_SPEC.md` §Priority 1.  
> **Target Status:** Module & tests landed in GMap (`server/techSockets.mjs`, `server/techSockets.test.mjs`), with full route + flowEngine integration contract formalized below.

---

## 1. Summary & Settled Design Decisions

1. **Empire-Wide Structural Modifier:** Sockets are tied to researched technologies and modify behavior empire-wide across all matching buildings/extractors of the faction, not per-building or per-planet instances.
2. **One-Time Spend, Permanent Until Replaced:**
   - Slotted resource state is stored per tech: `techSockets[techId] = resourceId`.
   - Filling/swapping is an instant one-shot spend (no ongoing per-turn upkeep or resource drain, zero lapse risk).
   - Overwriting an existing slotted socket with another valid resource is permitted and simply pays the new resource's fill cost again.
3. **Pre-requisite Gate:** A socket can only be filled if the technology has been researched (`unlockedTechs.includes(techId)`).
4. **Structural Upkeep Category Swapping:** The primary structural effect of a socket is re-routing upkeep demand categories for building classes (e.g. swapping an extractor upkeep slot from `D` [energia] to `E` [bios] or `A` [extracta]).
5. **Separation of Concerns:**
   - Content authoring of all catalog sockets is deferred. Mechanics are validated against canonical test fixtures (`tech.sock` with options `map.biofuel`, `map.iron`).
   - Sockets modify `flowEngine.addUpkeepDemand` by resolving categories dynamically via `activeSocketEffects(eco, content)` without hardcoding tech IDs in building routines.

---

## 2. Data Models & JSON Schema Changes

### 2.1 Content Schema (`content/core/technologies.json` & `tech_combos.json`)

A tech definition optionally declares a `socket` dictionary:

```json
{
  "id": "tech.bio_energy_synthesis",
  "name": "Био-энергетический синтез",
  "category": "E",
  "era": 2,
  "socket": {
    "map.biofuel": {
      "fillCost": { "currency.metal": 10 },
      "swapUpkeepCurrency": {
        "match": { "category": "A" },
        "fromCategory": "D",
        "toCategory": "E"
      },
      "label": "Питание экстракторов биомассой"
    },
    "map.iron": {
      "fillCost": { "currency.metal": 10 },
      "swapUpkeepCurrency": {
        "match": { "kind": "extractor" },
        "fromCategory": "D",
        "toCategory": "D"
      },
      "label": "Стандартная калибровка"
    }
  }
}
```

### 2.2 Faction Economy State Model (`ledger.mjs` / `techAccount`)

```typescript
interface FactionEconomyState {
  unlockedTechs: string[];
  /** Map of techId -> currently slotted resourceId */
  techSockets: Record<string, string>;
  stocks: Record<string, number>;
}
```

---

## 3. Server Files & API Routes to Touch

| File | Subsystem / Responsibility |
|---|---|
| `GMap/server/techSockets.mjs` | Core domain logic: `fillTechSocket`, `prepareSocketFill`, `activeSocketEffects`, `resolveUpkeepCategory`. |
| `GMap/server/techActions.mjs` | Intent & action dispatch: `fillResearchedTechSocket(factionId, techId, resourceId, meta)`. |
| `GMap/server/flowEngine.mjs` | Integration with `addUpkeepDemand(flows, def, opts)` reading `opts.socketEffects`. |
| `GMap/server/api.mjs` | HTTP Endpoint: `POST /api/economy/tech/fill-socket` (and `/api/economy/tech/:techId/fill-socket`). |
| `GMap/src/state/techSockets.ts` / `ResearchPanel.tsx` | UI binding for socket inspector and fill actions. |

### API Route Specification

#### `POST /api/economy/tech/fill-socket`
- **Authentication:** Valid player token matching `factionId` OR GM master token (`x-master-token`).
- **Request Body:**
  ```json
  {
    "factionId": "fac_sol",
    "techId": "tech.bio_energy_synthesis",
    "resourceId": "map.biofuel"
  }
```
- **Responses:**
  - `200 OK`:
    ```json
    {
      "ok": true,
      "techId": "tech.bio_energy_synthesis",
      "resourceId": "map.biofuel",
      "economy": { ... }
    }
    ```
  - `400 Bad Request`: `{ "ok": false, "error": "tech not researched" | "tech has no socket" | "resource is not a valid socket option" | "Не хватает currency.metal (нужно 10)" }`
  - `401 Unauthorized`: `{ "error": "unauthorized" }`

---

## 4. Exact Formulas, Numbers & Default Constants

1. **Default Fill Cost:**
   ```javascript
   export const DEFAULT_SOCKET_FILL_COST = { "currency.metal": 10 };
   ```
   If `def.socket[resourceId].fillCost` is omitted, the engine defaults to `{ "currency.metal": 10 }`.
2. **Category Swap Resolution Rule:**
   ```javascript
   export function resolveUpkeepCategory(slotCat, buildingDef, socketEffects) {
     let cat = slotCat;
     for (const fx of socketEffects || []) {
       const swap = fx.swapUpkeepCurrency;
       if (!swap) continue;
       const matchKind = swap.match?.kind ?? swap.buildingKind;
       const matchCat = swap.match?.category ?? swap.buildingCategory;
       if (matchKind && buildingDef?.kind !== matchKind) continue;
       if (matchCat && buildingDef?.category !== matchCat) continue;
       const from = swap.fromCategory || swap.from;
       const to = swap.toCategory || swap.to;
       if (from && cat !== from) continue;
       if (to) cat = to;
     }
     return cat;
   }
   ```
3. **Execution Pipeline:**
   - Lookup tech definition in `content.technologies` or `content.tech_combos`.
   - Ensure `eco.unlockedTechs.includes(techId)`.
   - Ensure `def.socket && def.socket[resourceId]`.
   - Check stock affordability (`stocks[cur] >= cost[cur]`).
   - Deduct fill cost from `stocks` and assign `eco.techSockets[techId] = resourceId`.

---

## 5. TDD Acceptance Criteria & Parity Tests

Unit tests live in `GMap/server/techSockets.test.mjs` (Run via `node --test server/techSockets.test.mjs`):

1. **Slotting & Overwrite Affordability:**
   - Filling empty socket costs specified resource and updates `techSockets[techId]`.
   - Swapping an already slotted socket to another option pays the new cost again and updates `techSockets[techId]`.
2. **Invalid State Rejections:**
   - Reject unresearched tech (`tech not researched`).
   - Reject invalid resource for socket (`resource is not a valid socket option`).
   - Reject when faction lacks cost stock (`Не хватает currency.metal`).
3. **Active Effects Extraction:**
   - `activeSocketEffects` returns only entries for technologies currently in `eco.unlockedTechs` with an active `techSockets` entry.
4. **Flow Engine Integration:**
   - `addUpkeepDemand` redirects upkeep requirement from `D` to `E` for matching buildings when `activeSocketEffects` are passed.
   - Non-matching building categories remain completely unaffected.

---

## 6. Out-of-Scope Boundaries

- **Full Catalog Authoring:** Authoring sockets for all 432 catalog technologies is deferred to incremental content passes.
- **Per-Planet Socket Variations:** No per-colony or per-building socket state (all socket modifications are strictly empire-wide).
- **Ongoing Upkeep Drain:** No recurring maintenance fee for keeping a socket slotted.
