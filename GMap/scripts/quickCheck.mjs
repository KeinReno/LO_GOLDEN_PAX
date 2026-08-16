/**
 * Token-lean Fast Verification Suite
 * Runs all atomic unit tests, graph checks and tech validation in a single pass.
 * Usage: node scripts/quickCheck.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gmapRoot = path.resolve(__dirname, "..");

const steps = [
  { name: "Validate Technologies", cmd: "node", args: ["scripts/validateTechnologies.mjs"] },
  { name: "Validate Tech Recipes", cmd: "node", args: ["scripts/validateTechRecipes.mjs"] },
  { name: "Validate Races", cmd: "node", args: ["scripts/validateRaces.mjs"] },
  { name: "Lint Balance", cmd: "node", args: ["scripts/lintBalance.mjs"] },
  { 
    name: "Core Tests Suite", 
    cmd: "node", 
    args: [
      "--test",
      "server/techGrades.test.mjs",
      "server/techSockets.test.mjs",
      "server/techModifierEffects.test.mjs",
      "server/economicTrack.test.mjs",
      "server/courtRoster.test.mjs",
      "server/techOffers.test.mjs",
      "server/techDirections.test.mjs",
      "server/stabilityRevolt.test.mjs",
      "server/stability.test.mjs",
      "server/planetGrade.test.mjs",
      "server/forceMp.test.mjs",
      "server/roleScores.test.mjs"
    ] 
  }
];

let failed = 0;
console.log("=== Fast Token-Lean Verification Run ===");

for (const step of steps) {
  const t0 = Date.now();
  const res = spawnSync(step.cmd, step.args, {
    cwd: gmapRoot,
    encoding: "utf8",
    stdio: "pipe"
  });
  const dt = Date.now() - t0;

  if (res.status === 0) {
    console.log(`✓ [PASS] ${step.name} (${dt}ms)`);
  } else {
    failed++;
    console.error(`✗ [FAIL] ${step.name} (${dt}ms)`);
    if (res.stdout) console.log(res.stdout);
    if (res.stderr) console.error(res.stderr);
  }
}

console.log("========================================");
if (failed === 0) {
  console.log(`All ${steps.length} test suites PASSED cleanly.`);
  process.exit(0);
} else {
  console.error(`${failed} test suites FAILED.`);
  process.exit(1);
}
