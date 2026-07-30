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
import type { ArazzoStep, ArazzoWorkflow } from "@/lib/arazzo";
import { shortOperation } from "@/lib/arazzo";
import { workflowEdges, type WorkflowEdge } from "@/lib/workflow-graph";
import {
  defaultWorkflowLayout,
  embeddedWorkflowLayout,
  readStoredWorkflowLayout,
  writeStoredWorkflowLayout,
  type WorkflowNodeLayout,
} from "@/lib/workflow-layout";

type FlowNodeData = {
  kind: "input" | "step" | "output";
  direction: "horizontal" | "vertical";
  title: string;
  subtitle: string;
  step?: ArazzoStep;
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
      </div>
      <Handle type="source" position={vertical ? Position.Bottom : Position.Right} />
    </div>
  );
}

const nodeTypes = { loom: LoomNode };

export function FlowView({
  workflow,
  selectedStepId,
  selectedEdgeId,
  onStepSelect,
  onEdgeSelect,
  mode = "flow",
  layoutScope,
  onLayoutChange,
}: {
  workflow: ArazzoWorkflow;
  selectedStepId: string | null;
  selectedEdgeId: string | null;
  onStepSelect: (stepId: string | null) => void;
  onEdgeSelect: (edgeId: string | null) => void;
  mode?: "flow" | "chart";
  layoutScope: string;
  onLayoutChange?: (layout: WorkflowNodeLayout) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const graphEdges = useMemo(() => workflowEdges(workflow), [workflow]);

  useEffect(() => {
    const savedLayout =
      mode === "flow"
        ? readStoredWorkflowLayout(layoutScope, workflow.workflowId) ??
          embeddedWorkflowLayout(workflow) ??
          defaultWorkflowLayout(workflow)
        : {};
    setNodes(
      workflowNodes(
        workflow,
        mode,
        savedLayout,
        selectedStepId,
      ),
    );
  }, [layoutScope, mode, selectedStepId, setNodes, workflow]);

  const edges = useMemo(
    () =>
      graphEdges.map((edge) =>
        flowEdge(edge, selectedEdgeId === edge.id),
      ),
    [graphEdges, selectedEdgeId],
  );

  return (
    <div className={`workflow-graph workflow-graph--${mode}`}>
      {mode === "flow" && (
        <div className="flow-canvas-note">
          <Move size={14} />
          <span>Drag cards to arrange this view. Execution is unchanged.</span>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        nodesDraggable={mode === "flow"}
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
          if (mode !== "flow") return;
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
  mode: "flow" | "chart",
  layout: WorkflowNodeLayout,
  selectedStepId: string | null,
): Array<Node<FlowNodeData>> {
  const direction: FlowNodeData["direction"] =
    mode === "chart" ? "vertical" : "horizontal";
  const chartX = 310;
  return [
    {
      id: "input",
      type: "loom",
      position:
        mode === "chart"
          ? { x: chartX, y: 30 }
          : layout.input ?? { x: 40, y: 165 },
      data: {
        kind: "input",
        direction,
        title: inputLabel(workflow),
        subtitle: "Workflow input",
      },
      selectable: false,
    },
    ...workflow.steps.map((step, index) => ({
      id: step.stepId,
      type: "loom",
      position:
        layout[step.stepId] ??
        (mode === "chart"
          ? { x: chartX, y: 165 + index * 145 }
          : { x: 310 + index * 280, y: 110 + (index % 2) * 100 }),
      data: {
        kind: "step" as const,
        direction,
        title: step.stepId,
        subtitle: `${String(index + 1).padStart(2, "0")} · ${shortOperation(
          step.operationId ?? step.operationPath ?? step.workflowId ?? "Operation",
        )}`,
        step,
      },
      selected: selectedStepId === step.stepId,
    })),
    {
      id: "output",
      type: "loom",
      position:
        mode === "chart"
          ? { x: chartX, y: 165 + workflow.steps.length * 145 }
          : layout.output ?? {
              x: 310 + workflow.steps.length * 280,
              y: 165,
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
