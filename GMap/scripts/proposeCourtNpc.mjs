/**
 * Queue a court NPC draft proposal (pending-court.json) without touching published.json.
 *
 * Run:
 *   node GMap/scripts/proposeCourtNpc.mjs --faction faction_belator --name "Имя" --title "Титул" --role strategist --author grok --summary "Новый советник"
 *
 * Draft → approve flow: propose here, then accept via GM court UI or POST /api/court/proposals/:id/accept.
 * For bulk canon seeding use applyBelatorCourtNpcs.mjs instead.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const STORE_PATH = path.join(ROOT, "data/pending-court.json");

const FACTION_SHORT = {
  faction_belator: "bel",
  faction_karned: "kar",
  faction_amalfea: "ama",
  faction_federation: "fed",
};

function parseArgs(argv) {
  const out = { _: [] };
  const BOOL = new Set(["dry-run", "status", "help"]);
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      out._.push(token);
      continue;
    }
    const raw = token.slice(2);
    if (BOOL.has(raw)) {
      out[raw.replace(/-/g, "_")] = true;
      continue;
    }
    const key = raw.replace(/-/g, "_");
    const next = argv[i + 1];
    if (next != null && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function slugName(name) {
  return name
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/[а-я]/g, (ch) => {
      const map = {
        а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z",
        и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
        р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
        ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
      };
      return map[ch] ?? "x";
    })
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "npc";
}

function factionShort(factionId) {
  if (FACTION_SHORT[factionId]) return FACTION_SHORT[factionId];
  const base = String(factionId).replace(/^faction_/, "");
  return base.slice(0, 3) || "fac";
}

function newProposalId() {
  return `courtprop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function emptyStore() {
  return { version: 1, proposals: [] };
}

function readStore() {
  if (!fs.existsSync(STORE_PATH)) return emptyStore();
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.proposals)) {
      return emptyStore();
    }
    return { version: raw.version ?? 1, proposals: raw.proposals };
  } catch {
    return emptyStore();
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(
    STORE_PATH,
    `${JSON.stringify({ version: store.version ?? 1, proposals: store.proposals ?? [] }, null, 2)}\n`,
    "utf8",
  );
}

function buildNpc(args) {
  const factionId = String(args.faction || "");
  const name = String(args.name || "").trim();
  const title = String(args.title || "").trim();
  const role = String(args.role || "").trim();
  const notes = args.notes != null ? String(args.notes).trim() : "";

  const npcId =
    args.npc_id != null
      ? String(args.npc_id).trim()
      : `npc_${factionShort(factionId)}_${slugName(name)}`;

  const npc = {
    id: npcId,
    name,
    title,
    role,
    status: "active",
    posting: { kind: "court", sinceTurn: 0 },
  };

  if (notes) npc.publicNotes = notes;
  if (args.bloc) npc.blocId = String(args.bloc);

  return npc;
}

function buildProposal(args) {
  const factionId = String(args.faction || "");
  const summary = String(args.summary || "").trim();
  const author = String(args.author || "gm").trim();
  const rationale = args.rationale != null ? String(args.rationale).trim() : "";

  const missing = [];
  if (!factionId) missing.push("--faction");
  if (!args.name) missing.push("--name");
  if (!args.title) missing.push("--title");
  if (!args.role) missing.push("--role");
  if (!args.author) missing.push("--author");
  if (!summary) missing.push("--summary");
  if (missing.length) {
    throw new Error(`обязательные флаги: ${missing.join(", ")}`);
  }

  const npc = buildNpc(args);
  const proposal = {
    id: newProposalId(),
    status: "pending",
    createdAt: new Date().toISOString(),
    author,
    factionId,
    summary,
    ops: [{ op: "upsert_npc", npc }],
  };

  if (rationale) proposal.rationale = rationale;
  return proposal;
}

function postBodyFromProposal(proposal) {
  const body = {
    factionId: proposal.factionId,
    summary: proposal.summary,
    author: proposal.author,
    ops: proposal.ops,
  };
  if (proposal.rationale) body.rationale = proposal.rationale;
  if (proposal.confirmSetRuler) body.confirmSetRuler = true;
  return body;
}

function printUsage() {
  console.log(`Usage:
  node GMap/scripts/proposeCourtNpc.mjs --faction <id> --name "..." --title "..." --role <role> --author <who> --summary "..."

Optional:
  --bloc bloc.xxx          --notes "..."       --rationale "..."
  --npc-id npc_...         --dry-run           --status

Examples:
  node GMap/scripts/proposeCourtNpc.mjs --faction faction_belator --name "Имя" --title "Титул" --role strategist --author grok --summary "Новый советник"
  node GMap/scripts/proposeCourtNpc.mjs --status
  node GMap/scripts/proposeCourtNpc.mjs --dry-run --faction faction_belator --name "Test" --title "T" --role agent --author gm --summary "draft"`);
}

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printUsage();
    return;
  }

  if (args.status) {
    const store = readStore();
    const pending = store.proposals.filter((p) => p.status === "pending").length;
    console.log(`pending-court.json: ${pending} pending / ${store.proposals.length} total`);
    return;
  }

  const proposal = buildProposal(args);

  if (args.dry_run) {
    console.log(JSON.stringify({ proposal, post: postBodyFromProposal(proposal) }, null, 2));
    return;
  }

  const store = readStore();
  store.proposals.push(proposal);
  writeStore(store);

  console.log(`queued ${proposal.id} → ${path.relative(process.cwd(), STORE_PATH)}`);
  console.log(`  npc: ${proposal.ops[0].npc.id} (${proposal.ops[0].npc.name})`);
  console.log(`  pending: ${store.proposals.filter((p) => p.status === "pending").length}`);
}

try {
  main();
} catch (err) {
  console.error(String(err.message || err));
  printUsage();
  process.exit(1);
}
