import type {
  ArazzoCanvasPosition,
  ArazzoWorkflow,
  ArazzoWorkflowLayout,
} from "./arazzo";
import { siteConfig } from "../config/site";

export type WorkflowNodeLayout = Record<string, ArazzoCanvasPosition>;

export function defaultWorkflowLayout(
  workflow: ArazzoWorkflow,
): WorkflowNodeLayout {
  return {
    input: { x: 40, y: 165 },
    ...Object.fromEntries(
      workflow.steps.map((step, index) => [
        step.stepId,
        { x: 310 + index * 280, y: 110 + (index % 2) * 100 },
      ]),
    ),
    output: {
      x: 310 + workflow.steps.length * 280,
      y: 165,
    },
  };
}

export function embeddedWorkflowLayout(
  workflow: ArazzoWorkflow,
): WorkflowNodeLayout | null {
  const extension = workflow["x-loom-layout"];
  if (
    !extension ||
    extension.version !== 1 ||
    !extension.nodes ||
    typeof extension.nodes !== "object"
  ) {
    return null;
  }

  const nodes = Object.fromEntries(
    Object.entries(extension.nodes).filter(
      ([, position]) =>
        position &&
        Number.isFinite(position.x) &&
        Number.isFinite(position.y),
    ),
  );
  return Object.keys(nodes).length ? nodes : null;
}

export function workflowLayoutExtension(
  nodes: WorkflowNodeLayout,
): ArazzoWorkflowLayout {
  return { version: 1, nodes };
}

export function readStoredWorkflowLayout(
  scope: string,
  workflowId: string,
): WorkflowNodeLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(layoutKey(scope, workflowId));
    if (!value) return null;
    const parsed = JSON.parse(value) as WorkflowNodeLayout;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredWorkflowLayout(
  scope: string,
  workflowId: string,
  layout: WorkflowNodeLayout,
) {
  try {
    window.localStorage.setItem(
      layoutKey(scope, workflowId),
      JSON.stringify(layout),
    );
  } catch {
    // Layout storage is optional; editing must continue if storage is unavailable.
  }
}

function layoutKey(scope: string, workflowId: string) {
  return `${siteConfig.storageNamespace}:layout:${scope}:${workflowId}`;
}
