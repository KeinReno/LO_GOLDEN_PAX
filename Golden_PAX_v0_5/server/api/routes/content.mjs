import { Router } from "express";
import { getContent } from "../../contentLoader.mjs";
import { requireLoggedIn } from "../auth.mjs";
import { TableCatalogResponseSchema } from "../contract/content.mjs";
import { tableCatalogFromContent } from "../tableCatalog.mjs";

/** Authenticated read of verb catalog (buildings/units/ships/taxes). No technologies dump. */
export function contentRouter() {
  const router = Router();

  router.get("/content/table", (req, res) => {
    if (!requireLoggedIn(req, res)) return;
    const catalog = tableCatalogFromContent(getContent());
    res.json(TableCatalogResponseSchema.parse(catalog));
  });

  return router;
}
