# Court Governance, NPC Postings & Task Progression — Implementation Spec

> **Handoff micro-spec for implementing agents.**  
> **Source Discovery:** `Golden_PAX_v0_5/notes/2026-08-14-court-governance-grill.md`, `Golden_PAX_v0_5/agent-tasks/COURT_AND_NPC_ROSTER_SPEC.md`.  
> **Target Status:** Court roster, governor/commander/admiral postings, council seats, and modifier-stack channels shipped in GMap (`server/courtRoster.mjs`, `server/courtGovernance.mjs`, `server/courtStatMult.mjs`, `server/narrative.mjs`, `server/dice.mjs`). Full contract formalized below.

---

## 1. Summary & Settled Design Decisions

1. **NPC Roster Origin via Direct GM CRUD:**
   - NPCs are created, updated, and removed via direct GM CRUD operations (master token authenticated) — NOT through deferred file-backed proposal inboxes (`courtProposals.mjs`).
   - Every newly created NPC MUST have a valid `raceId` (refuses creation with `npc_race_required` if omitted).
2. **Player Character & Ruler Throne Lock:**
   - Player character occupies `seat.ruler`.
   - `ensurePlayerRulers` enforces that the ruler is locked on the throne, with `isPlayerRuler: true`, `councilSeat: "seat.ruler"`, and `posting: { kind: "court" }`.
   - The ruler cannot be assigned to remote postings (`governor`, `commander`, `admiral`). Removing or replacing the ruler requires explicit confirmation (`confirmSetRuler: true`).
3. **Posting Targets & Force Kind Alignment:**
   - `governor` targets an owned `systemId` (applies system-scoped effects; applies `ungovernedLoyaltyPenalty` if an inhabited owned system lacks a governor).
   - `commander` targets a force with `kind === "legion"`.
   - `admiral` targets a force with `kind === "fleet"`.
   - API accepts unified `forceId` (mapping to `legionId`/`fleetId` internally) or `systemId`.
4. **Council Seats & Portfolios:**
   - Council seats (`content/core/council_seats.json`) provide empire-wide passive effects derived from assigned portfolios (with seat fallback).
   - Unlocking/locking seats is a GM action (`applyUnlockSeat`/`applyLockSeat`). Seating/unseating NPCs is a player action (`applySeatNpc`/`applyUnseatNpc`).
5. **Internal Blocs (Display-Only Parity):**
   - Blocs compute `influence`, `support`, and `threat` based on seated/posted members and race leadership.
   - Per design decision Q5, bloc scores remain strictly display-only metrics for GM narrative adjudication and do NOT trigger automated mechanics.
6. **Dice-Driven NPC Tasks (`rollNpcTaskProgress`):**
   - NPCs can be assigned tasks (`giveNpcTask`).
   - Progress ticks per turn: $\text{step} = \left(\frac{1}{\text{duration}}\right) \times \text{npcTaskSpeedMult}(\text{faction}) \times \text{diceMult}$.
   - For quest-linked tasks (`linkedQuestId`), dice variance applies (1d6 roll: 1–2 $\to 0.6\times$, 3–4 $\to 1.0\times$, 5–6 $\to 1.4\times$).
   - On completion, `task.effects` apply as expiring faction active effects (`expiresTurn = turn + 10`), and `advanceLinkedQuest` triggers.

---

## 2. Data Models & JSON Schemas

### 2.1 NPC Entity Model

```typescript
type NpcStatus = "active" | "away" | "busy" | "dead" | "hidden";
type PostingKind = "court" | "governor" | "commander" | "admiral";

interface NpcPosting {
  kind: PostingKind;
  sinceTurn: number;
  systemId?: string;
  legionId?: string;
  fleetId?: string;
  forceId?: string;
}

interface NpcTask {
  id: string;
  label: string;
  startedTurn: number;
  etaTurn: number;
  progress: number; // 0.0 to 1.0
  linkedQuestId?: string | null;
  effects?: Array<{
    effect: string;
    args?: Record<string, any>;
    expiresTurn?: number;
  }>;
}

interface Npc {
  id: string;
  name: string;
  raceId: string; // Mandatory on creation
  status: NpcStatus;
  traitIds: string[];
  posting: NpcPosting;
  councilSeat: string | null;
  blocId: string | null;
  isBlocLeader: boolean;
  isPlayerRuler: boolean;
  currentTask?: NpcTask | null;
  raceLeadership?: { raceId: string };
}
```

### 2.2 Content Files Used
- `content/core/council_seats.json`: 9 seats (`seat.ruler`, `seat.warmaster`, `seat.treasurer`, etc.), 10 portfolios.
- `content/core/npc_postings.json`: Definitions for `governor`, `commander`, `admiral` with `systemEffects`, `legionEffects`, `fleetEffects`, and `ungovernedLoyaltyPenalty`.
- `content/core/npc_traits.json`: Trait modifiers with realm/posting scopes.
- `content/core/internal_blocs.json`: Templates for 11 internal factions/blocs.

---

## 3. Server Files & API Routes to Touch

| File | Subsystem / Responsibility |
|---|---|
| `GMap/server/courtRoster.mjs` | Live NPC CRUD (`upsertNpc`, `removeNpc`, `setRuler`), posting assignment (`assignPosting`, `recallPosting`), seat actions (`applySeatNpc`, `applyUnseatNpc`). |
| `GMap/server/courtGovernance.mjs` | `ensurePlayerRulers`, `syncNpcPassiveEffects`, `recomputeInternalBlocs`, `npcLoyaltyDeltaForSystem`, `npcProductionMultForSystem`, `npcTaskSpeedMult`, `courtPopGrowthEffects`. |
| `GMap/server/courtStatMult.mjs` | Scoped `stat_mult` application to combat groups (`applyCourtStatMultToGroups`) for legions/fleets. |
| `GMap/server/dice.mjs` | Dice rolls for tasks: `rollNpcTaskProgress(_world, _npc)` (1d6 $\to$ `{ mult, roll }`). |
| `GMap/server/narrative.mjs` | Turn cycle task progression (`processNpcTasks`). |
| `GMap/server/processTurn.mjs` | Calling `syncNpcPassiveEffects(world)` and `processNpcTasks(world, turn, journal)` during turn execution. |
| `GMap/server/api.mjs` | HTTP routes: `/api/court/npcs/upsert`, `/api/court/npcs/remove`, `/api/court/npcs/set-ruler`, `/api/court/postings/assign`, `/api/court/postings/recall`, `/api/court/seats/assign`, `/api/court/seats/unseat`, `/api/court/seats/unlock`, `/api/court/seats/lock`. |

### Key API Endpoints

#### 1. `POST /api/court/npcs/upsert`
- **Auth:** Master token required.
- **Body:** `{ "factionId": "fac_sol", "npc": { "name": "Lord Vane", "raceId": "race_human", "traitIds": ["trait_tactician"] } }`
- **Validation:** `raceId` required for new NPCs.

#### 2. `POST /api/court/postings/assign`
- **Auth:** Player token for `factionId` or Master token.
- **Body:** `{ "factionId": "fac_sol", "npcId": "npc_1", "kind": "governor", "systemId": "sys_sol" }`
- **Validation:** Refuses ruler; refuses busy/dead NPCs; ensures target belongs to faction; clears any previous NPC posted to that target.

#### 3. `POST /api/court/seats/assign`
- **Auth:** Player token for `factionId` or Master token.
- **Body:** `{ "factionId": "fac_sol", "npcId": "npc_1", "seatId": "seat.warmaster" }`
- **Validation:** Seat must be unlocked; unseats previous occupant.

---

## 4. Modifier Stack Wiring & Progression Formulas

Council seats, postings, and NPC traits wire into the 7 standard effect channels:

### 4.1 Seven Modifier Channels
1. **`production_mult`**: Scoped via `npcProductionMultForSystem(world, factionId, systemId, resource)` and merged into `economyTick.mjs` per-system and empire-wide.
2. **`stat_mult`**: Processed via `applyCourtStatMultToGroups(groups, faction)` in `courtStatMult.mjs`. Multiplies `damage` or `armor` (`stat:defense` maps to `armor`) on matching force groups before combat resolution.
3. **`pop_growth_mult` / `pop_growth_flat`**: Processed via `courtPopGrowthEffects(faction)` and fed into population growth calculation.
4. **`npc_task_speed_mult`**: Evaluated directly via `npcTaskSpeedMult(faction)` to accelerate task progress steps.
5. **`loyalty_add`**: Processed via `npcLoyaltyDeltaForSystem(world, system, factionId)` including `ungovernedLoyaltyPenalty` (e.g. -2 for ungoverned populated systems), applied 1:1 to planet loyalty.
6. **`stability_add`**: Produced into `activeEffects` and consumed by `stabilityRevolt.mjs` for the 3-stage revolt meter.
7. **`move_cost_mult`**: Consumed by `forceMp.mjs` / `forceMovement.mjs` for fleet/legion jump cost calculations.

### 4.2 Task Progression Formula (`processNpcTasks`)
For an active task with duration $D = \max(1, \text{etaTurn} - \text{startedTurn})$:

$$\text{step} = \left(\frac{1}{D}\right) \times \text{npcTaskSpeedMult}(\text{faction})$$

If `task.linkedQuestId` is set, roll 1d6 via `rollNpcTaskProgress`:
$$\text{diceMult} = \begin{cases} 
0.6 & \text{if roll } \in \{1, 2\} \\ 
1.0 & \text{if roll } \in \{3, 4\} \\ 
1.4 & \text{if roll } \in \{5, 6\} 
\end{cases}$$

$$\text{progress}_{\text{new}} = \min(1.0, \text{progress} + \text{step} \times \text{diceMult})$$

When $\text{progress} \ge 1.0$ or $\text{turn} \ge \text{etaTurn}$:
1. Add `task.effects` to `faction.activeEffects` with `expiresTurn = turn + 10`.
2. Push court completion event to journal.
3. Call `advanceLinkedQuest(world, task.linkedQuestId, journal, { npcId })`.
4. Delete `npc.currentTask` and reset `npc.status = "active"`.

---

## 5. TDD Acceptance Criteria & Verification

Tests live in `GMap/server/courtRoster.test.mjs` (Run: `node --test server/courtRoster.test.mjs`):

1. **Roster CRUD & Ruler Lock:**
   - Creating NPC without `raceId` fails with `npc_race_required`.
   - `ensurePlayerRulers` locks designated ruler on `seat.ruler`.
   - Removing ruler fails unless `confirmSetRuler: true` is passed.
   - Setting a new ruler relocates `seat.ruler` to the new NPC and clears `isPlayerRuler` from the previous ruler.
2. **Posting Assignment & Conflict Resolution:**
   - Attempting to post the ruler returns `npc_is_player_ruler`.
   - Posting governor to a foreign system returns `npc_posting_foreign`.
   - Assigning governor to a system already held by another NPC recalls the old governor to `"court"`.
   - Recalling a posting resets NPC posting kind to `"court"`.
3. **Passive Effect Sync & Scoping:**
   - `syncNpcPassiveEffects` collects traits, council seat bonuses, and posting effects into `faction.activeEffects` with exact scopes (`faction`, `system`, `legion`, `fleet`).
4. **Combat Stat Multipliers:**
   - `applyCourtStatMultToGroups` applies `stat:damage` and `stat:defense` multipliers only to forces matching the target ID or faction-wide.
5. **Task Progress & Dice Roll:**
   - `rollNpcTaskProgress` produces correct 1d6 distribution ($0.6\times, 1.0\times, 1.4\times$).
   - `processNpcTasks` increments progress, completes at 1.0, stamps 10-turn expiring effects, and triggers linked quest advancement.

---

## 6. Out-of-Scope Boundaries

- **Proposal Inbox Workflow:** The 811-line file-backed pending proposal system (`courtProposals.mjs`) is explicitly deferred in favor of direct CRUD.
- **Automated Bloc Rebellions:** Internal bloc `threat` and `support` remain strictly display-only metrics for GM adjudication; they do not trigger automatic rebellions (revolts are driven exclusively by `planet.stability` via `stabilityRevolt.mjs`).
- **Procedural NPC Generation:** Random procedural birth/generation of NPCs is out of scope; all NPCs are introduced via GM creation.
