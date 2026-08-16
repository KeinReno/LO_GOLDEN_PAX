import { describe, expect, it } from "vitest";
import express from "express";
import { getContent } from "../contentLoader.mjs";
import { resolveMasterToken } from "./auth.mjs";
import { tableCatalogFromContent } from "./tableCatalog.mjs";
import { contentRouter } from "./routes/content.mjs";
import { TableCatalogResponseSchema } from "./contract/content.mjs";

describe("tableCatalogFromContent", () => {
  const catalog = tableCatalogFromContent(getContent());

  it("includes real building.mine and unit.militia from content JSON", () => {
    expect(catalog.buildings.some((b) => b.id === "building.mine")).toBe(true);
    expect(catalog.units.some((u) => u.id === "unit.militia")).toBe(true);
    expect(catalog.ships.some((s) => s.id === "ship.scout")).toBe(true);
  });

  it("does not dump the technologies map", () => {
    expect(catalog).not.toHaveProperty("technologies");
    const parsed = TableCatalogResponseSchema.parse(catalog);
    expect(Object.keys(parsed).sort()).toEqual(
      ["buildings", "currencies", "ships", "taxes", "units"].sort(),
    );
    expect(parsed.buildings[0]).not.toHaveProperty("effects");
    expect(parsed.buildings[0]).not.toHaveProperty("slots");
    const blob = JSON.stringify(parsed);
    expect(blob).not.toMatch(/"technologies"/);
    expect(blob.length).toBeLessThan(200_000);
  });

  it("exposes tax slot labels for EconomyRoom", () => {
    expect(catalog.taxes["tax.materia"]?.tiers?.some((t) => t.id === "low")).toBe(true);
  });
});

describe("GET /api/content/table", () => {
  async function listen() {
    const app = express();
    app.use("/api", contentRouter());
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address();
    return { server, base: `http://127.0.0.1:${port}` };
  }

  it("401 without a token; 200 with master token", async () => {
    const { server, base } = await listen();
    try {
      const anon = await fetch(`${base}/api/content/table`);
      expect(anon.status).toBe(401);

      const token = resolveMasterToken().token;
      const ok = await fetch(`${base}/api/content/table`, {
        headers: { "x-master-token": token },
      });
      expect(ok.status).toBe(200);
      const body = await ok.json();
      expect(body.buildings.some((b) => b.id === "building.mine")).toBe(true);
      expect(body.units.some((u) => u.id === "unit.militia")).toBe(true);
      expect(body).not.toHaveProperty("technologies");
    } finally {
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
