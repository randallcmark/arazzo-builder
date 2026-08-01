# Architecture and trust boundaries

This document describes the application as it exists in the repository. It is
intended to let a reviewer assess the implementation without relying on design
conversations or undocumented assumptions.

## System shape

Arazzo Builder is a stateless Next.js application. The server supplies static
application assets and starter files; document work happens in the browser.

```text
Git repository
  ├─ public/workflows/deel-arazzo.yml  published baseline
  ├─ public/openapi/deel-openapi.json  starter API description
  └─ Next.js application
          ↓
Browser workspace
  ├─ YAML source of truth
  ├─ parsed Arazzo model
  ├─ Graph / Sequence / Docs / YAML projections
  ├─ visual workflow builder
  ├─ browser-local draft and layout
  └─ downloaded YAML export
```

There is no application database, authentication layer, server-side document
mutation, or shared draft store.

## Important invariants

1. The YAML source string is the document source of truth.
2. Graph, Sequence, Docs, and YAML are coordinated projections of that source.
3. Viewer selection may change shared UI state but must not change execution
   order or presentation layout.
4. Workflow creation and execution reordering belong to the builder.
5. Structured mutations use the YAML syntax tree in `lib/arazzo.ts`; they must
   not rebuild the complete document from parsed JavaScript objects.
6. Graph coordinates are browser-local unless the user explicitly enables the
   `x-arazzo-builder-layout` extension.
7. Browser draft failure must not prevent importing, viewing, editing, or
   exporting the current in-memory document.

## Code map

- `config/site.ts` — fork-level product identity, default fixture, and storage
  namespace.
- `app/` — routes, metadata, and global visual system.
- `components/workspace/Workspace.tsx` — workspace coordination and view state.
- `components/workspace/AddWorkflowDialog.tsx` — visual workflow composer.
- `components/workspace/YamlWorkspacePanel.tsx` — Monaco and the API reference
  and diagnostics side panel.
- `components/workspace/useDocumentHistory.ts` — exact-source undo and redo.
- `components/workspace/useDialogFocus.ts` — shared modal focus lifecycle.
- `components/workspace/useWorkspaceDraft.ts` — published baseline loading,
  browser-local draft restoration, and autosave.
- `lib/arazzo.ts` — parsing, diagnostics, source-preserving mutations, and YAML
  range mapping.
- `lib/api-catalogues.ts` — trusted catalogue loading and unresolved Arazzo
  operation fallbacks.
- `lib/openapi.ts` — OpenAPI parsing and operation catalogue construction.
- `lib/workflow-graph.ts` — read-only graph projection of Arazzo semantics.
- `lib/sequence.ts` — honest Sequence participants, normalized call details,
  and portable Mermaid export.
- `lib/workflow-layout.ts` — local and optional embedded presentation layout.
- `lib/workspace-storage.ts` — version-tolerant browser draft serialization.

## Trust boundaries

### Imported Arazzo and OpenAPI files

Files are user-supplied and must be treated as untrusted data. Browser file
imports are limited to 5 MB. YAML is parsed as data; the application does not
evaluate document content as JavaScript.

The built-in diagnostics intentionally cover a useful structural subset. They
are not a complete Arazzo conformance validator.

### Remote OpenAPI URLs

The browser fetches a cross-origin URL only when the user explicitly enters it
in the API source dialog. Relative and same-origin source descriptions may be
loaded automatically. Importing an Arazzo document does not automatically
request its cross-origin source URLs; operation IDs referenced by that document
remain available as an unresolved fallback catalogue.

Remote requests are subject to the destination's CORS policy. The application
does not proxy the request, attach server credentials, or bypass browser
network controls.

### Sequence and Mermaid output

The in-application Sequence diagram is rendered as React DOM from the same
normalized call model used by the call log. It does not execute Mermaid or
insert generated SVG. Mermaid is a text-only clipboard export for developers
who want to render the sequence in another trusted tool.

### Browser storage

Drafts and canvas coordinates use `localStorage` under the namespace declared
in `config/site.ts`. They are scoped to the browser origin and device, are not
shared with other users, and can be removed by browser storage controls. Legacy
`arazzo-loom` keys are read only to migrate drafts and layouts created before
the public name was aligned with the repository.

### Export

Export creates a browser download from the current source string. It does not
write to the server or the checked-out Git repository.

## Custom extension

`x-arazzo-builder-layout` is optional workflow metadata:

```yaml
x-arazzo-builder-layout:
  version: 1
  nodes:
    input: { x: 40, y: 165 }
    find-worker: { x: 310, y: 110 }
```

It affects presentation only. It must never be interpreted as execution order.
Documents containing the former `x-loom-layout` key remain readable during the
rename transition. New mutations write only `x-arazzo-builder-layout`.

## Deliberate limitations

- No shared or durable server-side persistence.
- No user accounts or authorization model.
- No complete Arazzo JSON Schema validation.
- Remote OpenAPI loading depends on browser CORS permission.
- Browser-local drafts do not follow a user to another device or origin.
