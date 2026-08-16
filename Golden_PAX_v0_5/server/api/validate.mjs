import { z } from "zod";

/**
 * Parse req.body against `schema`, or write a 400 and return null.
 * Every route should call this instead of hand-rolling safeParse+400 —
 * this was copy-pasted verbatim across all 7 route files before.
 */
export function parseBody(schema, req, res) {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", issues: z.treeifyError(parsed.error) });
    return null;
  }
  return parsed.data;
}
