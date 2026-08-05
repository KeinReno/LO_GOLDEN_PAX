/** Bridge so Toolbar can export via Pixi extract (WebGL canvas.toDataURL is often black). */

export type MapPngExportScope = "viewport" | "playerVisible";

export type MapPngExportOptions = {
  /** viewport = current canvas; playerVisible = fit + slice for one faction */
  scope?: MapPngExportScope;
  factionId?: string | null;
};

type MapPngExporter = (
  opts?: MapPngExportOptions,
) => Promise<string | null> | string | null;

let exporter: MapPngExporter | null = null;

export function registerMapPngExporter(fn: MapPngExporter | null): void {
  exporter = fn;
}

export async function captureMapPngDataUrl(
  opts?: MapPngExportOptions,
): Promise<string | null> {
  if (exporter) {
    try {
      const url = await exporter(opts);
      if (url) return url;
    } catch (err) {
      console.warn("[GMap] Pixi PNG extract failed", err);
    }
  }
  const host = document.querySelector(".map-host");
  const canvas = host?.querySelector("canvas");
  if (!canvas) return null;
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
