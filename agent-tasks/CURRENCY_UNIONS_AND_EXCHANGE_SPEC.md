# Currency Unions & Bilateral Exchange Deals — Implementation Spec

> **Handoff micro-spec for implementing agents.**  
> **Source Discovery:** `Golden_PAX_v0_5/notes/2026-08-13-currency-peg-grill.md`, `Golden_PAX_v0_5/agent-tasks/CURRENCY_PEG_SPEC.md`, `GMap/docs/GM_PEG_MULTIPLIER.md`.  
> **Target Status:** Shipped in GMap (`server/economicTrack.mjs`, `server/currencyPeg.mjs`, `server/economicTrack.test.mjs`, `scripts/smokeCurrencyPeg.mjs`). Complete operational spec formalized below.

---

## 1. Summary & Settled Design Decisions

1. **Independent Two-Track Treaty Architecture:**
   - Diplomatic relations operate on two independent, coexisting tracks per faction pair: `TRACK_POLITICAL` (`"political"`) and `TRACK_ECONOMIC` (`"economic"`).
   - Changing or establishing an economic stance (e.g. `currency_exchange` or `currency_union`) does NOT break or overwrite political treaties (e.g. `alliance`, `trade`, `war`, `vassal`).
   - Treaties are keyed and replaced by `(pair, track)`.
2. **Three Coexisting Currency Exchange Mechanisms:**
   - **Direct Strategic Barter:** 1:1 physical raw stock exchange of strategic resources without treaties.
   - **Bilateral Exchange Deal (`currency_exchange`):** Bilateral agreement locking a frozen conversion quote (`unitsQuotePerBase`), immunizing the pair from EMA/market rate fluctuations.
   - **Currency Union (`currency_union`):** Asymmetric or joint currency zone where joiner adopts host's `treasuryPeg`. Joiner gains additive bonus income (`unionIncomeShare` = 10% of host's peg converted extraction) in `currency.metal` / `currency.supply`.
3. **Peg Conversion Mechanics & Asymmetry:**
   - Legacy income bridge remains as a low capped survival floor for unpegged factions.
   - Pegged factions convert extracted strategic resource into `currency.metal` and `currency.supply` via a non-linear global dominance formula.
4. **GM Rate Multiplier Dial & Clamp:**
   - GM has an explicit bounded dial per strategic resource (`world.meta.gmPegMultipliers[resourceId]`), clamped to `[0.8, 1.5]`.
   - Accessible exclusively via GM master token endpoints.
5. **Peg Transition Penalty:**
   - Changing an existing peg incurs a 3-turn transition penalty starting at 50% effectiveness (`transitionStart: 0.5`) and ramping linearly to 100% over 3 turns (`transitionTurns: 3`). First peg assignment is 100% effective immediately.

---

## 2. Data Models & JSON Schemas

### 2.1 Diplomacy Stances (`content/core/diplomacy_stances.json`)

```json
{
  "currency_exchange": {
    "name": "Валютное соглашение",
    "track": "economic",
    "asymmetric": false,
    "effects": []
  },
  "currency_union": {
    "name": "Валютный союз",
    "track": "economic",
    "asymmetric": true,
    "effects": []
  }
}
```

### 2.2 Economy Balance Configuration (`content/core/economy_balance.json`)

```json
{
  "currencyPeg": {
    "baseRate": 1.0,
    "dominanceK": 1.5,
    "rarityRef": 20.0,
    "rarityExp": 0.35,
    "rateMin": 0.01,
    "rateMax": 12.0,
    "gmMultiplierMin": 0.8,
    "gmMultiplierMax": 1.5,
    "gmMultiplierDefault": 1.0,
    "transitionStart": 0.5,
    "transitionTurns": 3,
    "unionIncomeShare": 0.1
  }
}
```

### 2.3 Treaty & World State Model

```typescript
interface Treaty {
  withFactionId: string;
  type: "alliance" | "war" | "trade" | "currency_exchange" | "currency_union" | string;
  track?: "political" | "economic";
  sinceTurn: number;
  /** Frozen exchange rate for currency_exchange */
  unitsQuotePerBase?: number;
  basePeg?: string;
  quotePeg?: string;
  /** Role for asymmetric currency_union: "host" | "joiner" */
  role?: "host" | "joiner";
  adoptedPeg?: string;
}

interface WorldMeta {
  turn: number;
  gmPegMultipliers?: Record<string, number>;
}

interface FactionState {
  id: string;
  treasuryPeg?: string | null;
  lastTreasuryPeg?: string | null;
  pegChangedTurn?: number | null;
  diplomacy: {
    treaties: Treaty[];
    opinions: Record<string, number>;
  };
}
```

---

## 3. Server Files & API Routes to Touch

| File | Responsibility |
|---|---|
| `GMap/server/opinionTick.mjs` | Multi-track treaty synchronization (`syncTreatiesFromEdge`, `stanceTrack`, `treatyTrack`). |
| `GMap/server/currencyPeg.mjs` | Peg rate formula, transition ramp, GM multiplier clamping, extraction-to-currency conversion. |
| `GMap/server/economicTrack.mjs` | `applyExchangeDeal`, `applyCurrencyUnion`, `barterStrategicSwap`, `settleExchangeDeal`, `applyCurrencyUnionIncome`. |
| `GMap/server/economyTick.mjs` | Integrating currency peg and union bonus income into the end-of-turn economy cycle. |
| `GMap/server/gmCockpit.mjs` | GM cockpit helper endpoints for querying and setting peg multipliers. |
| `GMap/server/api.mjs` | HTTP routes: `/api/currency/exchange-deal`, `/api/currency/union`, `/api/currency/barter`, `/api/currency/settle`, `/api/gm/peg-multiplier`. |

### API Route Endpoints

#### 1. `POST /api/currency/exchange-deal`
- **Auth:** Player token for `factionAId` or GM master token.
- **Body:** `{ "factionAId": "fac_sol", "factionBId": "fac_karn", "unitsQuotePerBase": 1.25 }`
- **Result:** Establishes `currency_exchange` treaty on the economic track with frozen quote.

#### 2. `POST /api/currency/union`
- **Auth:** Player token for `joinerFactionId` or GM master token.
- **Body:** `{ "joinerFactionId": "fac_karn", "hostFactionId": "fac_sol" }`
- **Result:** Establishes `currency_union` treaty on economic track; sets `joiner.treasuryPeg = host.treasuryPeg`.

#### 3. `POST /api/currency/barter`
- **Auth:** Player token or GM master token.
- **Body:** `{ "fromFactionId": "fac_a", "toFactionId": "fac_b", "give": { "resourceId": "map.titan", "amount": 10 }, "receive": { "resourceId": "map.adamantian", "amount": 10 } }`
- **Result:** Swaps stocks 1:1 if both factions have spendable reserves.

#### 4. `POST /api/gm/peg-multiplier`
- **Auth:** GM master token required (`x-master-token`).
- **Body:** `{ "resourceId": "map.solari", "multiplier": 1.2 }`
- **Result:** Clamps `multiplier` to `[0.8, 1.5]` and stores in `world.meta.gmPegMultipliers["map.solari"]`.

---

## 4. Exact Formulas, Numbers & Default Constants

### 4.1 Peg Rate Formula
For a faction with extraction share $S = \frac{\text{factionExt}}{\text{globalExt}}$ ($0 < S \le 1$):

$$\text{rate} = \text{baseRate} \cdot S^{k} \cdot \left(\frac{\text{rarityRef}}{\max(1, \text{globalExt})}\right)^{\text{rarityExp}} \cdot \text{gmMult}$$

- `baseRate` = 1.0
- `dominanceK` ($k$) = 1.5
- `rarityRef` = 20.0
- `rarityExp` = 0.35
- `rate` is clamped to $[0.01, 12.0]$

### 4.2 Peg Transition Ramp Multiplier
If peg was changed at turn $T_{\text{change}}$ and current turn is $T$:

$$\Delta T = \max(0, T - T_{\text{change}})$$

$$\text{rampMult} = \begin{cases} 
1.0 & \text{if } T_{\text{change}} \text{ is null (first peg)} \\
1.0 & \text{if } \Delta T \ge 3 \\
0.5 + 0.5 \cdot \left(\frac{\Delta T}{3}\right) & \text{if } \Delta T < 3 
\end{cases}$$

### 4.3 Currency Union Bonus Income
$$\text{bonusExtraction} = \text{hostExtraction} \times \text{unionIncomeShare} \quad (\text{default } 0.10)$$

$$\text{effectiveRate} = \text{hostRate} \times \text{hostTransitionMult} \times \text{gmMult}$$

- `bonusMetal` = $\lfloor \text{bonusExtraction} \times \text{effectiveRate} \rfloor$
- `bonusSupply` = $\lfloor \text{bonusExtraction} \times \text{effectiveRate} \times 0.5 \rfloor$
- Added directly to joiner's stocks during `economyTick.mjs`.

---

## 5. TDD Acceptance Criteria & Verification

Tests live in `GMap/server/economicTrack.test.mjs` and `GMap/scripts/smokeCurrencyPeg.mjs`:

1. **Two-Track Independence:**
   - Establishing `currency_exchange` or `currency_union` preserves existing `alliance`/`trade`/`war` relations.
   - Signing a new economic treaty replaces only prior economic treaties for that pair.
2. **Frozen Bilateral Deal Settlement:**
   - `settleExchangeDeal` exchanges stocks strictly according to `unitsQuotePerBase` stored on the treaty, ignoring subsequent market rate changes.
3. **Currency Union Joint Conversion:**
   - Joiner adopts host peg and receives additive metal/supply bonus proportional to host's converted extraction.
4. **GM Multiplier Enforcement:**
   - Setting `multiplier = 0.5` is clamped to `0.8`; setting `2.0` is clamped to `1.5`.
   - Clamped multiplier directly scales conversion output.
5. **Peg Switch Ramp:**
   - Switching peg sets `pegChangedTurn`; conversion multiplier yields 0.5 on turn 0, ~0.66 on turn 1, ~0.83 on turn 2, and 1.0 on turn 3+.

---

## 6. Out-of-Scope Boundaries

- **Arbitrary Order Book Market:** Full order-book trading (`market_orders`) remains a separate stub system; this spec covers bilateral pegs, unions, and barter only.
- **Forced Devaluation Shocks:** Automatic market crash mechanics outside the GM bounded multiplier dial are deferred.
- **Multilateral Custom Unions (>2 Factions):** Currency unions are structured as host-joiner bilateral pairings rather than N-way democratic assemblies.
