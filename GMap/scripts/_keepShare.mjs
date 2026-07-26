import { startPlayerShare, stopPlayerShare } from "../server/playerShare.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

stopPlayerShare();
const s = await startPlayerShare({ prefer: "cloudpub", force: true, localPort: 4173 });
const dir = path.join(ROOT, "tmp");
fs.mkdirSync(dir, { recursive: true });
const viewUrl = s.viewUrl || (s.publicUrl ? `${s.publicUrl}/view` : "");
fs.writeFileSync(path.join(dir, "player-url.txt"), `${viewUrl}\n`, "utf8");
fs.writeFileSync(path.join(dir, "player-session.json"), JSON.stringify(s, null, 2), "utf8");
console.log("READY", viewUrl);
console.log(JSON.stringify(s));

// Keep Node + clo child alive
setInterval(() => {}, 1 << 30);
