import { Router } from "express";

export function healthRouter() {
  const router = Router();
  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "golden-pax", time: new Date().toISOString() });
  });
  return router;
}
