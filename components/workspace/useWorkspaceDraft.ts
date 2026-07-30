import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { siteConfig } from "@/config/site";
import { parseArazzo } from "@/lib/arazzo";
import { loadCataloguesForSpec } from "@/lib/api-catalogues";
import type { ApiCatalogue } from "@/lib/openapi";
import {
  decodeStoredWorkspace,
  encodeStoredWorkspace,
} from "@/lib/workspace-storage";

export function useWorkspaceDraft({
  source,
  resetSource,
  onStatus,
}: {
  source: string;
  resetSource: (source: string) => void;
  onStatus: Dispatch<SetStateAction<string>>;
}) {
  const [baseline, setBaseline] = useState("");
  const [workspaceName, setWorkspaceName] = useState<string>(
    siteConfig.defaultDocumentName,
  );
  const [catalogues, setCatalogues] = useState<ApiCatalogue[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    const load = async () => {
      const documentResponse = await fetch(siteConfig.defaultDocumentUrl);
      if (!documentResponse.ok) {
        throw new Error("The published workflow could not be loaded.");
      }
      const publishedSource = await documentResponse.text();
      setBaseline(publishedSource);

      const savedDraft =
        window.localStorage.getItem(siteConfig.draftStorageKey) ??
        siteConfig.legacyDraftStorageKeys
          .map((key) => window.localStorage.getItem(key))
          .find((value) => value !== null) ??
        null;
      let initialSource = publishedSource;
      let savedCatalogues: ApiCatalogue[] | undefined;
      if (savedDraft) {
        const savedWorkspace = decodeStoredWorkspace(savedDraft);
        initialSource = savedWorkspace.source;
        savedCatalogues = savedWorkspace.catalogues;
        setBaseline(savedWorkspace.baseline);
        setWorkspaceName(savedWorkspace.name);
        onStatus("Local draft restored");
      } else {
        onStatus("Published baseline");
      }
      resetSource(initialSource);

      if (savedCatalogues?.length) {
        setCatalogues(savedCatalogues);
      } else {
        const initialSpec = parseArazzo(initialSource).spec;
        if (initialSpec) {
          setCatalogues(await loadCataloguesForSpec(initialSpec));
        }
      }
      loaded.current = true;
    };
    load().catch((error) => {
      onStatus(
        error instanceof Error ? error.message : "Unable to load workspace.",
      );
    });
  }, [onStatus, resetSource]);

  useEffect(() => {
    if (!loaded.current || !source) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          siteConfig.draftStorageKey,
          encodeStoredWorkspace({
            source,
            baseline,
            name: workspaceName,
            catalogues,
          }),
        );
        onStatus(
          source === baseline ? "Workspace baseline" : "Draft saved locally",
        );
      } catch {
        onStatus("This workspace is too large for browser-local draft storage");
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [source, baseline, workspaceName, catalogues, onStatus]);

  return {
    baseline,
    setBaseline,
    workspaceName,
    setWorkspaceName,
    catalogues,
    setCatalogues,
  };
}
