import type { ArazzoSpec, ArazzoStep, ArazzoWorkflow } from "./arazzo";
import { sourceForStep } from "./arazzo";
import {
  resolveStepOperation,
  type ApiCatalogue,
  type OpenApiOperation,
} from "./openapi";
import {
  requestContentType,
  stepRequestBindings,
  type WorkflowRequestBinding,
} from "./workflow-detail";

export type SequenceParticipant = {
  key: string;
  label: string;
  sublabel: string;
  kind: "source" | "workflow";
};

export type SequenceLane =
  | { key: "runner"; label: string; sublabel: string; kind: "runner" }
  | SequenceParticipant;

/**
 * Resolves the participant a step's call actually targets. Deliberately does
 * not invent "Initiator"/"Integrating application" actors: a step either
 * calls a real API (a sourceDescription) or a nested workflow.
 */
export function sequenceParticipant(
  spec: ArazzoSpec,
  step: ArazzoStep,
  catalogues: ApiCatalogue[],
): SequenceParticipant {
  if (step.workflowId) {
    const nested = spec.workflows.find(
      (candidate) => candidate.workflowId === step.workflowId,
    );
    return {
      key: `workflow:${step.workflowId}`,
      label: nested?.summary ?? step.workflowId,
      sublabel: `workflows.${step.workflowId}`,
      kind: "workflow",
    };
  }

  const resolved = resolveStepOperation(
    step.operationId,
    step.operationPath,
    catalogues,
  );
  const declaredSource = sourceForStep(step);
  const fallbackSources = spec.sourceDescriptions.filter(
    (source) => source.type !== "arazzo",
  );
  const sourceName =
    resolved?.catalogue.sourceName ??
    declaredSource ??
    (fallbackSources.length === 1 ? fallbackSources[0].name : undefined);

  if (sourceName) {
    const catalogue = catalogues.find(
      (candidate) => candidate.sourceName === sourceName,
    );
    return {
      key: `source:${sourceName}`,
      label: catalogue?.title ?? sourceName,
      sublabel: `sourceDescriptions.${sourceName}`,
      kind: "source",
    };
  }

  return {
    key: "source:unknown",
    label: "API",
    sublabel: "unresolved",
    kind: "source",
  };
}

/**
 * The lanes a Sequence diagram/call log should show: a single honest
 * "runner" lane for whoever calls the workflow, followed by one lane per
 * distinct real participant, ordered by first appearance in the steps.
 */
export function sequenceLanes(
  spec: ArazzoSpec,
  workflow: ArazzoWorkflow,
  catalogues: ApiCatalogue[],
): SequenceLane[] {
  const runner: SequenceLane = {
    key: "runner",
    label: "This workflow",
    sublabel: "whatever runs it",
    kind: "runner",
  };
  const lanes = new Map<string, SequenceLane>();
  for (const step of workflow.steps) {
    const participant = sequenceParticipant(spec, step, catalogues);
    if (!lanes.has(participant.key)) {
      lanes.set(participant.key, participant);
    }
  }
  return [runner, ...lanes.values()];
}

export function statusCodeFromCriteria(criteria: string[]): string | null {
  for (const condition of criteria) {
    const match = condition.match(/\$statusCode\s*={2,3}\s*['"]?(\d{3})/);
    if (match) return match[1];
  }
  return null;
}

export type SequenceCallDetail = {
  step: ArazzoStep;
  index: number;
  participant: SequenceParticipant;
  operation: OpenApiOperation | null;
  catalogueTitle: string | null;
  requestBindings: WorkflowRequestBinding[];
  contentType: string | null;
  successCriteria: string[];
  statusCode: string | null;
  outputs: Record<string, string>;
};

export function sequenceCallDetail(
  spec: ArazzoSpec,
  workflow: ArazzoWorkflow,
  step: ArazzoStep,
  catalogues: ApiCatalogue[],
): SequenceCallDetail {
  const resolved = resolveStepOperation(
    step.operationId,
    step.operationPath,
    catalogues,
  );
  const successCriteria = (step.successCriteria ?? [])
    .map((criterion) => criterion.condition)
    .filter((condition): condition is string => Boolean(condition));

  return {
    step,
    index: workflow.steps.indexOf(step),
    participant: sequenceParticipant(spec, step, catalogues),
    operation: resolved?.operation ?? null,
    catalogueTitle: resolved?.catalogue.title ?? null,
    requestBindings: stepRequestBindings(step),
    contentType: requestContentType(step),
    successCriteria,
    statusCode: statusCodeFromCriteria(successCriteria),
    outputs: step.outputs ?? {},
  };
}

export function sequenceCallDetails(
  spec: ArazzoSpec,
  workflow: ArazzoWorkflow,
  catalogues: ApiCatalogue[],
): SequenceCallDetail[] {
  return workflow.steps.map((step) =>
    sequenceCallDetail(spec, workflow, step, catalogues),
  );
}
