# Arazzo Builder

A local-first Next.js workspace for exploring, editing, and extending Arazzo
API workflow documents.

## What it does

- Opens `public/workflows/deel-arazzo.yml` as the published baseline, or imports
  an existing Arazzo YAML/JSON file by picker or drag-and-drop.
- Restores the active file, its reset baseline, and browser-local draft when one
  exists.
- Shows inspection-first Flow, top-down Chart, and developer-facing Sequence
  projections alongside documentation and YAML views. Resolved operations expose
  their OpenAPI request contract, responses, security, and server details while
  Arazzo bindings show how inputs and captured outputs move between calls.
- Frames Sequence calls between a generic initiator, integrating application,
  and resolved API targets. The initiator/client boundary is explicitly labelled
  as visualization context because Arazzo declares calls and dependencies, not
  user-interface actors or internal service behavior.
- Builds and inserts workflows by dragging or clicking OpenAPI operations onto
  a flow canvas, then refining the selected step in an inspector.
- Connects named OpenAPI sources from a URL or local YAML/JSON file, enumerates
  their `operationId` values, and writes the source into the Arazzo
  `sourceDescriptions` collection.
- Loads relative and same-origin source descriptions automatically; imported
  cross-origin URLs require an explicit action in the API source dialog.
- Resolves source-qualified workflow operations back to their API, method, path,
  and summary in both the visual workflow inspector and YAML reference browser.
- Keeps freeform Flow card positions in browser-local presentation state while
  execution order remains explicit in the Arazzo `steps` sequence.
- Shares step selection across Flow, Chart, and Sequence; links can be selected
  in Flow and Chart to inspect their routes, conditions, and retry semantics.
- Keeps structural editing and execution reordering in the dedicated visual
  workflow builder.
- Keeps long sequence diagrams at a readable scale with pan, zoom, fit, and
  reset controls.
- Synchronizes selected workflow steps with their YAML source range and maps
  YAML cursor positions back to steps.
- Provides document-level undo and redo while preserving the exact YAML source,
  including comments.
- Keeps Flow coordinates browser-local unless the user explicitly embeds the
  portable `x-arazzo-builder-layout` workflow extension.
- Validates core Arazzo structure and cross-step `goto` references.
- Exports the current document without requiring server-side storage.

The bundled workflow and compact OpenAPI catalogue are starter fixtures. Replace
them with the generator output and source OpenAPI document when those files are
available.

## Run locally

Use Node.js 20.17 or newer and npm 11.16 or newer. The repository pins its
reviewed npm release in `package.json`.

```bash
nvm use
npm install --global npm@11.17.0
cp .env.example .env.local
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Validate

```bash
npm run check
```

GitHub Actions runs the same locked install and validation command for pushes
to `main` and for pull requests. The install fails when a dependency introduces
an unreviewed lifecycle script. New dependency resolution also enforces a
two-day minimum package age; see `docs/development.md` for the update policy.

## Customize a fork

Product identity, default fixture paths, and browser-storage keys live in
`config/site.ts`. Design tokens live in `app/globals.css`. Replace the starter
files under `public/workflows/` and `public/openapi/` only after reviewing their
source and redistribution terms.

See:

- `docs/architecture.md` for data flow, invariants, trust boundaries, and known
  limitations.
- `docs/development.md` for customization, validation, and deployment.
- `docs/review-checklist.md` for an evidence-only independent review.
- `docs/provenance.md` for the clean-room implementation boundary.
- `SECURITY.md` for the explicit security and data-handling model.

## Deployment model

The application is stateless and deploys as a standard Next.js application.
GitHub supplies the published baseline; browser storage owns personal drafts.
Set `NEXT_PUBLIC_SITE_URL` to the production origin so social metadata uses the
correct absolute URL.

The built-in diagnostics validate a useful structural subset of Arazzo. They
are not presented as a complete specification-conformance validator.

## Licensing and provenance

Repository-owned code is MIT licensed. See `THIRD_PARTY_NOTICES.md` and
`docs/provenance.md` for dependency notices and the clean-room implementation
boundary.
