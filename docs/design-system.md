# Workspace design system

This document is the maintainable source of truth for the Arazzo Builder
workspace visual language and interaction model. It was adapted from the
maintainer-supplied **Arazzo Workspace Design System** reference artifact during
the Graph and Sequence redesign.

The design system describes both implemented rules and intended product
direction. A rule marked **target** must not be represented as existing
behaviour in user documentation until it has been implemented and tested.

## Design principles

1. **The Arazzo document remains the source of truth.** Visual views explain
   the document; they do not silently invent workflow semantics.
2. **Each view answers a distinct question.** Graph explains shape and data
   flow, Sequence explains ordered exchanges, Docs explains in prose, and YAML
   exposes the exact source.
3. **Selection is shared presentation state.** Selecting a step or connection
   must not alter the document, execution order, zoom, or node positions.
4. **API contracts and workflow bindings belong together.** A developer should
   be able to compare what OpenAPI declares with what an Arazzo step sends.
5. **Progressive disclosure beats density.** The canvas communicates structure;
   the inspector and call log hold the complete detail.
6. **Do not infer actors.** Arazzo describes workflow calls and dependencies,
   not an end user, browser, integrating application, or internal service
   implementation unless one is explicitly represented in the document.

## Foundations

### Colour

The canonical CSS variables live at the top of `app/globals.css`. Components
must consume tokens rather than redeclare these values in component CSS.

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#20204b` | Primary text and node titles |
| `--ink-soft` | `#626285` | Secondary text, metadata, and inactive controls |
| `--forest` | `#5b68f6` | Primary actions, active tabs, selection, and data-flow edges |
| `--forest-2` | `#7454e8` | Eyebrows, secondary accents, and request arrows |
| `--paper` | `#f6f5ff` | Application background and inactive tracks |
| `--paper-deep` | `#ece9fb` | Canvas surround and sunken wells |
| `--cream` | `#ffffff` | Cards, rails, dialogs, and controls |
| `--mint` | `#e7e5ff` | Input/output nodes, chips, and activation bars |
| `--mint-2` | `#beb8f8` | Secondary edges and minimap nodes |
| `--orange` | `#ffd447` | Step identity rail and step index |
| `--orange-soft` | `#fff0a6` | Warning badges and text selection |
| `--red` | `#c4486b` | Errors and destructive meaning only |
| `--line` | `rgba(32,32,75,.11)` | Structural dividers |
| `--line-strong` | `rgba(32,32,75,.22)` | Inputs and dashed separators |

The historical names `forest`, `mint`, and `orange` no longer describe the
violet-and-amber palette accurately. Renaming them is deferred because it is a
large mechanical change. New semantic tokens should describe their role, such
as the existing method, status, and surface tokens.

HTTP methods use shared semantic colours:

| Meaning | Foreground/fill |
| --- | --- |
| GET | `--method-get` (`#4167d8`) |
| POST | `--method-post` (`#168163`) |
| PUT/PATCH | `--method-write` (`#8a6b00`) |
| DELETE | `--red` |
| 2xx status | `--status-success` on `--status-success-bg` |
| 4xx/5xx status | `--red` on `--status-error-bg` |

Method labels use white text, a 7px radius, uppercase mono text, and a minimum
10px font size.

### Typography

| Role | Family | Size / weight | Rule |
| --- | --- | --- | --- |
| Brand | `--font-display` | 16px / 800 | Header identity only |
| Body | `--font-sans` | 13px / 400 | Descriptions and prose at 1.6 line height |
| UI label | `--font-sans` | 12px / 650 | Tabs, buttons, and compact controls |
| Eyebrow | `--font-mono` | 11px / 400 | Uppercase, `.12em` tracking, accent colour |
| Section label | `--font-mono` | 10px / 400 | Uppercase, `.08em` tracking, soft ink |
| Code and values | `--font-mono` | 10–12px | Paths, IDs, expressions, and schemas |

No functional text in the workspace may render below 10px. Long runtime
expressions wrap or scroll within their own region; they do not force a rail or
canvas wider.

### Spacing, shape, and elevation

- Spacing scale: `4 · 6 · 9 · 12 · 18 · 24 · 32px`.
- Gaps inside cards use 6–12px; gaps between cards use 12–18px; panel padding is
  normally 18px.
- Radius scale: 8px for code and badges, 10–12px for wells and inputs, 14px for
  list items, 17px for canvas nodes, and 999px for pills.
- Use `--line` for structure and `--line-strong` for input boundaries. Do not
  stack both borders on the same edge.
- Elevation 1: `0 5px 16px rgba(67,54,154,.06)` for list items and inputs.
- Elevation 2: `0 10px 26px rgba(67,54,154,.12)` for nodes and floating tools.
- Elevation 3: `0 12px 32px rgba(67,54,154,.14)` for selection and popovers.
- Modal elevation uses `--shadow`.
- Every node canvas uses the same 24px violet dot grid.

## Workspace shell

The desktop workspace has four structural regions. Only the canvas flexes.

| Region | Size | Contents and behaviour |
| --- | --- | --- |
| Header | 66px | Brand, document identity, document actions, import/export, and workflow creation |
| Sidebar | 264px | Workflow list and active workflow context |
| Toolbar | 50px | View tabs, view-specific modes, view actions, and workflow identity |
| Inspector rail | 400px | Persistent selected-step or selected-connection detail |

The canvas always has `min-width: 0` and owns its overflow. On desktop, the
inspector is a reserved column even when nothing is selected, preventing a
selection from reflowing the graph under the pointer. Its empty state invites
the user to select a step.

Below 1040px the inspector becomes a right-hand slide-over when there is a
selection. The empty rail is hidden. It must never become silently unavailable.
At narrower canvas widths, toolbar labels collapse before controls wrap or
overlap.

The planned Problems dock is not yet part of the implemented shell. When added,
it should collapse to a narrow clean-state strip and expand beneath the canvas,
without displacing the inspector.

## The four views

| View | Modes | Question answered |
| --- | --- | --- |
| Graph | Freeform, Top-down, By API, Data flow | What shape is this workflow, and how does data move? |
| Sequence | Diagram, Call log | How do the API exchanges happen in order? |
| Docs | None | Can I read and share the workflow as structured prose? |
| YAML | None | What is the exact source of truth? |

Switching view or mode preserves the active workflow and selection. Graph and
Sequence remain inspection views: execution reordering and structural creation
belong to the dedicated builder.

### Graph

- **Freeform** is a presentation layout. Dragging cards changes local layout,
  never the Arazzo `steps` array.
- **Top-down** shows execution in a document-reading direction.
- **By API** groups calls by their resolved API or nested workflow participant.
- **Data flow** replaces progression edges with runtime-expression edges from
  workflow inputs to consumers, producing steps to consumers, and producing
  steps to workflow outputs.
- Nodes and edges are selectable. Selection opens the same inspector used by
  the other views.

### Sequence participant rule

The Sequence diagram contains:

1. one neutral **This workflow** runner lane;
2. one lane for each `sourceDescription` actually called; and
3. one lane for each referenced nested workflow.

It does not invent Initiator, User, Browser, Integrating application, or
internal service lanes. If a design needs those actors, they must be modelled
or documented separately rather than attributed to Arazzo.

Each step is one selectable horizontal band. It contains a request moving from
the runner to the target, a response returning to the runner, an activation
marker, request-binding chips, expected status, and captured outputs. The DOM
diagram is horizontally scrollable at a readable text size; it is not a scaled
image.

The Call log is the document-friendly density. It expands each request and
response, exports Markdown or Mermaid, and prints all exchanges without the
workspace chrome.

## Components

### Step node

| Part | Rule |
| --- | --- |
| Frame | 17px radius, cream fill, elevation 2, amber inset rail for steps only |
| Header | Step number, resolved method/path where available, and step ID |
| Values | Consumed values first, produced values second; compact overflow count after four chips |
| Validation | Warning or error badge in the top-right, driven by the shared diagnostics source |
| Selected | Ring and elevation only; never a position or size change |
| Input/output | Violet-wash fill without the amber step rail |

### Inspector rail

The rail header contains the step position, step ID, close action, and
previous/next navigation. Its tabs keep related information together:

| Tab | Contents |
| --- | --- |
| Contract | Method/path, API source, OpenAPI summary, declared-versus-sent parameters, responses, security, and server |
| Data | Inputs consumed, request bindings, outputs captured, dependencies, and consumers |
| Control flow | Success criteria, success/failure actions, retries, and dependencies |
| YAML | Read-only step fragment and copy/reveal affordances |

The declared-versus-sent parameter table is the core contract comparison. Each
OpenAPI parameter gets one row with **OpenAPI declares** and **This step sends**
columns. Unbound required parameters are clearly marked; users should not have
to compare two sections separated by scrolling.

A selected connection uses the same rail to explain its source, target,
condition, control-flow action, or runtime value.

### Toolbars and controls

- Primary view tabs use a paper pill track and an accent-filled active item.
- Mode switches use the same geometry with an outline and a wash-filled active
  item, making them subordinate to the view tabs.
- Primary buttons use the accent fill and white text. Secondary buttons use a
  cream fill and strong border. Ghost actions remain transparent.
- Icon-only controls are 30–34px circles with explicit accessible names and
  tooltips where meaning is not visible.
- Lucide icons are 15–16px in toolbars, 13–14px inline, and about 12px in chips.
- Toolbars compact to icons or horizontal overflow; controls never clip beneath
  an inspector.

### Problems dock — target

The future dock has Problems, Document, and Unresolved operations sections.
Rows contain severity, one concise message, and a clickable YAML breadcrumb.
Canvas validation badges and dock rows must share one diagnostics model. The
dock also reports Arazzo version and connected API sources.

## Interaction rules

| Rule | Behaviour | Status |
| --- | --- | --- |
| One selection | Workspace owns the selected workflow step or connection | Implemented |
| Selection survives | View and mode changes preserve selection | Implemented |
| Selection is shared | Graph, Sequence, sidebar, Docs, and YAML read/write the same selection | Partially implemented |
| Selection never reflows | Ring/fill changes only; inspector space is stable on desktop | Implemented |
| Layout is presentation | Positions persist per workflow and never change execution order | Implemented |
| Deep links | `?wf=<id>&step=<id>&view=<tab>` restores a shareable view | Target |
| Keyboard | Search, next/previous step, view switching, and clear-selection shortcuts | Target |
| Editing boundary | Visual projections stay read-only; builder/YAML perform structural changes | Implemented |
| Motion | Short state/layout transitions and reduced-motion support | Implemented |

Hover may add elevation but must not move layout. A future value-tracing
interaction should highlight every occurrence of the same runtime value across
the current view.

## Accessibility and responsive rules

- All view and mode groups expose correct tab semantics and accessible names.
- Sequence bands are keyboard selectable with Enter or Space.
- Colour never carries method, status, validation, or selection meaning alone.
- Inspector and call-log prose remain at or above the 10px floor.
- Focus indicators remain visible against both white cards and violet surfaces.
- Reduced-motion preferences disable non-essential transitions.
- At narrow widths the selected inspector remains reachable as a sheet; content
  reflows to one column before it becomes horizontally unreadable.
- Printed call logs omit navigation, controls, sidebars, and inspector chrome.

## Implementation map

| Concern | Primary implementation |
| --- | --- |
| Tokens, shell, responsive and print rules | `app/globals.css` |
| View, selection, and mode coordination | `components/workspace/Workspace.tsx` |
| Graph modes and node projection | `components/workspace/FlowView.tsx` |
| Runtime data edges | `lib/workflow-graph.ts` |
| Sequence participants and exchange model | `lib/sequence.ts` |
| DOM sequence | `components/workspace/SequenceDiagram.tsx` |
| Developer call log | `components/workspace/SequenceCallLog.tsx` |
| Inspector | `components/workspace/SelectionInspector.tsx` |
| OpenAPI contract comparison | `components/workspace/OpenApiOperationInspector.tsx` |

## Debt and extension rules

- Keep Mermaid as a portable export, not an application rendering dependency.
- Do not reintroduce invented Sequence lifelines.
- The builder must either make visual position communicate insertion order or
  clearly present itself as an ordered scaffold generator.
- Expand builder expressiveness deliberately; do not imply it can author every
  Arazzo control-flow feature until it can.
- Continue replacing method, status, and surface literals with semantic tokens.
- Implement Problems, deep links, and keyboard navigation as product features,
  with interaction tests, rather than styling-only additions.

When a change intentionally departs from this document, update the design
system and implementation in the same pull request so they do not drift.
