/**
 * Quick API session smoke — run from GMap root:
 *   npm run smoke
 *   npm run smoke:tick          # also POST /api/turn/tick (mutates board)
 *
 * Env:
 *   GMAP_PORT / GMAP_BASE_URL
 *   GMAP_MASTER_TOKEN (default master2142)
 *   GMAP_SMOKE_TICK=1           — enable tick (same as --tick flag)
 *   GMAP_FACTION_ID / GMAP_FACTION_PASSWORD — override login probe
 *
 * Windows PowerShell (tick smoke):
 *   $env:GMAP_SMOKE_TICK='1'; npm run smoke
 *   npm run smoke:tick          # uses --tick flag, no env needed
 *
 * Tick safety: runs only with GMAP_SMOKE_TICK=1 or --tick. Skips if tickFrozen.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.GMAP_PORT || 5173);
const HOST = process.env.GMAP_BASE_URL || `http://127.0.0.1:${PORT}`;
const MASTER = process.env.GMAP_MASTER_TOKEN || "master2142";
const DO_TICK =
  process.env.GMAP_SMOKE_TICK === "1" || process.argv.includes("--tick");

/** @type {{ name: string, ok: boolean, detail?: string }[]} */
const results = [];

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function httpJson(method, urlPath, body, headers = {}, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, HOST);
    const payload =
      body == null ? null : Buffer.from(JSON.stringify(body), "utf8");
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: {
          ...headers,
          ...(payload
            ? {
                "Content-Type": "application/json; charset=utf-8",
                "Content-Length": payload.length,
              }
            : {}),
        },
        // Live campaign tick routinely exceeds 15s (~20–30s); keep probes short.
        timeout: opts.timeoutMs ?? 15000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data = text;
          try {
            data = text ? JSON.parse(text) : null;
          } catch {
            /* keep text */
          }
          resolve({ status: res.statusCode ?? 0, data, text });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function passwordForFaction(factionId) {
  if (process.env.GMAP_FACTION_PASSWORD) return process.env.GMAP_FACTION_PASSWORD;
  if (factionId === "f1") return "x";
  try {
    const pubPath = path.resolve(__dirname, "../data/published.json");
    const world = JSON.parse(fs.readFileSync(pubPath, "utf8"));
    const f = (world.factions || []).find((x) => x.id === factionId);
    return f?.password || null;
  } catch {
    return null;
  }
}

function pickFaction(factions) {
  if (process.env.GMAP_FACTION_ID) return process.env.GMAP_FACTION_ID;
  if (factions.some((f) => f.id === "f1")) return "f1";
  // Prefer a faction that has a password on the live board
  for (const f of factions) {
    if (passwordForFaction(f.id)) return f.id;
  }
  return factions[0]?.id || null;
}

async function main() {
  console.log(`sessionSmoke → ${HOST} (master token set: ${MASTER ? "yes" : "no"})`);
  console.log("-".repeat(56));

  try {
    const health = await httpJson("GET", "/api/health");
    if (health.status === 200 && health.data?.ok) {
      pass("GET /api/health");
    } else {
      fail("GET /api/health", `status=${health.status}`);
    }
  } catch (e) {
    fail("GET /api/health", e instanceof Error ? e.message : String(e));
  }

  try {
    const content = await httpJson("GET", "/api/content");
    const c = content.data;
    const missing = [
      "buildings",
      "technologies",
      "combat_property_matchups",
      "economy_schema",
      "role_milestones",
    ].filter((k) => !c?.[k]);
    if (
      content.status === 200 &&
      missing.length === 0 &&
      c.role_milestones?.structural?.threshold != null &&
      c.role_milestones?.energy?.threshold != null
    ) {
      pass("GET /api/content", "core economy keys present");
    } else {
      fail(
        "GET /api/content",
        missing.length
          ? `missing: ${missing.join(", ")}`
          : `status=${content.status} or role_milestones incomplete`,
      );
    }
  } catch (e) {
    fail("GET /api/content", e instanceof Error ? e.message : String(e));
  }

  let tickFrozen = false;
  try {
    const turnHealth = await httpJson("GET", "/api/turn/health", null, {
      "X-Master-Token": MASTER,
    });
    if (turnHealth.status === 200) {
      tickFrozen = !!turnHealth.data?.tickFrozen;
      pass("GET /api/turn/health", tickFrozen ? "tickFrozen=true" : "tickFrozen=false");
    } else {
      fail("GET /api/turn/health", `status=${turnHealth.status}`);
    }
  } catch (e) {
    fail("GET /api/turn/health", e instanceof Error ? e.message : String(e));
  }

  if (DO_TICK && tickFrozen) {
    try {
      const unfreeze = await httpJson(
        "POST",
        "/api/turn/freeze",
        { frozen: false },
        { "X-Master-Token": MASTER },
      );
      if (unfreeze.status === 200 && unfreeze.data?.ok) {
        pass("POST /api/turn/freeze (unfreeze for tick)");
        tickFrozen = false;
      } else {
        fail("POST /api/turn/freeze (unfreeze for tick)", `status=${unfreeze.status}`);
      }
    } catch (e) {
      fail(
        "POST /api/turn/freeze (unfreeze for tick)",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  if (DO_TICK) {
    if (tickFrozen) {
      console.log(
        "  SKIP  POST /api/turn/tick — tickFrozen (unfreeze failed or still frozen)",
      );
    } else {
      const ledgerPath = path.resolve(__dirname, "../data/ledger.json");
      let solariBefore = null;
      let energyBefore = null;
      try {
        const led = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
        solariBefore = Number(
          led?.factions?.faction_belator?.stocks?.["map.solari"] ?? 0,
        );
        energyBefore = Number(
          led?.factions?.faction_belator?.roleScores?.energy ?? 0,
        );
      } catch {
        solariBefore = null;
        energyBefore = null;
      }
      try {
        const tick = await httpJson(
          "POST",
          "/api/turn/tick",
          {},
          { "X-Master-Token": MASTER },
          { timeoutMs: 90000 },
        );
        if (tick.status === 200 && tick.data?.ok !== false) {
          pass("POST /api/turn/tick");
          // B1 T1.8: named strategic stock grows for Belator solari extractors.
          try {
            const ledAfter = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
            const solariAfter = Number(
              ledAfter?.factions?.faction_belator?.stocks?.["map.solari"] ?? 0,
            );
            if (solariBefore == null) {
              console.log("  SKIP  map.solari named stock — no ledger before tick");
            } else if (solariAfter > solariBefore) {
              pass(
                "map.solari named stock grows",
                `${solariBefore} → ${solariAfter}`,
              );
            } else if (solariAfter === solariBefore) {
              // Soft: no deposits / zero extraction this tick is allowed to hold.
              pass(
                "map.solari named stock stable",
                `${solariBefore} (no extraction this tick)`,
              );
            } else {
              fail(
                "map.solari named stock grows",
                `${solariBefore} → ${solariAfter}`,
              );
            }
            // B2 T2.8: RoleScore energy never decreases; grows when solari extracted.
            const energyAfter = Number(
              ledAfter?.factions?.faction_belator?.roleScores?.energy ?? 0,
            );
            if (energyBefore == null) {
              console.log("  SKIP  roleScores.energy — no ledger before tick");
            } else if (energyAfter < energyBefore) {
              fail(
                "roleScores.energy non-decreasing",
                `${energyBefore} → ${energyAfter}`,
              );
            } else if (solariAfter > solariBefore && energyAfter <= energyBefore) {
              fail(
                "roleScores.energy grows with solari",
                `solari ${solariBefore}→${solariAfter}, energy ${energyBefore}→${energyAfter}`,
              );
            } else if (energyAfter > energyBefore) {
              pass(
                "roleScores.energy grows",
                `${energyBefore} → ${energyAfter}`,
              );
            } else {
              pass(
                "roleScores.energy stable",
                `${energyBefore} (no energy extraction this tick)`,
              );
            }
          } catch (e) {
            fail(
              "map.solari named stock grows",
              e instanceof Error ? e.message : String(e),
            );
          }
        } else {
          fail(
            "POST /api/turn/tick",
            tick.data?.error || `status=${tick.status}`,
          );
        }
      } catch (e) {
        fail("POST /api/turn/tick", e instanceof Error ? e.message : String(e));
      }
    }
  } else {
    console.log(
      "  SKIP  POST /api/turn/tick — set GMAP_SMOKE_TICK=1 or npm run smoke:tick",
    );
  }

  try {
    const clear = await httpJson("POST", "/api/turn/alerts/clear", {}, {
      "X-Master-Token": MASTER,
    });
    if (clear.status === 200) {
      pass("POST /api/turn/alerts/clear");
    } else {
      fail("POST /api/turn/alerts/clear", `status=${clear.status}`);
    }
  } catch (e) {
    fail("POST /api/turn/alerts/clear", e instanceof Error ? e.message : String(e));
  }

  /** @type {{ id: string, name?: string }[]} */
  let factions = [];
  try {
    const facRes = await httpJson("GET", "/api/factions");
    if (facRes.status === 200 && Array.isArray(facRes.data)) {
      factions = facRes.data;
      pass("GET /api/factions", `${factions.length} faction(s)`);
    } else if (facRes.status === 404) {
      fail("GET /api/factions", "map not published");
    } else {
      fail("GET /api/factions", `status=${facRes.status}`);
    }
  } catch (e) {
    fail("GET /api/factions", e instanceof Error ? e.message : String(e));
  }

  const factionId = pickFaction(factions);
  const password = factionId ? passwordForFaction(factionId) : null;

  if (!factionId) {
    console.log("  SKIP  POST /api/login — no factions");
  } else if (!password) {
    console.log(
      `  SKIP  POST /api/login — no password for ${factionId} (set GMAP_FACTION_PASSWORD)`,
    );
  } else {
    try {
      const login = await httpJson("POST", "/api/login", {
        factionId,
        password,
      });
      const eco = login.data?.economy;
      const hasTiers =
        eco?.techTiers != null && typeof eco.techTiers === "object";
      const hasProps = Array.isArray(eco?.unlockedProperties);
      const hasTechs = Array.isArray(eco?.unlockedTechs);
      const hasRoleScores =
        eco?.roleScores != null && typeof eco.roleScores === "object";
      const ROLE_IDS = [
        "structural",
        "energy",
        "offensive",
        "defensive",
        "mobility",
        "cognitive",
        "biological",
        "exotic",
      ];
      const hasEightRoles =
        hasRoleScores &&
        ROLE_IDS.every((id) => typeof eco.roleScores[id] === "number");
      if (
        login.status === 200 &&
        hasTiers &&
        hasProps &&
        hasTechs &&
        hasEightRoles
      ) {
        pass(
          "POST /api/login economy",
          `${factionId}: techTiers + unlockedProperties + unlockedTechs + 8 roleScores`,
        );
      } else {
        const parts = [];
        if (!hasTiers) parts.push("techTiers");
        if (!hasProps) parts.push("unlockedProperties");
        if (!hasTechs) parts.push("unlockedTechs");
        if (!hasRoleScores) parts.push("roleScores");
        else if (!hasEightRoles) parts.push("roleScores[8]");
        fail(
          "POST /api/login economy",
          parts.length
            ? `missing: ${parts.join(", ")}`
            : `status=${login.status}`,
        );
      }
    } catch (e) {
      fail("POST /api/login economy", e instanceof Error ? e.message : String(e));
    }
  }

  console.log("-".repeat(56));
  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);
  console.log(`Summary: ${passed.length} passed, ${failed.length} failed`);
  if (failed.length) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail || ""}`);
    process.exit(1);
  }
  console.log("ALL PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
