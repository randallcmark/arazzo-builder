"use client";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Braces, Check, Move, Workflow } from "lucide-react";
import { useEffect, useMemo } from "react";
import type { ArazzoSpec, ArazzoStep, ArazzoWorkflow } from "@/lib/arazzo";
import { shortOperation } from "@/lib/arazzo";
import {
  resolveStepOperation,
  type ApiCatalogue,
  type OpenApiOperation,
} from "@/lib/openapi";
import { sequenceParticipant } from "@/lib/sequence";
import {
  workflowDataEdges,
  workflowEdges,
  type WorkflowEdge,
} from "@/lib/workflow-graph";
import {
  defaultWorkflowLayout,
  embeddedWorkflowLayout,
  readStoredWorkflowLayout,
  writeStoredWorkflowLayout,
  type WorkflowNodeLayout,
} from "@/lib/workflow-layout";

export type GraphLayoutMode = "freeform" | "topdown" | "byapi" | "dataflow";

type FlowNodeData = {
  kind: "input" | "step" | "output";
  direction: "horizontal" | "vertical";
  title: string;
  subtitle: string;
  step?: ArazzoStep;
  operation?: OpenApiOperation;
};

function LoomNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const vertical = data.direction === "vertical";
  return (
    <div className={`loom-node loom-node--${data.kind} ${selected ? "is-selected" : ""}`}>
      <Handle type="target" position={vertical ? Position.Top : Position.Left} />
      <div className="loom-node-icon">
        {data.kind === "input" ? (
          <Braces size={16} />
        ) : data.kind === "output" ? (
          <Check size={16} />
        ) : (
          <Workflow size={16} />
        )}
      </div>
      <div>
        <small>{data.subtitle}</small>
        <strong>{data.title}</strong>
        {vertical && data.operation && (
          <span className="loom-node-operation">
            {data.operation.path}
            <em>{data.operation.summary}</em>
          </span>
        )}
      </div>
      <Handle type="source" position={vertical ? Position.Bottom : Position.Right} />
    </div>
  );
}

const nodeTypes = { loom: LoomNode };

export function FlowView({
  workflow,
  spec,
  selectedStepId,
  selectedEdgeId,
  onStepSelect,
  onEdgeSelect,
  mode = "freeform",
  layoutScope,
  onLayoutChange,
  catalogues = [],
}: {
  workflow: ArazzoWorkflow;
  spec: ArazzoSpec;
  selectedStepId: string | null;
  selectedEdgeId: string | null;
  onStepSelect: (stepId: string | null) => void;
  onEdgeSelect: (edgeId: string | null) => void;
  mode?: GraphLayoutMode;
  layoutScope: string;
  onLayoutChange?: (layout: WorkflowNodeLayout) => void;
  catalogues?: ApiCatalogue[];
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const graphEdges = useMemo(
    () => (mode === "dataflow" ? workflowDataEdges(workflow) : workflowEdges(workflow)),
    [mode, workflow],
  );

  useEffect(() => {
    const savedLayout =
      mode === "freeform"
        ? readStoredWorkflowLayout(layoutScope, workflow.workflowId) ??
          embeddedWorkflowLayout(workflow) ??
          defaultWorkflowLayout(workflow)
        : {};
    setNodes(
      workflowNodes(
        workflow,
        spec,
        mode,
        savedLayout,
        selectedStepId,
        catalogues,
      ),
    );
  }, [catalogues, layoutScope, mode, selectedStepId, setNodes, spec, workflow]);

  const edges = useMemo(
    () =>
      graphEdges.map((edge) =>
        flowEdge(edge, selectedEdgeId === edge.id),
      ),
    [graphEdges, selectedEdgeId],
  );

  return (
    <div className={`workflow-graph workflow-graph--${mode}`}>
      {mode === "freeform" && (
        <div className="flow-canvas-note">
          <Move size={14} />
          <span>Drag cards to arrange this view. Execution is unchanged.</span>
        </div>
      )}
      {mode === "dataflow" && (
        <div className="flow-canvas-note">
          <Braces size={14} />
          <span>Edges show runtime values consumed and produced by each step.</span>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        nodesDraggable={mode === "freeform"}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.35}
        maxZoom={1.6}
        onPaneClick={() => {
          onStepSelect(null);
          onEdgeSelect(null);
        }}
        onNodeClick={(_, node) => {
          if (node.data.kind === "step") {
            onStepSelect(node.id);
            onEdgeSelect(null);
          }
        }}
        onEdgeClick={(_, edge) => {
          if (edge.data?.kind !== "system") {
            onEdgeSelect(edge.id);
            onStepSelect(null);
          }
        }}
        onNodeDragStop={(_, node) => {
          if (mode !== "freeform") return;
          const current =
            readStoredWorkflowLayout(layoutScope, workflow.workflowId) ??
            embeddedWorkflowLayout(workflow) ??
            defaultWorkflowLayout(workflow);
          const nextLayout = {
            ...current,
            [node.id]: node.position,
          };
          writeStoredWorkflowLayout(
            layoutScope,
            workflow.workflowId,
            nextLayout,
          );
          onLayoutChange?.(nextLayout);
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#cbc7ed" gap={24} size={1} />
        <MiniMap
          nodeColor={(node) =>
            node.data?.kind === "step" ? "#ffd447" : "#beb8f8"
          }
          maskColor="rgba(246, 245, 255, 0.78)"
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function workflowNodes(
  workflow: ArazzoWorkflow,
  spec: ArazzoSpec,
  mode: GraphLayoutMode,
  layout: WorkflowNodeLayout,
  selectedStepId: string | null,
  catalogues: ApiCatalogue[],
): Array<Node<FlowNodeData>> {
  const direction: FlowNodeData["direction"] =
    mode === "freeform" ? "horizontal" : "vertical";
  const chartX = 310;
  const columnWidth = 300;
  const rowHeight = 185;

  // Column index per step, only meaningful in "byapi" mode: one column per
  // distinct participant (API or nested workflow), in first-appearance order.
  const apiColumns = new Map<string, number>();
  if (mode === "byapi") {
    for (const step of workflow.steps) {
      const key = sequenceParticipant(spec, step, catalogues).key;
      if (!apiColumns.has(key)) apiColumns.set(key, apiColumns.size);
    }
  }
  const rowsPerColumn = new Map<number, number>();
  const stepColumn = (step: ArazzoStep) =>
    apiColumns.get(sequenceParticipant(spec, step, catalogues).key) ?? 0;
  const nextRowInColumn = (column: number) => {
    const row = rowsPerColumn.get(column) ?? 0;
    rowsPerColumn.set(column, row + 1);
    return row;
  };

  const stepPositions = workflow.steps.map((step, index) => {
    if (mode === "freeform") {
      return layout[step.stepId] ?? { x: 310 + index * 280, y: 110 + (index % 2) * 100 };
    }
    if (mode === "byapi") {
      const column = stepColumn(step);
      return { x: chartX + column * columnWidth, y: 165 + nextRowInColumn(column) * rowHeight };
    }
    return { x: chartX, y: 165 + index * rowHeight };
  });

  return [
    {
      id: "input",
      type: "loom",
      position:
        mode === "freeform"
          ? layout.input ?? { x: 40, y: 165 }
          : { x: stepPositions[0]?.x ?? chartX, y: 30 },
      data: {
        kind: "input",
        direction,
        title: inputLabel(workflow),
        subtitle: "Workflow input",
      },
      selectable: false,
    },
    ...workflow.steps.map((step, index) => {
      const operation = resolveStepOperation(
        step.operationId,
        step.operationPath,
        catalogues,
      )?.operation;
      return {
        id: step.stepId,
        type: "loom",
        position: stepPositions[index],
        data: {
          kind: "step" as const,
          direction,
          title: step.stepId,
          subtitle: `${String(index + 1).padStart(2, "0")} · ${
            operation?.method ??
            shortOperation(
              step.operationId ?? step.operationPath ?? step.workflowId ?? "Operation",
            )
          }`,
          step,
          ...(operation ? { operation } : {}),
        },
        selected: selectedStepId === step.stepId,
      };
    }),
    {
      id: "output",
      type: "loom",
      position:
        mode === "freeform"
          ? layout.output ?? { x: 310 + workflow.steps.length * 280, y: 165 }
          : {
              x: stepPositions.at(-1)?.x ?? chartX,
              y:
                165 +
                (mode === "byapi"
                  ? Math.max(0, ...rowsPerColumn.values())
                  : workflow.steps.length) *
                  rowHeight,
            },
      data: {
        kind: "output",
        direction,
        title: outputLabel(workflow),
        subtitle: "Workflow output",
      },
      selectable: false,
    },
  ];
}

function flowEdge(edge: WorkflowEdge, selected: boolean): Edge {
  const colors = {
    system: "#a9a4cf",
    implicit: "#8d84dc",
    success: "#5b68f6",
    failure: "#c4486b",
    retry: "#d9a900",
    end: "#7454e8",
    data: "#5b68f6",
  };
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.kind === "system" ? undefined : edge.label,
    data: edge,
    selected,
    type: edge.kind === "retry" ? "default" : "smoothstep",
    animated: edge.kind === "implicit",
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: colors[edge.kind],
    },
    style: {
      stroke: colors[edge.kind],
      strokeWidth: selected ? 3.5 : 2,
    },
    labelStyle: {
      fill: colors[edge.kind],
      fontSize: 9,
      fontWeight: 700,
    },
    labelBgStyle: {
      fill: "#ffffff",
      fillOpacity: 0.94,
    },
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 8,
  };
}

function inputLabel(workflow: ArazzoWorkflow): string {
  const keys = Object.keys(workflow.inputs?.properties ?? {});
  return keys.length ? keys.join(", ") : "No inputs";
}

function outputLabel(workflow: ArazzoWorkflow): string {
  const keys = Object.keys(workflow.outputs ?? {});
  return keys.length ? keys.join(", ") : "Complete";
}
