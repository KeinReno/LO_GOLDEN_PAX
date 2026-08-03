/**
 * One-shot: merge economy metadata (category/tier/properties/biome_tags/spread/toxic)
 * into content/core/map_resources.json. Keeps existing id/name/yield intact.
 * Idempotent: re-running overwrites metadata fields only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FILE = path.join(ROOT, "content/core/map_resources.json");

const META = {
  "железо":              { category: "A", tier: 1,  properties: ["strong"],            biome_tags: ["rocky","desert"] },
  "титан":               { category: "A", tier: 3,  properties: ["strong"],            biome_tags: ["rocky","mountainous"] },
  "кристаллы":           { category: "B", tier: 3,  properties: [],                    biome_tags: ["rocky","ice"] },
  "газ":                 { category: "B", tier: 2,  properties: [],                    biome_tags: ["gas_giant"] },
  "вода":                { category: "E", tier: 1,  properties: [],                    biome_tags: ["ocean","ice"] },
  "редкоземы":           { category: "A", tier: 3,  properties: [],                    biome_tags: ["mountainous"] },
  "антиматерия":         { category: "D", tier: 8,  properties: ["energy","anomaly"],  biome_tags: ["anomaly"] },
  "реликты":             { category: "F", tier: 9,  properties: ["info_store","anomaly"], biome_tags: ["artifact","ruin"] },
  "серебро":             { category: "B", tier: 5,  properties: [],                    biome_tags: ["mountainous"] },
  "золото":              { category: "B", tier: 5,  properties: [],                    biome_tags: ["mountainous","river"] },
  "стеклосталь":         { category: "A", tier: 4,  properties: ["strong"],             biome_tags: ["mountainous"] },
  "сплавы":              { category: "B", tier: 3,  properties: ["strong"],            biome_tags: [] },
  "хиноварь":            { category: "B", tier: 4,  properties: ["strong","malleable"],biome_tags: ["mountainous","volcanic"] },
  "биотопливо":          { category: "D", tier: 3,  properties: ["fuel"],               biome_tags: ["ocean","swamp"] },
  "блюматид":            { category: "B", tier: 4,  properties: ["strong","malleable","shield","accelerate"], biome_tags: ["volcanic","mountainous"] },
  "соларид":             { category: "D", tier: 5,  properties: ["fuel","energy","weapon_amp","shield"], biome_tags: ["star_near","desert"] },
  "крин":                { category: "C", tier: 4,  properties: [],                    biome_tags: ["mountainous"] },
  "стройплексы":         { category: "C", tier: 3,  properties: [],                    biome_tags: [] },
  "органическая биомасса":{ category: "E", tier: 2,  properties: [],                    biome_tags: ["ocean","swamp","forest"] },
  "пища":                { category: "E", tier: 3,  properties: [],                    biome_tags: ["ocean","forest","plains"] },
  "минералы":            { category: "B", tier: 1,  properties: [],                    biome_tags: ["rocky","desert"] },
  "энергия":             { category: "D", tier: 4,  properties: ["energy"],            biome_tags: [] },
  "торговое значение":   { category: null, tier: null, properties: [],                 biome_tags: [], note: "derived flow, not mined" },
  "лазуалин":            { category: "A", tier: 5,  properties: [],                    biome_tags: ["mountainous"] },
  "гипериум":            { category: "A", tier: 6,  properties: [],                    biome_tags: ["deep","anomaly"] },
  "эрадион":             { category: "A", tier: 6,  properties: [],                    biome_tags: ["deep"] },
  "талитин":             { category: "A", tier: 5,  properties: [],                    biome_tags: ["ice","mountainous"] },
  "экзотические газы":   { category: "D", tier: 4,  properties: ["fuel"],              biome_tags: ["gas_giant"] },
  "фокусирующие кристаллы":{ category: "B", tier: 4, properties: [],                    biome_tags: ["mountainous","ice"] },
  "летучие частицы":      { category: "B", tier: 4,  properties: [],                    biome_tags: ["volcanic","gas_giant"] },
  "элирий":              { category: "A", tier: 6,  properties: [],                    biome_tags: ["anomaly"] },
  "титаний":             { category: "A", tier: 6,  properties: ["strong"],            biome_tags: ["mountainous"] },
  "адамантий":           { category: "A", tier: 7,  properties: ["strong"],            biome_tags: ["deep","mountainous"] },
  "скаашиз":             { category: "A", tier: 7,  properties: ["strong"],            biome_tags: ["volcanic"] },
  "клакс":               { category: "B", tier: 10, properties: ["anomaly"],           biome_tags: ["anomaly","artifact"] },
  "гидромель":           { category: "E", tier: 8,  properties: [],                    biome_tags: ["ocean","anomaly"] },
  "орхидия":             { category: "B", tier: 7,  properties: [],                    biome_tags: ["forest","anomaly"] },
  "тёмный рог":          { category: "B", tier: 7,  properties: ["strong"],             biome_tags: ["deep","anomaly"] },
  "красный санг":        { category: "B", tier: 7,  properties: [],                    biome_tags: ["volcanic","anomaly"] },
  "песенный шёлк":       { category: "B", tier: 7,  properties: [],                    biome_tags: ["forest","anomaly"] },
  "корень дракона":      { category: "E", tier: 7,  properties: [],                    biome_tags: ["forest","volcanic"] },
  "кристальная шляпка":  { category: "E", tier: 7,  properties: [],                    biome_tags: ["forest","anomaly"] },
  "ихор левиафана":      { category: "A", tier: 9,  properties: [],                    biome_tags: ["ocean","leviathan"] },
  "золотой коралл":      { category: "A", tier: 9,  properties: ["strong"],            biome_tags: ["ocean","deep"] },
  "солариевая вода":     { category: "E", tier: 8,  properties: [],                    biome_tags: ["ocean","star_near"] },
  "иссридил":            { category: "B", tier: 8,  properties: [],                    biome_tags: ["anomaly","artifact"] },
  "грёзный туман":       { category: "F", tier: 8,  properties: ["psion_emit"],         biome_tags: ["nebula","anomaly"] },
  "архит":               { category: "B", tier: 8,  properties: [],                    biome_tags: ["anomaly"] },
  "злобная кора":        { category: "E", tier: 7,  properties: [],                    biome_tags: ["forest","volcanic"] },
  "лунные жилы":         { category: "F", tier: 6,  properties: [],                    biome_tags: ["ice","moon"] },
  "малые артефакты":     { category: "F", tier: 5,  properties: ["info_store"],         biome_tags: ["artifact","ruin"] },
  "астральные нити":     { category: "F", tier: 6,  properties: ["psion_emit"],        biome_tags: ["anomaly","nebula"] },
  "гринид":              { category: "F", tier: 7,  properties: ["psion_store","psion_emit","info_store"], biome_tags: ["anomaly","artifact"] },
  "рэдид":               { category: "D", tier: 6,  properties: ["toxic","self_spreading","fuel","energy","weapon_amp","shield"], biome_tags: ["volcanic","toxic"], toxic: true },
  "блакула":             { category: "F", tier: 8,  properties: ["matter_destroy","weapon","anomaly"], biome_tags: ["black_hole","anomaly"] },
  "вайтид":              { category: "F", tier: 8,  properties: ["psion_suppress","psion_emit","corridor_open","weapon"], biome_tags: ["anomaly","white_corridor"] },
  "виолид":              { category: "D", tier: 7,  properties: ["toxic","self_spreading","fuel","weapon"], biome_tags: ["toxic","volcanic"], toxic: true },
  "зро":                 { category: "D", tier: 7,  properties: ["psion_emit","energy"], biome_tags: ["anomaly","deep"] },
  "тёмная материя":      { category: "A", tier: 10, properties: ["anomaly"],            biome_tags: ["black_hole","deep"] },
  "живой металл":        { category: "C", tier: 7,  properties: ["strong"],           biome_tags: ["anomaly","artifact"] },
  "наниты":              { category: "C", tier: 7,  properties: [],                    biome_tags: ["anomaly","artifact"] },
  "тугоплавкие минералы":{ category: "A", tier: 2,  properties: ["strong"],             biome_tags: ["volcanic"] },
  "редкие кристаллы":    { category: "B", tier: 6,  properties: [],                    biome_tags: ["mountainous","ice"] },
  "водород":             { category: "D", tier: 1,  properties: ["fuel"],              biome_tags: ["gas_giant","ice"] },
  "лёд":                 { category: "D", tier: 1,  properties: [],                    biome_tags: ["ice"] },
  "аммиак":              { category: "E", tier: 1,  properties: [],                    biome_tags: ["ice","gas_giant"] },
  "изотопы":             { category: "D", tier: 5,  properties: ["energy"],           biome_tags: ["radioactive"] },
  "никель":              { category: "A", tier: 1,  properties: ["strong"],            biome_tags: ["rocky"] },
  "кобальт":             { category: "A", tier: 1,  properties: ["strong"],            biome_tags: ["rocky"] },
  "метан":               { category: "D", tier: 2,  properties: ["fuel"],              biome_tags: ["gas_giant","swamp"] },
  "гелий-3":             { category: "D", tier: 5,  properties: ["fuel","energy"],     biome_tags: ["gas_giant","moon"] },
  "токсичные газы":      { category: "D", tier: 2,  properties: ["toxic"],             biome_tags: ["toxic","volcanic"], toxic: true },
  "катализаторы":        { category: "B", tier: 2,  properties: [],                    biome_tags: ["mountainous"] },
  "плазмо-кристаллы":    { category: "B", tier: 6,  properties: [],                    biome_tags: ["volcanic","anomaly"] },
  "вулканические минералы":{ category: "A", tier: 2, properties: ["strong"],            biome_tags: ["volcanic"] },
  "лекарственные соединения":{ category: "E", tier: 4, properties: [],                  biome_tags: ["forest","ocean"] },
  "аномальные кристаллы":{ category: "B", tier: 6,  properties: ["anomaly"],           biome_tags: ["anomaly"] },
  "биокатализаторы":     { category: "E", tier: 5,  properties: [],                    biome_tags: ["forest","ocean"] },
  "экстремофильные ферменты":{ category: "E", tier: 6, properties: [],                  biome_tags: ["volcanic","ice","toxic"] },
  "замёрзшие топлива":   { category: "D", tier: 3,  properties: ["fuel"],              biome_tags: ["ice"] },
  "энергетические минералы":{ category: "A", tier: 5, properties: ["energy"],           biome_tags: ["mountainous","volcanic"] },
  "магнетиты":           { category: "A", tier: 2,  properties: [],                    biome_tags: ["mountainous"] },
  "платина":             { category: "B", tier: 5,  properties: [],                    biome_tags: ["mountainous"] },
  "кибер-минералы":      { category: "C", tier: 6,  properties: [],                    biome_tags: ["anomaly","artifact"] },
  "замёрзшие газы":      { category: "D", tier: 2,  properties: ["fuel"],               biome_tags: ["ice","gas_giant"] },
  "плазмоиды":           { category: "D", tier: 6,  properties: ["weapon_amp"],        biome_tags: ["star_near","anomaly"] },
};

const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
let touched = 0;
let missing = [];

for (const [id, def] of Object.entries(data)) {
  const m = META[def.name];
  if (!m) { missing.push(def.name); continue; }
  def.category = m.category;
  def.tier = m.tier;
  def.properties = m.properties;
  def.biome_tags = m.biome_tags;
  def.spread = { self_spreading: !!(m.properties || []).includes("self_spreading") };
  def.toxic = !!m.toxic;
  if (m.note) def.note = m.note;
  touched++;
}

fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log("Remapped", touched, "/", Object.keys(data).length, "resources");
if (missing.length) console.log("MISSING metadata for:", missing);
else console.log("All resources have metadata.");
