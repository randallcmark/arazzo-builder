import type { ArazzoAction, ArazzoWorkflow } from "./arazzo";

export type WorkflowEdgeKind =
  | "system"
  | "implicit"
  | "success"
  | "failure"
  | "retry"
  | "end";

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
