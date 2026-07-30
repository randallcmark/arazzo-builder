"use client";

import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Braces, Check, Workflow } from "lucide-react";
import type { ArazzoStep, ArazzoWorkflow } from "@/lib/arazzo";
import { shortOperation } from "@/lib/arazzo";

type FlowNodeData = {
  kind: "input" | "step" | "output";
  title: string;
  subtitle: string;
  step?: ArazzoStep;
};

function LoomNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div className={`loom-node loom-node--${data.kind} ${selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
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
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { loom: LoomNode };

export function FlowView({
  workflow,
  selectedStepId,
  onStepSelect,
}: {
  workflow: ArazzoWorkflow;
  selectedStepId: string | null;
  onStepSelect: (stepId: string | null) => void;
}) {
  const nodes: Array<Node<FlowNodeData>> = [
    {
      id: "input",
      type: "loom",
      position: { x: 40, y: 160 },
      data: {
        kind: "input",
        title: inputLabel(workflow),
        subtitle: "Workflow input",
      },
      selectable: false,
    },
    ...workflow.steps.map((step, index) => ({
      id: step.stepId,
      type: "loom",
      position: {
        x: 310 + index * 280,
        y: 110 + (index % 2) * 100,
      },
      data: {
        kind: "step" as const,
        title: step.stepId,
        subtitle: shortOperation(
          step.operationId ?? step.operationPath ?? step.workflowId ?? "Operation",
        ),
        step,
      },
      selected: selectedStepId === step.stepId,
    })),
    {
      id: "output",
      type: "loom",
      position: { x: 310 + workflow.steps.length * 280, y: 160 },
      data: {
        kind: "output",
        title: outputLabel(workflow),
        subtitle: "Workflow output",
      },
      selectable: false,
    },
  ];

  const edges: Edge[] = [];
  if (workflow.steps.length) {
    edges.push({
      id: "input-first",
      source: "input",
      target: workflow.steps[0].stepId,
      animated: true,
      style: { stroke: "#8d84dc", strokeWidth: 2 },
    });
  }

  workflow.steps.forEach((step, index) => {
    const next = workflow.steps[index + 1];
    const hasGoto = step.onSuccess?.some((action) => action.type === "goto");
    if (next && !hasGoto) {
      edges.push({
        id: `${step.stepId}-${next.stepId}`,
        source: step.stepId,
        target: next.stepId,
        style: { stroke: "#8d84dc", strokeWidth: 2 },
      });
    }
    for (const action of step.onSuccess ?? []) {
      if (action.type === "goto" && action.stepId) {
        edges.push({
          id: `${step.stepId}-${action.stepId}-success`,
          source: step.stepId,
          target: action.stepId,
          label: action.name ?? "success",
          style: { stroke: "#5b68f6", strokeWidth: 2 },
        });
      }
    }
  });

  const last = workflow.steps.at(-1);
  if (last) {
    edges.push({
      id: "last-output",
      source: last.stepId,
      target: "output",
      style: { stroke: "#8d84dc", strokeWidth: 2 },
    });
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.35}
      maxZoom={1.6}
      onPaneClick={() => onStepSelect(null)}
      onNodeClick={(_, node) => {
        if (node.data.kind === "step") onStepSelect(node.id);
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#cbc7ed" gap={24} size={1} />
      <MiniMap
        nodeColor={(node) =>
          node.data?.kind === "step" ? "#ffd447" : "#beb8f8"
        }
        maskColor="rgba(247, 244, 236, 0.78)"
      />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function inputLabel(workflow: ArazzoWorkflow): string {
  const keys = Object.keys(workflow.inputs?.properties ?? {});
  return keys.length ? keys.join(", ") : "No inputs";
}

function outputLabel(workflow: ArazzoWorkflow): string {
  const keys = Object.keys(workflow.outputs ?? {});
  return keys.length ? keys.join(", ") : "Complete";
}
