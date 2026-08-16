-- Golden Pax normalized state.
--
-- Rule (see CLAUDE.md #5): every table here is typed. No generic `kv`/blob
-- fallback table exists — when a new domain needs to persist something,
-- add a real table/columns for it here instead of stuffing JSON into a
-- catch-all row. `*_json` columns below are for genuinely variable payload
-- (ledger reason metadata, event payloads) that isn't itself queried on,
-- not a substitute for schema design.

CREATE TABLE IF NOT EXISTS store_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- One row per campaign. A deployment may host more than one campaign later;
-- every other table below scopes to a campaign_id for that reason, even
-- though today only one campaign runs per server instance.
CREATE TABLE IF NOT EXISTS campaigns (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- A faction is one player's seat. Never assume a fixed count — a campaign
-- can have any number of rows here, including NPC factions (player_id NULL).
CREATE TABLE IF NOT EXISTS factions (
  id               TEXT PRIMARY KEY,
  campaign_id      TEXT NOT NULL REFERENCES campaigns(id),
  name             TEXT NOT NULL,
  player_id        TEXT,               -- NULL = NPC/unclaimed faction
  race_id          TEXT NOT NULL,
  color_hex        TEXT NOT NULL,
  is_npc           INTEGER NOT NULL DEFAULT 0,
  peg_resource_id  TEXT,               -- map.* treasury peg; null = peg-less (legacy floor only)
  peg_changed_turn INTEGER             -- turn the peg last *switched*; null = never switched (full strength)
);
CREATE INDEX IF NOT EXISTS idx_factions_campaign ON factions(campaign_id);

-- Human players. The GM is not a row here — GM auth is the master token
-- (see server/api/auth.mjs), not a faction-bound player.
CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  token_hash    TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS table_meta (
  campaign_id    TEXT PRIMARY KEY REFERENCES campaigns(id),
  current_turn   INTEGER NOT NULL DEFAULT 0,
  table_revision INTEGER NOT NULL DEFAULT 0,
  last_tick_at   TEXT,
  tick_frozen    INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tick_journal (
  campaign_id  TEXT NOT NULL REFERENCES campaigns(id),
  turn         INTEGER NOT NULL,
  turn_from    INTEGER,
  turn_to      INTEGER,
  economy_json TEXT,
  created_at   TEXT,
  PRIMARY KEY (campaign_id, turn)
);

CREATE TABLE IF NOT EXISTS tick_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id  TEXT NOT NULL REFERENCES campaigns(id),
  turn         INTEGER NOT NULL,
  type         TEXT NOT NULL,
  payload_json TEXT,
  at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tick_events_turn ON tick_events(campaign_id, turn);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  at          TEXT NOT NULL,
  turn        INTEGER NOT NULL,
  faction_id  TEXT NOT NULL REFERENCES factions(id),
  currency_id TEXT NOT NULL,
  delta       REAL NOT NULL,
  reason      TEXT,
  intent_id   TEXT,
  extras_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_ledger_faction_turn ON ledger_entries(faction_id, turn);

CREATE TABLE IF NOT EXISTS intents (
  id           TEXT PRIMARY KEY,
  campaign_id  TEXT NOT NULL REFERENCES campaigns(id),
  faction_id   TEXT NOT NULL REFERENCES factions(id),
  turn         INTEGER NOT NULL,
  status       TEXT NOT NULL,
  def_id       TEXT,
  payload_json TEXT,
  submitted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intents_turn_status ON intents(campaign_id, turn, status);

CREATE TABLE IF NOT EXISTS engagements (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  status      TEXT NOT NULL,
  theater     TEXT,
  turn        INTEGER,
  result_json TEXT
);

-- Per-domain faction accounts (see server/campaign/*Store.mjs, the only
-- code allowed to read/write these — server/domain/* stays DB-free per
-- CLAUDE.md rule 3). One row set per (campaign_id, faction_id): genuinely
-- enumerable/queryable data (stocks, unlocked techs, opinions, relations)
-- gets its own EAV-style table; small always-together structures
-- (tax slots, tech tiers, treaties, history) stay as *_json columns on the
-- account row — see the file header note on when JSON is appropriate here.

-- Economy (domain/economy/ledgerAccount.mjs) --------------------------------

CREATE TABLE IF NOT EXISTS faction_stocks (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  faction_id  TEXT NOT NULL REFERENCES factions(id),
  currency_id TEXT NOT NULL,
  amount      REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (campaign_id, faction_id, currency_id)
);

CREATE TABLE IF NOT EXISTS faction_economy (
  campaign_id         TEXT NOT NULL REFERENCES campaigns(id),
  faction_id          TEXT NOT NULL REFERENCES factions(id),
  pressure            REAL NOT NULL DEFAULT 0,
  deficit             TEXT NOT NULL DEFAULT 'ok',
  taxes_json          TEXT NOT NULL DEFAULT '{}',
  stock_reserves_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (campaign_id, faction_id)
);

-- Tech (domain/tech/techAccount.mjs) -----------------------------------------

CREATE TABLE IF NOT EXISTS faction_unlocked_techs (
  campaign_id   TEXT NOT NULL REFERENCES campaigns(id),
  faction_id    TEXT NOT NULL REFERENCES factions(id),
  tech_id       TEXT NOT NULL,
  unlocked_turn INTEGER,
  PRIMARY KEY (campaign_id, faction_id, tech_id)
);

CREATE TABLE IF NOT EXISTS faction_tech (
  campaign_id              TEXT NOT NULL REFERENCES campaigns(id),
  faction_id               TEXT NOT NULL REFERENCES factions(id),
  tech_grades_json         TEXT NOT NULL DEFAULT '{}',
  tech_sockets_json        TEXT NOT NULL DEFAULT '{}',
  current_offers_json      TEXT NOT NULL DEFAULT '{}',
  tech_tiers_json          TEXT NOT NULL DEFAULT '{}',
  unlocked_properties_json TEXT NOT NULL DEFAULT '[]',
  research_queue_json      TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (campaign_id, faction_id)
);

-- Court (domain/court/civicAccount.mjs) --------------------------------------

CREATE TABLE IF NOT EXISTS faction_civic (
  campaign_id   TEXT NOT NULL REFERENCES campaigns(id),
  faction_id    TEXT NOT NULL REFERENCES factions(id),
  trade_score   REAL NOT NULL DEFAULT 0,
  culture_score REAL NOT NULL DEFAULT 0,
  laws_json     TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (campaign_id, faction_id)
);

-- Diplomacy (domain/diplomacy/{diplomacyAccount,relations}.mjs) -------------

CREATE TABLE IF NOT EXISTS faction_diplomacy (
  campaign_id             TEXT NOT NULL REFERENCES campaigns(id),
  faction_id              TEXT NOT NULL REFERENCES factions(id),
  treaties_json           TEXT NOT NULL DEFAULT '[]',
  history_json            TEXT NOT NULL DEFAULT '[]',
  last_broken_treaty_turn INTEGER,
  PRIMARY KEY (campaign_id, faction_id)
);

CREATE TABLE IF NOT EXISTS faction_opinions (
  campaign_id       TEXT NOT NULL REFERENCES campaigns(id),
  faction_id        TEXT NOT NULL REFERENCES factions(id),
  toward_faction_id TEXT NOT NULL,
  opinion           REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (campaign_id, faction_id, toward_faction_id)
);

-- Symmetric relation between an unordered faction pair — always stored
-- with faction_a_id < faction_b_id (see relations.mjs's relationKey);
-- diplomacy_stances content ("war", "alliance", ...) supplies the meaning.
CREATE TABLE IF NOT EXISTS diplomacy_relations (
  campaign_id  TEXT NOT NULL REFERENCES campaigns(id),
  faction_a_id TEXT NOT NULL,
  faction_b_id TEXT NOT NULL,
  relation     TEXT NOT NULL DEFAULT 'neutral',
  PRIMARY KEY (campaign_id, faction_a_id, faction_b_id)
);

-- World: systems/planets/buildings (domain/planets/*.mjs; see
-- server/campaign/planetStore.mjs, the only code that reads/writes these).
-- Added once a real playtest showed economy/combat had nothing underneath
-- actually producing their inputs — see domain/planets/README.md.

CREATE TABLE IF NOT EXISTS systems (
  id               TEXT PRIMARY KEY,
  campaign_id      TEXT NOT NULL REFERENCES campaigns(id),
  name             TEXT NOT NULL,
  owner_faction_id TEXT,
  x                REAL,                 -- display-only (client map); never a gameplay rule input
  y                REAL,                 -- display-only (client map); never a gameplay rule input
  is_capital       INTEGER NOT NULL DEFAULT 0, -- logistics capital marker (GMap system.isCapital)
  kind             TEXT,                 -- display/catalog (stellar, corridor, ...); not a movement rule
  stars_json       TEXT                  -- display [{class, luminosity}, ...]; not a gameplay rule input
);
CREATE INDEX IF NOT EXISTS idx_systems_campaign ON systems(campaign_id);

-- Political/geographic overlay copied from GMap world.sectors. Display-only
-- (polygon + color + notes); no server rule reads this table.
CREATE TABLE IF NOT EXISTS sectors (
  id            TEXT PRIMARY KEY,
  campaign_id   TEXT NOT NULL REFERENCES campaigns(id),
  name          TEXT NOT NULL,
  polygon_json  TEXT NOT NULL, -- flat [x,y,x,y,...] same shape as GMap
  color         TEXT,
  notes         TEXT
);
CREATE INDEX IF NOT EXISTS idx_sectors_campaign ON sectors(campaign_id);

-- Hyperlane graph (GMap world.links). Undirected at the rule layer
-- (pathfinding.mjs walks both ends). GM-authored, same tier as systems.
CREATE TABLE IF NOT EXISTS system_links (
  id              TEXT PRIMARY KEY,
  campaign_id     TEXT NOT NULL REFERENCES campaigns(id),
  from_system_id  TEXT NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  to_system_id    TEXT NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  type            TEXT NOT NULL -- corridor | gate | damyl_planet (fleets cannot use damyl_planet)
);
CREATE INDEX IF NOT EXISTS idx_system_links_campaign ON system_links(campaign_id);
CREATE INDEX IF NOT EXISTS idx_system_links_from ON system_links(from_system_id);
CREATE INDEX IF NOT EXISTS idx_system_links_to ON system_links(to_system_id);

CREATE TABLE IF NOT EXISTS planets (
  id                    TEXT PRIMARY KEY,
  system_id             TEXT NOT NULL REFERENCES systems(id),
  campaign_id           TEXT NOT NULL REFERENCES campaigns(id),
  name                  TEXT NOT NULL,
  type                  TEXT,
  climate               TEXT,
  habitable             INTEGER NOT NULL DEFAULT 1,
  colonizable           INTEGER NOT NULL DEFAULT 1,
  population            REAL NOT NULL DEFAULT 0,
  colony_type           TEXT NOT NULL DEFAULT 'none',
  owner_faction_id      TEXT,
  grade                 INTEGER NOT NULL DEFAULT 1, -- 1-5; surfaceSlots is derived (domain/planets/planetGrade.mjs)
  orbital_grade         INTEGER NOT NULL DEFAULT 1, -- independent 1-5 counter; orbitalSlots derived separately
  surface_slots         INTEGER NOT NULL DEFAULT 8, -- denormalized from grade (source of truth is planetGrade.surfaceSlotsForGrade)
  orbital_slots         INTEGER NOT NULL DEFAULT 4, -- denormalized from orbital_grade
  race_composition_json TEXT NOT NULL DEFAULT '[]',
  resources_json        TEXT NOT NULL DEFAULT '[]' -- map_resources.json ids present on this planet; GM-authored (domain/planets/extraction.mjs), not procedural yet
);
CREATE INDEX IF NOT EXISTS idx_planets_system ON planets(system_id);
CREATE INDEX IF NOT EXISTS idx_planets_campaign_owner ON planets(campaign_id, owner_faction_id);

-- Per-instance space objects on a system (domain/planets/spaceObjects.mjs).
-- Typed rows rather than a JSON blob: depleting types (asteroid/comet/debris)
-- track remaining_amount independently and get deleted at 0; non-depleting
-- types store remaining_amount NULL. Control is system.owner_faction_id —
-- no separate presence/claim column (grill Q4a).
CREATE TABLE IF NOT EXISTS system_space_objects (
  id                TEXT PRIMARY KEY,
  campaign_id       TEXT NOT NULL REFERENCES campaigns(id),
  system_id         TEXT NOT NULL REFERENCES systems(id),
  type_id           TEXT NOT NULL,
  remaining_amount  REAL
);
CREATE INDEX IF NOT EXISTS idx_system_space_objects_system ON system_space_objects(system_id);

CREATE TABLE IF NOT EXISTS planet_buildings (
  id          TEXT PRIMARY KEY,
  planet_id   TEXT NOT NULL REFERENCES planets(id),
  building_id TEXT NOT NULL,
  name        TEXT,
  kind        TEXT,
  zone        TEXT NOT NULL DEFAULT 'surface',
  disabled    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_planet_buildings_planet ON planet_buildings(planet_id);

-- Forces: fleets/legions (domain/forces/*.mjs; see server/campaign/
-- forcesStore.mjs). Composition stays a JSON column, not row-per-unit-type
-- — it's a small always-together list (a handful of groups per force,
-- {defId, tier, roles, count, crewCount?, stat fields}), same reasoning as other
-- *_json columns in this file, not independently queried anywhere.
CREATE TABLE IF NOT EXISTS forces (
  id                TEXT PRIMARY KEY,
  campaign_id       TEXT NOT NULL REFERENCES campaigns(id),
  faction_id        TEXT NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'fleet', -- 'fleet' | 'legion'
  name              TEXT NOT NULL,
  home_planet_id    TEXT REFERENCES planets(id),
  system_id         TEXT REFERENCES systems(id), -- current location; instant-move updates this
  movement_points   INTEGER NOT NULL DEFAULT 0, -- fuel-derived pool; refills to max each turn
  engine_tier       INTEGER NOT NULL DEFAULT 0, -- fleet hop-range lookup; unused for legions
  fuel_tier         INTEGER NOT NULL DEFAULT 0, -- fleet MP-max lookup; unused for legions
  composition_json  TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_forces_campaign_faction ON forces(campaign_id, faction_id);
CREATE INDEX IF NOT EXISTS idx_forces_system ON forces(system_id);

-- FX exchange (domain/economy/fxExchange.mjs): EMA credits per peg resource
-- plus last computed pair rates. GM pair-overrides live in market_rate_overrides
-- (domain/economy/marketRates.mjs — GM/content row wins for an exact pair).
CREATE TABLE IF NOT EXISTS fx_credits (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  peg_id      TEXT NOT NULL,
  credit      REAL NOT NULL,
  PRIMARY KEY (campaign_id, peg_id)
);

CREATE TABLE IF NOT EXISTS fx_rates (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  pair        TEXT NOT NULL,
  buy         REAL NOT NULL,
  sell        REAL NOT NULL,
  note        TEXT,
  PRIMARY KEY (campaign_id, pair)
);

CREATE TABLE IF NOT EXISTS fx_exchange_meta (
  campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id),
  updated_at  TEXT,
  turn        INTEGER,
  variant     TEXT
);

CREATE TABLE IF NOT EXISTS market_rate_overrides (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  pair        TEXT NOT NULL,
  buy         REAL NOT NULL,
  sell        REAL NOT NULL,
  note        TEXT,
  PRIMARY KEY (campaign_id, pair)
);

-- GM bounded multiplier on a peg resource (domain/economy/currencyPeg.mjs
-- `gmPegMultiplier` clamps to [0.8, 1.5]). Per-resource, not per-faction.
CREATE TABLE IF NOT EXISTS peg_rate_overrides (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  resource_id TEXT NOT NULL,
  multiplier  REAL NOT NULL,
  PRIMARY KEY (campaign_id, resource_id)
);

-- Court / NPC roster (new domain — GMap kept npcs on in-memory faction JSON).
-- Queried columns are typed; traitIds + currentTask are small always-together
-- lists (same reasoning as forces.composition_json).
CREATE TABLE IF NOT EXISTS npcs (
  id                       TEXT PRIMARY KEY,
  campaign_id              TEXT NOT NULL REFERENCES campaigns(id),
  faction_id               TEXT NOT NULL REFERENCES factions(id),
  name                     TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'active', -- active|away|busy|dead|hidden
  race_id                  TEXT NOT NULL,
  trait_ids_json           TEXT NOT NULL DEFAULT '[]',
  posting_kind             TEXT NOT NULL DEFAULT 'court', -- court|governor|commander|admiral
  posting_target_id        TEXT, -- systemId (governor) or forceId (commander/admiral)
  posting_since_turn       INTEGER NOT NULL DEFAULT 0,
  council_seat             TEXT,
  bloc_id                  TEXT,
  is_bloc_leader           INTEGER NOT NULL DEFAULT 0,
  is_player_ruler          INTEGER NOT NULL DEFAULT 0,
  race_leadership_race_id  TEXT, -- GMap raceLeadership.raceId; optional, scoring only
  current_task_json        TEXT
);
CREATE INDEX IF NOT EXISTS idx_npcs_campaign_faction ON npcs(campaign_id, faction_id);
CREATE INDEX IF NOT EXISTS idx_npcs_posting ON npcs(campaign_id, faction_id, posting_kind, posting_target_id);

-- Per-faction council + expiring task effects. ruler_npc_id is the locked
-- throne pointer ensurePlayerRulers keeps in sync with npcs.is_player_ruler.
CREATE TABLE IF NOT EXISTS faction_court (
  campaign_id              TEXT NOT NULL REFERENCES campaigns(id),
  faction_id               TEXT NOT NULL REFERENCES factions(id),
  ruler_npc_id             TEXT,
  unlocked_seat_ids_json   TEXT NOT NULL DEFAULT '[]',
  locked_seat_ids_json     TEXT NOT NULL DEFAULT '[]',
  seat_portfolios_json     TEXT NOT NULL DEFAULT '{}',
  active_effects_json      TEXT NOT NULL DEFAULT '[]', -- npc_task effects with expiresTurn
  PRIMARY KEY (campaign_id, faction_id)
);

-- Faction-wide stability accumulator (STABILITY_AND_REVOLT_SPEC).
-- NOT a GMap port — GMap only labeled `stability_add` in modifierStack/ledger
-- and never consumed it. Independent of loyalty (also unbuilt). Typed row,
-- not a kv blob.
CREATE TABLE IF NOT EXISTS faction_stability (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  faction_id  TEXT NOT NULL REFERENCES factions(id),
  value       REAL NOT NULL,
  PRIMARY KEY (campaign_id, faction_id)
);

-- Stage-2/3 revolt hotspot per planet (one active row while rebels occupy).
-- stage2_since_turn is the spawn turn; secession fires after
-- economy_balance.stability.stage3DurationTurns further ticks if the rebel
-- force still exists. rebel_faction_id is minted at spawn and becomes a
-- real factions row only at secession (forces.faction_id has no FK).
CREATE TABLE IF NOT EXISTS planet_revolts (
  campaign_id         TEXT NOT NULL REFERENCES campaigns(id),
  planet_id           TEXT NOT NULL REFERENCES planets(id),
  source_faction_id   TEXT NOT NULL,
  rebel_force_id      TEXT,
  rebel_faction_id    TEXT NOT NULL,
  stage2_since_turn   INTEGER NOT NULL,
  PRIMARY KEY (campaign_id, planet_id)
);
CREATE INDEX IF NOT EXISTS idx_planet_revolts_faction ON planet_revolts(campaign_id, source_faction_id);

-- Display-only internal blocs (influence/support/threat are never consumed).
CREATE TABLE IF NOT EXISTS faction_internal_blocs (
  campaign_id    TEXT NOT NULL REFERENCES campaigns(id),
  faction_id     TEXT NOT NULL REFERENCES factions(id),
  bloc_id        TEXT NOT NULL,
  name           TEXT,
  kind           TEXT,
  stance         TEXT NOT NULL DEFAULT 'neutral',
  agenda         TEXT,
  description    TEXT,
  color          TEXT,
  race_ids_json  TEXT NOT NULL DEFAULT '[]',
  leader_npc_id  TEXT,
  influence      REAL NOT NULL DEFAULT 0,
  support        REAL NOT NULL DEFAULT 0,
  threat         REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (campaign_id, faction_id, bloc_id)
);

