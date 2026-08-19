/**
 * Player token auth: hashed sessions, password still logs in,
 * bare x-faction-id is not identity.
 * Run from GMap/:  node --test server/playerAuth.test.mjs
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  setPlayerAuthStoreForTests,
  resolvePlayerAuth,
  loginWithPassword,
  findSessionByPlainToken,
  issueSessionToken,
  verifyFactionPassword,
  scryptHash,
  scryptVerify,
  publicLoginFactions,
  isPlayerLoginFaction,
  PLAYER_TOKEN_HEADER,
} from "./playerAuth.mjs";

function memStore() {
  let data = { sessions: [] };
  return {
    read: () => data,
    write: (next) => {
      data = next;
    },
    dump: () => data,
  };
}

const world = {
  factions: [
    { id: "house_a", name: "A", password: "4821" },
    { id: "house_b", name: "B", password: "7390" },
    { id: "npc", name: "NPC", password: "" },
    {
      id: "hashed",
      name: "H",
      passwordHash: scryptHash("5510"),
    },
  ],
};

function req(headers = {}) {
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return { headers: lower };
}

describe("playerAuth", () => {
  let store;

  beforeEach(() => {
    store = memStore();
    setPlayerAuthStoreForTests(store);
  });

  it("rejects bare x-faction-id as identity", () => {
    const auth = resolvePlayerAuth(
      req({ "x-faction-id": "house_a" }),
      world,
      {},
    );
    assert.equal(auth.ok, false);
    assert.match(String(auth.error), /token|пароль/i);
  });

  it("rejects empty NPC password even if client sends empty secret", () => {
    const auth = resolvePlayerAuth(req(), world, {
      body: { factionId: "npc", password: "" },
    });
    assert.equal(auth.ok, false);
  });

  it("password login still works and issues a token", () => {
    const login = loginWithPassword(world, {
      factionId: "house_a",
      password: "4821",
    });
    assert.equal(login.ok, true);
    assert.equal(login.faction.id, "house_a");
    assert.equal(typeof login.playerToken, "string");
    assert.ok(login.playerToken.length >= 32);
    const dumped = JSON.stringify(store.dump());
    assert.equal(dumped.includes(login.playerToken), false);
    assert.equal(dumped.includes("4821"), false);
    assert.ok(findSessionByPlainToken(login.playerToken));
  });

  it("wrong password is rejected", () => {
    const login = loginWithPassword(world, {
      factionId: "house_a",
      password: "0000",
    });
    assert.equal(login.ok, false);
    assert.equal(store.dump().sessions.length, 0);
  });

  it("token header authenticates the bound faction, not x-faction-id", () => {
    const login = loginWithPassword(world, {
      factionId: "house_a",
      password: "4821",
    });
    const auth = resolvePlayerAuth(
      req({
        [PLAYER_TOKEN_HEADER]: login.playerToken,
        "x-faction-id": "house_b",
      }),
      world,
      { body: { factionId: "house_b" } },
    );
    assert.equal(auth.ok, true);
    assert.equal(auth.via, "token");
    assert.equal(auth.faction.id, "house_a");
  });

  it("compat window: password header still authenticates", () => {
    const auth = resolvePlayerAuth(
      req({
        "x-faction-id": "house_b",
        "x-faction-password": "7390",
      }),
      world,
      {},
    );
    assert.equal(auth.ok, true);
    assert.equal(auth.via, "password");
    assert.equal(auth.faction.id, "house_b");
  });

  it("compat window: body password still authenticates mutations", () => {
    const auth = resolvePlayerAuth(req(), world, {
      body: { factionId: "house_a", password: "4821" },
    });
    assert.equal(auth.ok, true);
    assert.equal(auth.via, "password");
  });

  it("board/planet-style mutations accept token without password", () => {
    const login = loginWithPassword(world, {
      factionId: "house_a",
      password: "4821",
    });
    const auth = resolvePlayerAuth(
      req({ [PLAYER_TOKEN_HEADER]: login.playerToken }),
      world,
      {
        body: {
          factionId: "house_a",
          legionId: "leg_1",
          targetFleetId: "flt_1",
          action: "colonize",
        },
      },
    );
    assert.equal(auth.ok, true);
    assert.equal(auth.via, "token");
    assert.equal(auth.faction.id, "house_a");
    assert.equal(Object.prototype.hasOwnProperty.call(auth, "playerToken"), false);
  });

  it("research or reroll accepts token without password", () => {
    const login = loginWithPassword(world, {
      factionId: "house_a",
      password: "4821",
    });
    const research = resolvePlayerAuth(
      req({ [PLAYER_TOKEN_HEADER]: login.playerToken }),
      world,
      { body: { factionId: "house_a", techId: "tech_optics" } },
    );
    assert.equal(research.ok, true);
    assert.equal(research.via, "token");
    assert.equal(research.faction.id, "house_a");
    const reroll = resolvePlayerAuth(
      req({ [PLAYER_TOKEN_HEADER]: login.playerToken }),
      world,
      { body: { factionId: "house_b", category: "A" } },
    );
    assert.equal(reroll.ok, true);
    assert.equal(reroll.via, "token");
    assert.equal(reroll.faction.id, "house_a");
  });

  it("rejects a forged token", () => {
    const auth = resolvePlayerAuth(
      req({ [PLAYER_TOKEN_HEADER]: "not-a-real-token" }),
      world,
      {},
    );
    assert.equal(auth.ok, false);
  });

  it("scrypt passwordHash verifies without storing the PIN in the session blob", () => {
    assert.equal(verifyFactionPassword(world.factions[3], "5510"), true);
    assert.equal(verifyFactionPassword(world.factions[3], "0000"), false);
    assert.equal(scryptVerify("5510", world.factions[3].passwordHash), true);
    const login = loginWithPassword(world, {
      factionId: "hashed",
      password: "5510",
    });
    assert.equal(login.ok, true);
    assert.equal(JSON.stringify(store.dump()).includes("5510"), false);
  });

  it("issueSessionToken hashes the secret; plaintext is returned once", () => {
    const token = issueSessionToken("house_a");
    const row = store.dump().sessions[0];
    assert.ok(row.tokenHash);
    assert.equal(row.tokenHash.includes(token), false);
    assert.equal(row.factionId, "house_a");
    assert.ok(findSessionByPlainToken(token));
  });

  it("publicLoginFactions drops empty PIN, destroyed names, and Galivan houses", () => {
    const list = publicLoginFactions({
      factions: [
        { id: "house_a", name: "A", password: "4821", color: "#000" },
        { id: "npc", name: "NPC", password: "", color: "#111" },
        { id: "dead", name: "Южный Рой (уничтожен)", password: "x", color: "#222" },
        { id: "fallen", name: "Союз Балсагон (павший)", password: "y", color: "#333" },
        {
          id: "faction_nomad_pax_terrialis",
          name: "Pax Terrialis · Галиван",
          password: "1111",
          color: "#444",
        },
        {
          id: "faction_nomad_f_abc",
          name: "Вайсы · Галиван",
          password: "2222",
          color: "#555",
        },
      ],
    });
    assert.deepEqual(
      list.map((f) => f.id),
      ["house_a"],
    );
    assert.equal(isPlayerLoginFaction({ id: "npc", password: "" }), false);
    assert.equal(
      isPlayerLoginFaction({
        id: "faction_nomad_pax_terrialis",
        name: "Pax Terrialis · Галиван",
        password: "1111",
      }),
      false,
    );
  });

  it("PIN-only login seats the matching faction", () => {
    const login = loginWithPassword(world, { password: "5510" });
    assert.equal(login.ok, true);
    assert.equal(login.faction.id, "hashed");
    assert.ok(login.playerToken);
  });

  it("PIN-only login rejects unknown keys", () => {
    const login = loginWithPassword(world, { password: "0000" });
    assert.equal(login.ok, false);
    assert.equal(store.dump().sessions.length, 0);
  });

  it("PIN-only login rejects a duplicated PIN", () => {
    const dupWorld = {
      factions: [
        { id: "a", name: "A", password: "1111" },
        { id: "b", name: "B", password: "1111" },
      ],
    };
    const login = loginWithPassword(dupWorld, { password: "1111" });
    assert.equal(login.ok, false);
  });
});
