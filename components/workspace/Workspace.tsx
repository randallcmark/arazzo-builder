"use client";

import type { OnMount } from "@monaco-editor/react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Braces,
  Check,
  ChevronDown,
  Circle,
  Copy,
  Database,
  Download,
  FileCode2,
  FolderOpen,
  GitBranch,
  ListTree,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Share2,
  Undo2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { siteConfig } from "@/config/site";
import {
  findWorkflowStepAtOffset,
  findWorkflowStepRange,
  insertWorkflow,
  parseArazzo,
  setWorkflowLayoutExtension,
  upsertSourceDescription,
  workflowToSequence,
  type ArazzoWorkflow,
} from "@/lib/arazzo";
import { loadCataloguesForSpec } from "@/lib/api-catalogues";
import {
  buildCatalogue,
  parseOpenApiSource,
  type ApiCatalogue,
} from "@/lib/openapi";
import { workflowEdges } from "@/lib/workflow-graph";
import {
  defaultWorkflowLayout,
  embeddedWorkflowLayout,
  readStoredWorkflowLayout,
  workflowLayoutExtension,
} from "@/lib/workflow-layout";
import { AddWorkflowDialog } from "./AddWorkflowDialog";
import { ApiSourceDialog } from "./ApiSourceDialog";
import { DocumentationView } from "./DocumentationView";
import { FlowView } from "./FlowView";
import { MermaidView } from "./MermaidView";
import { SelectionInspector } from "./SelectionInspector";
import { SequenceStepBubble } from "./SequenceStepBubble";
import { YamlWorkspacePanel } from "./YamlWorkspacePanel";
import { useDocumentHistory } from "./useDocumentHistory";
import { useWorkspaceDraft } from "./useWorkspaceDraft";

type ViewMode = "flow" | "flowchart" | "sequence" | "docs" | "yaml";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const viewOptions: Array<{
  id: ViewMode;
  label: string;
  icon: typeof GitBranch;
}> = [
  { id: "flow", label: "Flow", icon: GitBranch },
  { id: "flowchart", label: "Chart", icon: Share2 },
  { id: "sequence", label: "Sequence", icon: ListTree },
  { id: "docs", label: "Docs", icon: FileCode2 },
  { id: "yaml", label: "YAML", icon: Braces },
];

export function Workspace() {
  const {
    source,
    sourceRef,
    replaceSource,
    resetSource,
    handleYamlChange,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useDocumentHistory();
  const [status, setStatus] = useState("Loading published baseline…");
  const {
    baseline,
    setBaseline,
    workspaceName,
    setWorkspaceName,
    catalogues,
    setCatalogues,
  } = useWorkspaceDraft({
    source,
    resetSource,
    onStatus: setStatus,
  });
  const [view, setView] = useState<ViewMode>("flow");
  const [activeWorkflowId, setActiveWorkflowId] = useState("");
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [apiSourceOpen, setApiSourceOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const [activeApiName, setActiveApiName] = useState("");
  const [apiOperationQuery, setApiOperationQuery] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const yamlEditor = useRef<Parameters<OnMount>[0] | null>(null);
  const yamlDecorations = useRef<string[]>([]);
  const yamlCursorListener = useRef<{ dispose: () => void } | null>(null);

  const handleUndo = () => {
    if (undo()) setStatus("Undid the last document change");
  };

  const handleRedo = () => {
    if (redo()) setStatus("Redid the document change");
  };

  const result = useMemo(() => parseArazzo(source), [source]);
  const errors = result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  const warnings = result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning",
  );
  const spec = result.spec;
  const operations = useMemo(
    () => catalogues.flatMap((catalogue) => catalogue.operations),
    [catalogues],
  );
  const activeCatalogue =
    catalogues.find((catalogue) => catalogue.sourceName === activeApiName) ??
    catalogues[0] ??
    null;
  const workflow =
    spec?.workflows.find((candidate) => candidate.workflowId === activeWorkflowId) ??
    spec?.workflows[0] ??
    null;
  const graphEdges = useMemo(
    () => (workflow ? workflowEdges(workflow) : []),
    [workflow],
  );
  const selectedEdge =
    graphEdges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedSequenceStep =
    view === "sequence"
      ? workflow?.steps.find((step) => step.stepId === selectedStepId) ?? null
      : null;
  const embeddedLayout = workflow ? embeddedWorkflowLayout(workflow) : null;
  useEffect(
    () => () => {
      yamlCursorListener.current?.dispose();
    },
    [],
  );

  const handleReset = () => {
    if (!baseline) return;
    if (
      source !== baseline &&
      !window.confirm("Discard this browser-local draft and restore the loaded file?")
    ) {
      return;
    }
    replaceSource(baseline);
    const baselineSpec = parseArazzo(baseline).spec;
    if (baselineSpec) {
      void loadCataloguesForSpec(baselineSpec).then((nextCatalogues) => {
        setCatalogues(nextCatalogues);
        setActiveApiName(nextCatalogues[0]?.sourceName ?? "");
      });
    }
    setStatus("Workspace baseline restored");
  };

  const handleDownload = () => {
    const blob = new Blob([source], { type: "application/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = workspaceName;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("YAML downloaded");
  };

  const copyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(successMessage);
    } catch {
      setStatus("Clipboard access was denied. Use the YAML editor to copy instead.");
    }
  };

  const handleCopy = () => {
    void copyText(source, "YAML copied to clipboard");
  };

  const handleImport = async (file: File) => {
    setIsFileDragActive(false);
    if (file.size > MAX_IMPORT_BYTES) {
      setStatus("Import stopped: files must be smaller than 5 MB");
      return;
    }

    try {
      const importedSource = await file.text();
      const importedResult = parseArazzo(importedSource);
      if (!importedResult.spec) {
        setStatus("Import stopped: the file is not valid YAML or JSON");
        return;
      }

      resetSource(importedSource);
      setBaseline(importedSource);
      setWorkspaceName(safeDocumentName(file.name));
      setActiveWorkflowId(importedResult.spec.workflows?.[0]?.workflowId ?? "");
      setSelectedStepId(null);
      setSelectedEdgeId(null);
      setView(
        importedResult.diagnostics.some(
          (diagnostic) => diagnostic.severity === "error",
        )
          ? "yaml"
          : "flow",
      );

      const loadedCatalogues = await loadCataloguesForSpec(importedResult.spec);
      setCatalogues(loadedCatalogues);
      setActiveApiName(loadedCatalogues[0]?.sourceName ?? "");
      const loadedCatalogue = loadedCatalogues.some((catalogue) =>
        catalogue.operations.some((operation) => operation.resolved),
      );
      setStatus(
        loadedCatalogue
          ? `Imported ${file.name}`
          : `Imported ${file.name} · using operations found in the document`,
      );
    } catch {
      setStatus("Import stopped: the file could not be read");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const connectCatalogue = (
    catalogue: ApiCatalogue,
    referenceUrl: string,
  ) => {
    const nextSource = upsertSourceDescription(source, {
      name: catalogue.sourceName,
      type: "openapi",
      url: referenceUrl,
    });
    replaceSource(nextSource);
    setCatalogues((current) => [
      ...current.filter(
        (candidate) => candidate.sourceName !== catalogue.sourceName,
      ),
      catalogue,
    ]);
    setActiveApiName(catalogue.sourceName);
    setStatus(
      `Connected ${catalogue.title} · ${catalogue.operations.length} operations`,
    );
  };

  const handleAddApiUrl = async (name: string, url: string) => {
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new Error(
        "The URL could not be fetched. Check the address and its browser CORS policy.",
      );
    }
    if (!response.ok) {
      throw new Error(`The OpenAPI URL returned HTTP ${response.status}.`);
    }
    const document = parseOpenApiSource(await response.text());
    const catalogue = buildCatalogue(document, name, url);
    if (!catalogue.operations.length) {
      throw new Error("No operations with operationId values were found.");
    }
    connectCatalogue(catalogue, url);
  };

  const handleAddApiFile = async (
    name: string,
    file: File,
    referenceUrl: string,
  ) => {
    if (file.size > MAX_IMPORT_BYTES) {
      throw new Error("OpenAPI files must be smaller than 5 MB.");
    }
    const document = parseOpenApiSource(await file.text());
    const catalogue = buildCatalogue(document, name, referenceUrl);
    if (!catalogue.operations.length) {
      throw new Error("No operations with operationId values were found.");
    }
    connectCatalogue(catalogue, referenceUrl);
  };

  const handleInsert = (newWorkflow: ArazzoWorkflow) => {
    try {
      const nextSource = insertWorkflow(source, newWorkflow);
      replaceSource(nextSource);
      setActiveWorkflowId(newWorkflow.workflowId);
      setSelectedStepId(null);
      setSelectedEdgeId(null);
      setBuilderOpen(false);
      setView("flow");
      setStatus(`Inserted ${newWorkflow.workflowId}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to insert workflow.");
    }
  };

  const handleToggleEmbeddedLayout = () => {
    if (!workflow) return;
    try {
      const nextSource = setWorkflowLayoutExtension(
        source,
        workflow.workflowId,
        embeddedLayout
          ? null
          : workflowLayoutExtension(
              readStoredWorkflowLayout(workspaceName, workflow.workflowId) ??
                defaultWorkflowLayout(workflow),
            ),
      );
      replaceSource(nextSource);
      setStatus(
        embeddedLayout
          ? "Removed the portable layout from YAML"
          : "Embedded the current Flow layout in YAML",
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Unable to update the layout.",
      );
    }
  };

  const revealYamlStep = (
    editor: Parameters<OnMount>[0],
    documentSource: string,
    workflowId: string,
    stepId: string,
  ) => {
    const range = findWorkflowStepRange(documentSource, workflowId, stepId);
    const model = editor.getModel();
    if (!range || !model) return;
    const start = model.getPositionAt(range.start);
    const end = model.getPositionAt(range.end);
    const editorRange = {
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
    };
    yamlDecorations.current = editor.deltaDecorations(
      yamlDecorations.current,
      [
        {
          range: editorRange,
          options: {
            isWholeLine: true,
            className: "yaml-step-highlight",
          },
        },
      ],
    );
    editor.revealRangeInCenter(editorRange);
  };

  const handleYamlMount: OnMount = (editor) => {
    yamlEditor.current = editor;
    yamlCursorListener.current?.dispose();
    yamlCursorListener.current = editor.onDidChangeCursorPosition((event) => {
      const model = editor.getModel();
      if (!model) return;
      const match = findWorkflowStepAtOffset(
        sourceRef.current,
        model.getOffsetAt(event.position),
      );
      if (!match) return;
      setActiveWorkflowId(match.workflowId);
      setSelectedStepId(match.stepId);
      setSelectedEdgeId(null);
    });
    if (workflow && selectedStepId) {
      revealYamlStep(
        editor,
        sourceRef.current,
        workflow.workflowId,
        selectedStepId,
      );
    }
  };

  useEffect(() => {
    if (view !== "yaml" || !yamlEditor.current) return;
    if (!workflow || !selectedStepId) {
      yamlDecorations.current = yamlEditor.current.deltaDecorations(
        yamlDecorations.current,
        [],
      );
      return;
    }
    revealYamlStep(
      yamlEditor.current,
      source,
      workflow.workflowId,
      selectedStepId,
    );
  }, [source, selectedStepId, view, workflow]);

  const selectView = (nextView: ViewMode) => {
    if (nextView === "sequence" || view === "sequence") {
      setSelectedStepId(null);
      setSelectedEdgeId(null);
    }
    setView(nextView);
  };

  const handleViewTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentView: ViewMode,
  ) => {
    const currentIndex = viewOptions.findIndex(({ id }) => id === currentView);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % viewOptions.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + viewOptions.length) % viewOptions.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = viewOptions.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const nextView = viewOptions[nextIndex].id;
    selectView(nextView);
    window.requestAnimationFrame(() =>
      document.getElementById(`workspace-tab-${nextView}`)?.focus(),
    );
  };

  return (
    <main
      className="workspace-shell"
      onDragEnter={(event) => {
        if (hasFiles(event.dataTransfer)) {
          event.preventDefault();
          setIsFileDragActive(true);
        }
      }}
      onDragOver={(event) => {
        if (hasFiles(event.dataTransfer)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragLeave={(event) => {
        if (
          event.currentTarget === event.target ||
          !event.currentTarget.contains(event.relatedTarget as Node | null)
        ) {
          setIsFileDragActive(false);
        }
      }}
      onDrop={(event) => {
        if (!hasFiles(event.dataTransfer)) return;
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) void handleImport(file);
      }}
    >
      <input
        ref={fileInput}
        className="visually-hidden"
        type="file"
        accept=".yaml,.yml,.json,application/yaml,application/json,text/yaml"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleImport(file);
        }}
      />
      <header className="workspace-header">
        <div className="workspace-brand-group">
          <Link className="icon-button icon-button--ghost" href="/" aria-label="Back home">
            <ArrowLeft size={17} />
          </Link>
          <Link className="brand brand--workspace" href="/">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>{siteConfig.productName}</span>
          </Link>
          <span className="header-divider" />
          <div className="file-identity">
            <FileCode2 size={16} />
            <div>
              <strong>{workspaceName}</strong>
              <span>{status}</span>
            </div>
          </div>
        </div>

        <div className="workspace-actions">
          <button
            className="quiet-button api-source-button"
            onClick={() => setApiSourceOpen(true)}
          >
            <Database size={15} />
            APIs
            {catalogues.length > 0 && (
              <span className="button-count">{catalogues.length}</span>
            )}
          </button>
          <button
            className="quiet-button import-button"
            onClick={() => fileInput.current?.click()}
          >
            <FolderOpen size={15} />
            Import
          </button>
          <button className="quiet-button" onClick={handleReset} disabled={!baseline}>
            <RotateCcw size={15} />
            Reset
          </button>
          <button className="quiet-button" onClick={handleCopy} disabled={!source}>
            <Copy size={15} />
            Copy
          </button>
          <button className="secondary-button" onClick={handleDownload} disabled={!source}>
            <Download size={15} />
            Export YAML
          </button>
          <button
            className="primary-button primary-button--compact"
            onClick={() => setBuilderOpen(true)}
            disabled={!spec || errors.length > 0}
          >
            <Plus size={16} />
            Add workflow
          </button>
        </div>
      </header>

      <div className="workspace-layout">
        <aside className={`workspace-sidebar ${sidebarOpen ? "" : "is-collapsed"}`}>
          <div className="sidebar-heading">
            <div>
              <p className="view-eyebrow">Collection</p>
              <h2>Workflows</h2>
            </div>
            <button
              className="icon-button"
              onClick={() => setSidebarOpen((current) => !current)}
              aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <ChevronDown size={17} />
            </button>
          </div>

          <div className="workflow-list">
            {spec?.workflows.map((candidate, index) => (
              <button
                className={`workflow-list-item ${
                  candidate.workflowId === workflow?.workflowId ? "is-active" : ""
                }`}
                key={candidate.workflowId}
                onClick={() => {
                  setActiveWorkflowId(candidate.workflowId);
                  setSelectedStepId(null);
                  setSelectedEdgeId(null);
                }}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{candidate.summary || candidate.workflowId}</strong>
                  <small>{candidate.steps.length} steps</small>
                </div>
              </button>
            ))}
          </div>

          <div className="sidebar-footer">
            <div className={`validation-summary ${errors.length ? "has-errors" : ""}`}>
              {errors.length ? <AlertCircle size={16} /> : <Check size={16} />}
              <div>
                <strong>
                  {errors.length
                    ? `${errors.length} issue${errors.length === 1 ? "" : "s"}`
                    : "Document looks good"}
                </strong>
                <span>
                  {warnings.length
                    ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"}`
                    : `Arazzo ${spec?.arazzo ?? "—"}`}
                </span>
              </div>
            </div>
          </div>
        </aside>

        <section className="workspace-main">
          <div className="workspace-toolbar">
            <div className="view-tabs" role="tablist" aria-label="Workspace view">
              {viewOptions.map(({ id, label, icon: Icon }) => (
                <button
                  role="tab"
                  aria-selected={view === id}
                  aria-controls="workspace-view-panel"
                  id={`workspace-tab-${id}`}
                  tabIndex={view === id ? 0 : -1}
                  className={view === id ? "is-active" : ""}
                  key={id}
                  onClick={() => selectView(id)}
                  onKeyDown={(event) => handleViewTabKeyDown(event, id)}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
            <div className="workspace-toolbar-actions">
              <button
                className="icon-button"
                onClick={handleUndo}
                disabled={!canUndo}
                aria-label="Undo document change"
                title="Undo"
              >
                <Undo2 size={14} />
              </button>
              <button
                className="icon-button"
                onClick={handleRedo}
                disabled={!canRedo}
                aria-label="Redo document change"
                title="Redo"
              >
                <Redo2 size={14} />
              </button>
              {workflow && (
                <>
                  <button
                    className={`quiet-button layout-extension-button ${
                      embeddedLayout ? "is-active" : ""
                    }`}
                    onClick={handleToggleEmbeddedLayout}
                    title={
                      embeddedLayout
                        ? "Remove x-arazzo-builder-layout from this workflow"
                        : "Embed the current Flow arrangement as x-arazzo-builder-layout"
                    }
                  >
                    <Save size={13} />
                    {embeddedLayout ? "Layout embedded" : "Embed layout"}
                  </button>
                  <div className="active-workflow-label">
                    <Circle size={8} fill="currentColor" />
                    {workflow.workflowId}
                  </div>
                </>
              )}
            </div>
          </div>

          <div
            className={`workspace-canvas workspace-canvas--${view}`}
            id="workspace-view-panel"
            role="tabpanel"
            aria-labelledby={`workspace-tab-${view}`}
          >
            {!source ? (
              <div className="workspace-empty">
                <div className="loading-weave">
                  <span />
                  <span />
                  <span />
                </div>
                <p>Loading the published workflow…</p>
              </div>
            ) : view === "yaml" ? (
              <YamlWorkspacePanel
                source={source}
                onMount={handleYamlMount}
                onChange={handleYamlChange}
                catalogues={catalogues}
                activeCatalogue={activeCatalogue}
                onActiveCatalogueChange={setActiveApiName}
                operationQuery={apiOperationQuery}
                onOperationQueryChange={setApiOperationQuery}
                diagnostics={result.diagnostics}
                onCopyReference={(reference) =>
                  void copyText(reference, `Copied ${reference}`)
                }
              />
            ) : !spec || !workflow ? (
              <div className="workspace-empty workspace-empty--error">
                <AlertCircle size={30} />
                <h2>The YAML needs attention</h2>
                <p>
                  Open the YAML view to repair the document. The last browser draft
                  remains safely stored.
                </p>
                <button className="secondary-button" onClick={() => setView("yaml")}>
                  <Braces size={16} />
                  Open YAML
                </button>
              </div>
            ) : view === "flow" ? (
              <FlowView
                workflow={workflow}
                selectedStepId={selectedStepId}
                selectedEdgeId={selectedEdgeId}
                onStepSelect={setSelectedStepId}
                onEdgeSelect={setSelectedEdgeId}
                mode="flow"
                layoutScope={workspaceName}
                catalogues={catalogues}
                onLayoutChange={(layout) => {
                  if (!embeddedLayout) return;
                  try {
                    replaceSource(
                      setWorkflowLayoutExtension(
                        source,
                        workflow.workflowId,
                        workflowLayoutExtension(layout),
                      ),
                    );
                    setStatus("Embedded Flow layout updated");
                  } catch (error) {
                    setStatus(
                      error instanceof Error
                        ? error.message
                        : "Unable to update the embedded layout.",
                    );
                  }
                }}
              />
            ) : view === "flowchart" ? (
              <FlowView
                workflow={workflow}
                selectedStepId={selectedStepId}
                selectedEdgeId={selectedEdgeId}
                onStepSelect={setSelectedStepId}
                onEdgeSelect={setSelectedEdgeId}
                mode="chart"
                layoutScope={workspaceName}
                catalogues={catalogues}
              />
            ) : view === "sequence" ? (
              <MermaidView
                chart={workflowToSequence(spec, workflow, catalogues)}
                interactiveStepIds={workflow.steps.map((step) => step.stepId)}
                messageStepIds={[
                  null,
                  ...workflow.steps.flatMap((step) => [step.stepId, step.stepId]),
                  null,
                ]}
                selectedStepId={selectedStepId}
                onStepSelect={(stepId) => {
                  setSelectedStepId(stepId);
                  setSelectedEdgeId(null);
                }}
                onStepClear={() => setSelectedStepId(null)}
                detailBubble={
                  selectedSequenceStep ? (
                    <SequenceStepBubble
                      workflow={workflow}
                      step={selectedSequenceStep}
                      catalogues={catalogues}
                      onClose={() => setSelectedStepId(null)}
                    />
                  ) : null
                }
              />
            ) : view === "docs" ? (
              <DocumentationView
                workflow={workflow}
                sources={spec.sourceDescriptions}
              />
            ) : null}
          </div>
        </section>

        {workflow &&
          (selectedStepId || selectedEdge) &&
          ["flow", "flowchart"].includes(view) && (
            <SelectionInspector
              workflow={workflow}
              selectedStepId={selectedStepId}
              selectedEdge={selectedEdge}
              catalogues={catalogues}
              onClose={() => {
                setSelectedStepId(null);
                setSelectedEdgeId(null);
              }}
            />
          )}
      </div>

      <AddWorkflowDialog
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        onInsert={handleInsert}
        operations={operations}
        sourceNames={
          spec?.sourceDescriptions.map((sourceDescription) => sourceDescription.name) ??
          []
        }
        existingWorkflowIds={spec?.workflows.map((item) => item.workflowId) ?? []}
      />
      <ApiSourceDialog
        open={apiSourceOpen}
        catalogues={catalogues}
        onClose={() => setApiSourceOpen(false)}
        onAddUrl={handleAddApiUrl}
        onAddFile={handleAddApiFile}
      />
      {isFileDragActive && (
        <div className="import-drop-overlay" aria-hidden="true">
          <div>
            <FolderOpen size={28} />
            <strong>Replace this workspace</strong>
            <span>Drop an Arazzo YAML or JSON file</span>
          </div>
        </div>
      )}
    </main>
  );
}

function safeDocumentName(name: string): string {
  const cleanName = name.trim().replace(/[^\w.-]+/g, "-");
  return cleanName || "imported-arazzo.yml";
}

function hasFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes("Files");
}
