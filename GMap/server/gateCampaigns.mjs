import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "content", "core", "gate_campaigns.json");
const ART_DIR = path.join(ROOT, "public", "campaigns", "art");

export const GATE_CAMPAIGN_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_ART_BYTES = 3.5 * 1024 * 1024;

const FALLBACK = {
  campaigns: [
    {
      id: "silver_hearts",
      title: "Silver Hearts Part IV",
      kicker: "Скоро",
      blurb:
        "Старые герои соберутся вновь, чтобы завершить историю, длящуюся 8 лет.",
      live: false,
      image: "",
    },
    {
      id: "golden_pax",
      title: "Golden Pax",
      kicker: "Campaign",
      blurb: "Галактика Оберона: карта, державы, наука и сцена.",
      live: true,
      image: "/campaigns/art/golden-pax.png",
    },
    {
      id: "final_crusade",
      title: "The Final Crusade",
      kicker: "Скоро",
      blurb:
        "Это локальная история о последнем подвиге Адмирала Руффо, погружающегося всё глубже в пучины просторов, куда никогда не входили люди. Объединяйтесь, жертвуйте, молитесь, чтобы найти то, что даст ключ к пониманию природы Обливиона.",
      live: false,
      image: "",
    },
  ],
};

function pickStr(src, base, key, fallback = "") {
  const fromSrc = src?.[key];
  if (fromSrc != null && String(fromSrc).trim()) return String(fromSrc).trim();
  const fromBase = base?.[key];
  if (fromBase != null && String(fromBase).trim()) return String(fromBase).trim();
  return fallback;
}

function asCampaign(raw, fallback) {
  const src = raw && typeof raw === "object" ? raw : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const id = String(src.id || base.id || "")
    .trim()
    .toLowerCase();
  return {
    id,
    title: pickStr(src, base, "title", id),
    kicker: pickStr(src, base, "kicker"),
    blurb: pickStr(src, base, "blurb"),
    live: Object.prototype.hasOwnProperty.call(src, "live")
      ? Boolean(src.live)
      : Boolean(base.live),
    image: pickStr(src, base, "image"),
  };
}

export function normalizeGateCampaigns(raw) {
  const incoming = Array.isArray(raw?.campaigns) ? raw.campaigns : [];
  const byId = new Map();
  for (const row of incoming) {
    const id = String(row?.id || "")
      .trim()
      .toLowerCase();
    if (!GATE_CAMPAIGN_ID_RE.test(id)) continue;
    byId.set(id, row);
  }
  const ordered = FALLBACK.campaigns.map((def) =>
    asCampaign(byId.get(def.id), def),
  );
  for (const extra of byId.values()) {
    const id = String(extra?.id || "")
      .trim()
      .toLowerCase();
    if (!ordered.some((row) => row.id === id)) {
      ordered.push(asCampaign(extra, { id }));
    }
  }
  return { campaigns: ordered };
}

export function readGateCampaigns() {
  try {
    const text = fs.readFileSync(FILE, "utf8");
    return normalizeGateCampaigns(JSON.parse(text));
  } catch {
    return structuredClone(FALLBACK);
  }
}

export function writeGateCampaigns(raw) {
  const next = normalizeGateCampaigns(raw);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function patchGateCampaign(id, patch) {
  const cid = String(id || "").trim().toLowerCase();
  if (!GATE_CAMPAIGN_ID_RE.test(cid)) {
    return { ok: false, error: "Некорректный id кампании" };
  }
  const doc = readGateCampaigns();
  const idx = doc.campaigns.findIndex((c) => c.id === cid);
  if (idx < 0) return { ok: false, error: "Кампания не найдена" };
  const cur = doc.campaigns[idx];
  doc.campaigns[idx] = asCampaign(
    {
      ...cur,
      ...(patch && typeof patch === "object" ? patch : {}),
      id: cur.id,
      live: patch?.live == null ? cur.live : Boolean(patch.live),
    },
    cur,
  );
  return { ok: true, ...writeGateCampaigns(doc) };
}

const MIME_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function saveGateCampaignArt(id, { mime, data }) {
  const cid = String(id || "").trim().toLowerCase();
  if (!GATE_CAMPAIGN_ID_RE.test(cid)) {
    return { ok: false, error: "Некорректный id кампании" };
  }
  const ext = MIME_EXT[String(mime || "").toLowerCase()];
  if (!ext) return { ok: false, error: "Нужен PNG, JPEG или WebP" };
  const b64 = String(data || "").replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
  let buf;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return { ok: false, error: "Не удалось прочитать файл" };
  }
  if (!buf.length || buf.length > MAX_ART_BYTES) {
    return { ok: false, error: "Файл пуст или больше 3.5 МБ" };
  }
  fs.mkdirSync(ART_DIR, { recursive: true });
  const filename = `${cid}.${ext}`;
  fs.writeFileSync(path.join(ART_DIR, filename), buf);
  const image = `/campaigns/art/${filename}?v=${Date.now()}`;
  return patchGateCampaign(cid, { image });
}
