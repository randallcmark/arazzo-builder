# Arazzo Loom

A local-first Next.js workspace for exploring, editing, and extending Arazzo
API workflow documents.

## What it does

- Opens `public/workflows/deel-arazzo.yml` as the published baseline, or imports
  an existing Arazzo YAML/JSON file by picker or drag-and-drop.
- Restores the active file, its reset baseline, and browser-local draft when one
  exists.
- Shows interactive flow, Mermaid flowchart, sequence, documentation, and YAML
  views.
- Builds and inserts workflows by dragging or clicking OpenAPI operations onto
  a flow canvas, then refining the selected step in an inspector.
- Connects named OpenAPI sources from a URL or local YAML/JSON file, enumerates
  their `operationId` values, and writes the source into the Arazzo
  `sourceDescriptions` collection.
- Resolves source-qualified workflow operations back to their API, method, path,
  and summary in both the visual workflow inspector and YAML reference browser.
- Validates core Arazzo structure and cross-step `goto` references.
- Exports the current document without requiring server-side storage.

The bundled workflow and compact OpenAPI catalogue are starter fixtures. Replace
them with the generator output and source OpenAPI document when those files are
available.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validate

```bash
npm test
npm run lint
npm run build
```

## Deployment model

The application is stateless and deploys as a standard Next.js application.
GitHub supplies the published baseline; browser storage owns personal drafts.
Set `NEXT_PUBLIC_SITE_URL` to the production origin so social metadata uses the
correct absolute URL.

## Licensing and provenance

Repository-owned code is MIT licensed. See `THIRD_PARTY_NOTICES.md` and
`docs/provenance.md` for dependency notices and the clean-room implementation
boundary.
