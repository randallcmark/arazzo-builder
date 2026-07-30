"use client";

import {
  Background,
  Controls,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import {
  ArrowDown,
  ArrowUp,
  Braces,
  Check,
  GripVertical,
  Plus,
  Search,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { ArazzoWorkflow } from "@/lib/arazzo";
import {
  OPERATION_RESULT_LIMIT,
  operationMatches,
  type OpenApiOperation,
} from "@/lib/openapi";
import { useDialogFocus } from "./useDialogFocus";

const OPERATION_MIME = "application/arazzo-operation";

type StepDraft = {
  nodeId: string;
  stepId: string;
  sourceName: string;
  operationId: string;
  method: string;
  path: string;
  description: string;
  successCode: string;
  outputName: string;
  outputExpression: string;
};

type BuilderNodeData = {
  kind: "start" | "step" | "end";
  label: React.ReactNode;
  operationId?: string;
};

const endpointNodes: Array<Node<BuilderNodeData>> = [
  {
    id: "builder-start",
    position: { x: 70, y: 210 },
    data: {
      kind: "start",
      label: (
        <span className="builder-node-label">
          <Braces size={14} />
          <span>
            <small>Entry</small>
            <strong>Workflow inputs</strong>
          </span>
        </span>
      ),
    },
    selectable: false,
    draggable: false,
    sourcePosition: Position.Right,
    className: "builder-flow-node builder-flow-node--endpoint",
  },
  {
    id: "builder-end",
    position: { x: 840, y: 210 },
    data: {
      kind: "end",
      label: (
        <span className="builder-node-label">
          <Check size={14} />
          <span>
            <small>Exit</small>
            <strong>Complete</strong>
          </span>
        </span>
      ),
    },
    selectable: false,
    draggable: false,
    targetPosition: Position.Left,
    className: "builder-flow-node builder-flow-node--endpoint",
  },
];

export function AddWorkflowDialog({
  open,
  onClose,
  onInsert,
  operations,
  sourceNames,
  existingWorkflowIds,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (workflow: ArazzoWorkflow) => void;
  operations: OpenApiOperation[];
  sourceNames: string[];
  existingWorkflowIds: string[];
}) {
  if (!open) return null;

  return (
    <ReactFlowProvider>
      <VisualWorkflowBuilder
        onClose={onClose}
        onInsert={onInsert}
        operations={operations}
        sourceNames={sourceNames}
        existingWorkflowIds={existingWorkflowIds}
      />
    </ReactFlowProvider>
  );
}

function VisualWorkflowBuilder({
  onClose,
  onInsert,
  operations,
  sourceNames,
  existingWorkflowIds,
}: Omit<Parameters<typeof AddWorkflowDialog>[0], "open">) {
  const [workflowId, setWorkflowId] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [inputs, setInputs] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [manualOperation, setManualOperation] = useState("");
  const [manualSourceName, setManualSourceName] = useState(sourceNames[0] ?? "api");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [error, setError] = useState("");
  const [nodes, setNodes, onNodesChange] =
    useNodesState<Node<BuilderNodeData>>(endpointNodes);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const counter = useRef(0);
  const dialogRef = useDialogFocus<HTMLElement>(true, onClose);

  const selectedIndex = steps.findIndex(
    (step) => step.nodeId === selectedNodeId,
  );
  const selectedStep = selectedIndex >= 0 ? steps[selectedIndex] : null;
  const cleanQuery = query.trim().toLowerCase();
  const filteredOperations = useMemo(
    () =>
      operations.filter((operation) =>
        (sourceFilter === "all" || operation.sourceName === sourceFilter) &&
        operationMatches(operation, cleanQuery),
      ),
    [cleanQuery, operations, sourceFilter],
  );

  const edges = useMemo<Edge[]>(() => {
    if (!steps.length) return [];
    return [
      {
        id: "builder-start-first",
        source: "builder-start",
        target: steps[0].nodeId,
        animated: true,
      },
      ...steps.slice(0, -1).map((step, index) => ({
        id: `${step.nodeId}-${steps[index + 1].nodeId}`,
        source: step.nodeId,
        target: steps[index + 1].nodeId,
      })),
      {
        id: "builder-last-end",
        source: steps.at(-1)!.nodeId,
        target: "builder-end",
      },
    ];
  }, [steps]);

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => {
        const step = steps.find((candidate) => candidate.nodeId === node.id);
        if (!step) return node;
        return {
          ...node,
          data: {
            ...node.data,
            operationId: step.operationId,
            label: operationNodeLabel(step),
          },
        };
      }),
    );
  }, [setNodes, steps]);

  const updateSelectedStep = (patch: Partial<StepDraft>) => {
    if (!selectedNodeId) return;
    setSteps((current) =>
      current.map((step) =>
        step.nodeId === selectedNodeId ? { ...step, ...patch } : step,
      ),
    );
  };

  const addOperation = (
    operation: OpenApiOperation,
    position?: { x: number; y: number },
  ) => {
    counter.current += 1;
    const nodeId = `builder-step-${counter.current}`;
    const stepId = uniqueStepId(slugify(operation.id) || "operation", steps);
    const step: StepDraft = {
      nodeId,
      stepId,
      sourceName: operation.sourceName ?? sourceNames[0] ?? "api",
      operationId: operation.id,
      method: operation.method,
      path: operation.path,
      description:
        operation.summary === operation.id ? "" : operation.summary,
      successCode: "200",
      outputName: "",
      outputExpression: "$response.body",
    };
    const fallbackPosition = {
      x: 300 + (steps.length % 2) * 240,
      y: 95 + steps.length * 95,
    };

    setSteps((current) => [...current, step]);
    setNodes((current) => [
      ...current,
      {
        id: nodeId,
        position: position ?? fallbackPosition,
        data: {
          kind: "step",
          operationId: step.operationId,
          label: operationNodeLabel(step),
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        className: "builder-flow-node builder-flow-node--operation",
      },
    ]);
    setSelectedNodeId(nodeId);
    setError("");
    window.setTimeout(() => void fitView({ padding: 0.16, duration: 240 }), 0);
  };

  const addManualOperation = () => {
    const id = manualOperation.trim();
    if (!id) return;
    addOperation({
      id,
      method: "CUSTOM",
      path: "Manual operation reference",
      summary: id,
      resolved: false,
      sourceName: manualSourceName,
    });
    setManualOperation("");
  };

  const handleCanvasDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const encoded = event.dataTransfer.getData(OPERATION_MIME);
    if (!encoded) return;
    try {
      const operation = JSON.parse(encoded) as OpenApiOperation;
      addOperation(
        operation,
        screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
    } catch {
      setError("That operation could not be added. Try clicking it instead.");
    }
  };

  const removeSelectedStep = () => {
    if (!selectedNodeId) return;
    setSteps((current) =>
      current.filter((step) => step.nodeId !== selectedNodeId),
    );
    setNodes((current) =>
      current.filter((node) => node.id !== selectedNodeId),
    );
    setSelectedNodeId(null);
  };

  const moveSelectedStep = (direction: -1 | 1) => {
    if (selectedIndex < 0) return;
    const targetIndex = selectedIndex + direction;
    if (targetIndex < 0 || targetIndex >= steps.length) return;
    setSteps((current) => {
      const next = [...current];
      [next[selectedIndex], next[targetIndex]] = [
        next[targetIndex],
        next[selectedIndex],
      ];
      return next;
    });
  };

  const canSubmit = Boolean(
    workflowId.trim() &&
      summary.trim() &&
      steps.length &&
      steps.every((step) => step.stepId.trim() && step.operationId.trim()),
  );

  const handleSubmit = () => {
    const cleanId = workflowId.trim();
    if (!/^[A-Za-z0-9_-]+$/.test(cleanId)) {
      setError("Workflow IDs may contain letters, numbers, hyphens, and underscores.");
      return;
    }
    if (existingWorkflowIds.includes(cleanId)) {
      setError(`A workflow named "${cleanId}" already exists.`);
      return;
    }
    const stepIds = steps.map((step) => step.stepId.trim());
    if (stepIds.some((stepId) => !/^[A-Za-z0-9_-]+$/.test(stepId))) {
      setError("Step IDs may contain letters, numbers, hyphens, and underscores.");
      return;
    }
    if (new Set(stepIds).size !== stepIds.length) {
      setError("Step IDs must be unique within the workflow.");
      return;
    }

    const inputNames = inputs
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    onInsert({
      workflowId: cleanId,
      summary: summary.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(inputNames.length
        ? {
            inputs: {
              type: "object",
              properties: Object.fromEntries(
                inputNames.map((name) => [name, { type: "string" }]),
              ),
            },
          }
        : {}),
      steps: steps.map((step) => ({
        stepId: step.stepId.trim(),
        ...(step.description.trim()
          ? { description: step.description.trim() }
          : {}),
        operationId: `$sourceDescriptions.${step.sourceName}.${step.operationId.trim()}`,
        successCriteria: [
          { condition: `$statusCode == ${step.successCode || "200"}` },
        ],
        ...(step.outputName.trim()
          ? {
              outputs: {
                [step.outputName.trim()]:
                  step.outputExpression.trim() || "$response.body",
              },
            }
          : {}),
      })),
    });
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="workflow-dialog workflow-dialog--visual"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-dialog-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="view-eyebrow">Visual composer</p>
            <h2 id="workflow-dialog-title">Weave a new workflow</h2>
            <span>Drag operations onto the canvas. Their sequence becomes the flow.</span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </header>

        <div className="visual-builder-meta">
          <label>
            <span>Workflow ID</span>
            <input
              value={workflowId}
              onChange={(event) => setWorkflowId(event.target.value)}
              placeholder="onboard-contractor"
            />
          </label>
          <label>
            <span>Outcome</span>
            <input
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Onboard a new contractor"
            />
          </label>
          <div className="builder-sequence-count">
            <Workflow size={16} />
            <span>
              <strong>{steps.length}</strong>
              {steps.length === 1 ? " step" : " steps"}
            </span>
          </div>
        </div>

        <div className="visual-builder-body">
          <aside className="operation-palette">
            <div className="builder-panel-heading">
              <span>Operation palette</span>
              <small>Drag or click to add</small>
            </div>
            <label className="operation-search">
              <Search size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search operations"
                aria-label="Search operations"
              />
            </label>
            {sourceNames.length > 1 && (
              <label className="operation-source-filter">
                <span>API</span>
                <select
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value)}
                >
                  <option value="all">All connected APIs</option>
                  {sourceNames.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="operation-list">
              {filteredOperations
                .slice(0, OPERATION_RESULT_LIMIT)
                .map((operation) => (
                <button
                  className="operation-card"
                  key={`${operation.sourceName ?? "api"}:${operation.id}`}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData(
                      OPERATION_MIME,
                      JSON.stringify(operation),
                    );
                  }}
                  onClick={() => addOperation(operation)}
                >
                  <GripVertical size={14} />
                  <span>
                    <small>
                      <b>{operation.method}</b>
                      {operation.sourceName && (
                        <i>{operation.sourceName}</i>
                      )}
                      {operation.path}
                    </small>
                    <strong>{operation.summary}</strong>
                    <code>{operation.id}</code>
                  </span>
                  <Plus size={14} />
                </button>
                ))}
              {!filteredOperations.length && (
                <p className="operation-empty">
                  No matching catalogue operations. Add an operation ID below.
                </p>
              )}
              {filteredOperations.length > OPERATION_RESULT_LIMIT && (
                <p className="operation-limit">
                  Showing {OPERATION_RESULT_LIMIT} of {filteredOperations.length}.
                  Narrow the list with search or the API filter.
                </p>
              )}
            </div>
            <div className="manual-operation">
              <label htmlFor="manual-operation-id">Custom operation ID</label>
              <div>
                <select
                  value={manualSourceName}
                  onChange={(event) => setManualSourceName(event.target.value)}
                  aria-label="API source for custom operation"
                >
                  {(sourceNames.length ? sourceNames : ["api"]).map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
                <input
                  id="manual-operation-id"
                  value={manualOperation}
                  onChange={(event) => setManualOperation(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addManualOperation();
                  }}
                  placeholder="createContract"
                />
                <button
                  className="icon-button"
                  onClick={addManualOperation}
                  disabled={!manualOperation.trim()}
                  aria-label="Add custom operation"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
          </aside>

          <div
            className="builder-canvas"
            onDrop={handleCanvasDrop}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onNodeClick={(_, node) => {
                if (node.data.kind === "step") setSelectedNodeId(node.id);
              }}
              onPaneClick={() => setSelectedNodeId(null)}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.4}
              maxZoom={1.7}
              deleteKeyCode={null}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#d2d9d4" gap={22} size={1} />
              <MiniMap
                nodeColor={(node) =>
                  node.data?.kind === "step" ? "#ffd447" : "#beb8f8"
                }
                pannable
                zoomable
              />
              <Controls showInteractive={false} />
            </ReactFlow>
            {!steps.length && (
              <div className="builder-drop-hint">
                <GripVertical size={20} />
                <strong>Drop your first operation here</strong>
                <span>You can reposition cards after adding them.</span>
              </div>
            )}
          </div>

          <aside className="builder-inspector">
            <div className="builder-panel-heading">
              <span>{selectedStep ? "Step inspector" : "Workflow details"}</span>
              <small>
                {selectedStep
                  ? `Step ${selectedIndex + 1} of ${steps.length}`
                  : "Optional metadata"}
              </small>
            </div>
            {selectedStep ? (
              <div className="builder-inspector-fields">
                <div className="step-order-actions">
                  <button
                    className="quiet-button"
                    onClick={() => moveSelectedStep(-1)}
                    disabled={selectedIndex === 0}
                  >
                    <ArrowUp size={14} />
                    Earlier
                  </button>
                  <button
                    className="quiet-button"
                    onClick={() => moveSelectedStep(1)}
                    disabled={selectedIndex === steps.length - 1}
                  >
                    <ArrowDown size={14} />
                    Later
                  </button>
                </div>
                <BuilderField label="Step ID">
                  <input
                    value={selectedStep.stepId}
                    onChange={(event) =>
                      updateSelectedStep({ stepId: event.target.value })
                    }
                  />
                </BuilderField>
                <BuilderField label="Operation ID">
                  <input
                    className="mono-input"
                    value={selectedStep.operationId}
                    onChange={(event) =>
                      updateSelectedStep({ operationId: event.target.value })
                    }
                  />
                </BuilderField>
                <BuilderField label="API source">
                  <select
                    value={selectedStep.sourceName}
                    onChange={(event) =>
                      updateSelectedStep({ sourceName: event.target.value })
                    }
                  >
                    {sourceNames.map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                </BuilderField>
                <BuilderField label="Description">
                  <textarea
                    rows={3}
                    value={selectedStep.description}
                    onChange={(event) =>
                      updateSelectedStep({ description: event.target.value })
                    }
                    placeholder="What happens here?"
                  />
                </BuilderField>
                <div className="builder-field-row">
                  <BuilderField label="Success status">
                    <input
                      inputMode="numeric"
                      value={selectedStep.successCode}
                      onChange={(event) =>
                        updateSelectedStep({ successCode: event.target.value })
                      }
                    />
                  </BuilderField>
                  <BuilderField label="Output name">
                    <input
                      value={selectedStep.outputName}
                      onChange={(event) =>
                        updateSelectedStep({ outputName: event.target.value })
                      }
                      placeholder="contract_id"
                    />
                  </BuilderField>
                </div>
                {selectedStep.outputName && (
                  <BuilderField label="Output expression">
                    <input
                      className="mono-input"
                      value={selectedStep.outputExpression}
                      onChange={(event) =>
                        updateSelectedStep({
                          outputExpression: event.target.value,
                        })
                      }
                    />
                  </BuilderField>
                )}
                <button
                  className="danger-button"
                  onClick={removeSelectedStep}
                >
                  <Trash2 size={14} />
                  Remove step
                </button>
              </div>
            ) : (
              <div className="builder-inspector-fields">
                <BuilderField label="Description">
                  <textarea
                    rows={5}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="When should someone use this workflow?"
                  />
                </BuilderField>
                <BuilderField label="Inputs">
                  <input
                    value={inputs}
                    onChange={(event) => setInputs(event.target.value)}
                    placeholder="email, country_code"
                  />
                  <small>Comma-separated names; created as string inputs.</small>
                </BuilderField>
                <div className="builder-tip">
                  <GripVertical size={16} />
                  <p>
                    The arrows follow the step order. Select a card to move it
                    earlier or later and refine its details.
                  </p>
                </div>
              </div>
            )}
          </aside>
        </div>

        <footer>
          <div>{error && <p className="form-error">{error}</p>}</div>
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button primary-button--compact"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            Insert workflow
            <Plus size={16} />
          </button>
        </footer>
      </section>
    </div>
  );
}

function BuilderField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="builder-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function operationNodeLabel(step: StepDraft) {
  return (
    <span className="builder-node-label">
      <Workflow size={14} />
      <span>
        <small>
          {step.method} · {step.path}
        </small>
        <strong>{step.stepId}</strong>
        <code>
          {step.sourceName}.{step.operationId}
        </code>
      </span>
    </span>
  );
}

function slugify(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function uniqueStepId(base: string, steps: StepDraft[]): string {
  const existing = new Set(steps.map((step) => step.stepId));
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
