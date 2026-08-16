import { useEffect, useState } from "react";
import { fetchContent } from "../../state/contentCatalog";
import {
  catalogsFromContent,
  emptyViewerPlayCatalogs,
  type ViewerPlayCatalogs,
} from "./viewerContentCatalogs";

export function useViewerContentCatalogs(): ViewerPlayCatalogs {
  const [catalogs, setCatalogs] = useState(emptyViewerPlayCatalogs);
  useEffect(() => {
    void fetchContent().then((c) => {
      const patch = catalogsFromContent(c);
      if (!patch) return;
      setCatalogs((prev) => ({ ...prev, ...patch }));
    });
  }, []);
  return catalogs;
}
