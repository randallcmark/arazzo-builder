/**
 * Fork-level product configuration.
 *
 * Keep identity, default fixtures, and browser-storage names here so a fork
 * does not need to modify workspace behavior to become its own application.
 */
export const siteConfig = {
  productName: "Arazzo Loom",
  tagline: "Map the way your APIs work.",
  description:
    "A local-first workspace for exploring, editing, and extending Arazzo API workflows.",
  defaultDocumentName: "deel-arazzo.yml",
  defaultDocumentUrl: "/workflows/deel-arazzo.yml",
  storageNamespace: "arazzo-loom",
  draftStorageKey: "arazzo-loom:deel-draft",
} as const;
