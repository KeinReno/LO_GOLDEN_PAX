/** Bridge so Toolbar can export via Pixi extract (WebGL canvas.toDataURL is often black). */

type MapPngExporter = () => Promise<string | null> | string | null;

let exporter: MapPngExporter | null = null;

export function registerMapPngExporter(fn: MapPngExporter | null): void {
  exporter = fn;
}

export async function captureMapPngDataUrl(): Promise<string | null> {
  if (exporter) {
    try {
      const url = await exporter();
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
