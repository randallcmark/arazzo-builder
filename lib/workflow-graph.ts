import type { ArazzoAction, ArazzoWorkflow } from "./arazzo";
import { runtimeExpressions, stepRequestBindings } from "./workflow-detail";

export type WorkflowEdgeKind =
  | "system"
  | "implicit"
  | "success"
  | "failure"
  | "retry"
  | "end"
  | "data";

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  kind: WorkflowEdgeKind;
  label?: string;
  sourceStepId?: string;
  targetStepId?: string;
  channel?: "onSuccess" | "onFailure";
  actionIndex?: number;
  action?: ArazzoAction;
};

export function workflowEdges(workflow: ArazzoWorkflow): WorkflowEdge[] {
  if (!workflow.steps.length) return [];

  const edges: WorkflowEdge[] = [
    {
      id: "system:input:first",
      source: "input",
      target: workflow.steps[0].stepId,
      kind: "system",
      targetStepId: workflow.steps[0].stepId,
    },
  ];

  workflow.steps.forEach((step, stepIndex) => {
    const next = workflow.steps[stepIndex + 1];
    const explicitSuccess = (step.onSuccess ?? []).some(
      (action) => action.type === "goto" || action.type === "end",
    );

    if (next && !explicitSuccess) {
      edges.push({
        id: `implicit:${step.stepId}:${next.stepId}`,
        source: step.stepId,
        target: next.stepId,
        kind: "implicit",
        label: "next",
        sourceStepId: step.stepId,
        targetStepId: next.stepId,
      });
    }

    (step.onSuccess ?? []).forEach((action, actionIndex) => {
      const target = action.stepId ?? (action.type === "end" ? "output" : undefined);
      if (!target) return;
      edges.push(
        actionEdge(
          step.stepId,
          target,
          "onSuccess",
          actionIndex,
          action,
        ),
      );
    });

    (step.onFailure ?? []).forEach((action, actionIndex) => {
      const target =
        action.stepId ??
        (action.type === "retry" ? step.stepId : undefined) ??
        (action.type === "end" ? "output" : undefined);
      if (!target) return;
      edges.push(
        actionEdge(
          step.stepId,
          target,
          "onFailure",
          actionIndex,
          action,
        ),
      );
    });

    if (!next && !explicitSuccess) {
      edges.push({
        id: `system:${step.stepId}:output`,
        source: step.stepId,
        target: "output",
        kind: "system",
        label: "complete",
        sourceStepId: step.stepId,
      });
    }
  });

  return edges;
}

export function workflowDataEdges(workflow: ArazzoWorkflow): WorkflowEdge[] {
  const edges = new Map<string, WorkflowEdge>();
  const addEdge = (
    source: string,
    target: string,
    label: string,
    sourceStepId?: string,
    targetStepId?: string,
  ) => {
    const id = `data:${source}:${target}`;
    const existing = edges.get(id);
    if (existing) {
      const labels = new Set((existing.label ?? "").split(", ").filter(Boolean));
      labels.add(label);
      existing.label = Array.from(labels).join(", ");
      return;
    }
    edges.set(id, {
      id,
      source,
      target,
      kind: "data",
      label,
      ...(sourceStepId ? { sourceStepId } : {}),
      ...(targetStepId ? { targetStepId } : {}),
    });
  };

  for (const step of workflow.steps) {
    for (const binding of stepRequestBindings(step)) {
      for (const expression of binding.expressions) {
        const input = expression.match(/^\$inputs\.([A-Za-z0-9_-]+)/);
        if (input) {
          addEdge("input", step.stepId, input[1], undefined, step.stepId);
          continue;
        }
        const output = expression.match(
          /^\$steps\.([A-Za-z0-9_-]+)\.outputs\.([A-Za-z0-9_-]+)/,
        );
        if (output) {
          addEdge(output[1], step.stepId, output[2], output[1], step.stepId);
        }
      }
    }
  }

  for (const [name, value] of Object.entries(workflow.outputs ?? {})) {
    for (const expression of runtimeExpressions(value)) {
      const output = expression.match(
        /^\$steps\.([A-Za-z0-9_-]+)\.outputs\.([A-Za-z0-9_-]+)/,
      );
      if (output) addEdge(output[1], "output", name, output[1]);
    }
  }

  return Array.from(edges.values());
}

function actionEdge(
  sourceStepId: string,
  target: string,
  channel: "onSuccess" | "onFailure",
  actionIndex: number,
  action: ArazzoAction,
): WorkflowEdge {
  const kind: WorkflowEdgeKind =
    action.type === "retry"
      ? "retry"
      : action.type === "end"
        ? "end"
        : channel === "onFailure"
          ? "failure"
          : "success";
  return {
    id: `${channel}:${sourceStepId}:${actionIndex}:${target}`,
    source: sourceStepId,
    target,
    kind,
    label: action.name ?? action.type,
    sourceStepId,
    ...(target !== "output" ? { targetStepId: target } : {}),
    channel,
    actionIndex,
    action,
  };
}
