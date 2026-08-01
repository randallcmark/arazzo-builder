import {
  isMap,
  isSeq,
  parseDocument,
  type Document,
} from "yaml";
import {
  resolveStepOperation,
  type ApiCatalogue,
} from "./openapi";
import {
  requestContentType,
  stepRequestBindings,
} from "./workflow-detail";

export type ArazzoSource = {
  name: string;
  url: string;
  type?: "openapi" | "arazzo" | "asyncapi" | string;
};

export type ArazzoAction = {
  name?: string;
  type: "goto" | "end" | "retry" | string;
  stepId?: string;
  workflowId?: string;
  criteria?: ArazzoCriterion[];
  retryAfter?: number;
  retryLimit?: number;
};

export type ArazzoCriterion = {
  condition?: string;
  type?: string;
  context?: string;
};

export type ArazzoStep = {
  stepId: string;
  description?: string;
  operationId?: string;
  operationPath?: string;
  workflowId?: string;
  parameters?: Array<{ name?: string; in?: string; value?: unknown }>;
  requestBody?: unknown;
  successCriteria?: ArazzoCriterion[];
  outputs?: Record<string, string>;
  onSuccess?: ArazzoAction[];
  onFailure?: ArazzoAction[];
};

export type ArazzoCanvasPosition = {
  x: number;
  y: number;
};

export type ArazzoWorkflowLayout = {
  version: 1;
  nodes: Record<string, ArazzoCanvasPosition>;
};

export type ArazzoWorkflow = {
  workflowId: string;
  summary?: string;
  description?: string;
  inputs?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
  steps: ArazzoStep[];
  outputs?: Record<string, string>;
  "x-arazzo-builder-layout"?: ArazzoWorkflowLayout;
  /** @deprecated Read only for documents created before the public rename. */
  "x-loom-layout"?: ArazzoWorkflowLayout;
};

export type ArazzoSpec = {
  arazzo: string;
  info: {
    title: string;
    version: string;
    summary?: string;
    description?: string;
  };
  sourceDescriptions: ArazzoSource[];
  workflows: ArazzoWorkflow[];
  components?: Record<string, unknown>;
};

export type Diagnostic = {
  severity: "error" | "warning";
  message: string;
  path?: string;
};

export type ParseResult = {
  spec: ArazzoSpec | null;
  diagnostics: Diagnostic[];
};

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function parseArazzo(source: string): ParseResult {
  const document = parseDocument(source, {
    prettyErrors: true,
    keepSourceTokens: true,
  });
  const diagnostics: Diagnostic[] = document.errors.map((error) => ({
    severity: "error",
    message: error.message,
  }));

  if (document.errors.length || !document.contents || !isMap(document.contents)) {
    return { spec: null, diagnostics };
  }

  const value = document.toJS() as Partial<ArazzoSpec>;
  if (!value || typeof value !== "object") {
    return {
      spec: null,
      diagnostics: [
        ...diagnostics,
        { severity: "error", message: "The document must contain a YAML object." },
      ],
    };
  }

  const shapeDiagnostics = workspaceShapeDiagnostics(value);
  if (shapeDiagnostics.length) {
    return {
      spec: null,
      diagnostics: [...diagnostics, ...shapeDiagnostics],
    };
  }

  const spec = value as ArazzoSpec;
  diagnostics.push(...validateArazzo(spec));
  return { spec, diagnostics };
}

export function validateArazzo(spec: ArazzoSpec): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!spec.arazzo) {
    diagnostics.push({
      severity: "error",
      message: "Missing required Arazzo version.",
      path: "arazzo",
    });
  } else if (!/^1\.(0|1)\.\d+$/.test(spec.arazzo)) {
    diagnostics.push({
      severity: "warning",
      message: `Arazzo ${spec.arazzo} has not been exercised by this workspace.`,
      path: "arazzo",
    });
  }

  if (!spec.info?.title || !spec.info?.version) {
    diagnostics.push({
      severity: "error",
      message: "info.title and info.version are required.",
      path: "info",
    });
  }

  if (!Array.isArray(spec.sourceDescriptions) || !spec.sourceDescriptions.length) {
    diagnostics.push({
      severity: "error",
      message: "At least one source description is required.",
      path: "sourceDescriptions",
    });
  }

  if (!Array.isArray(spec.workflows) || !spec.workflows.length) {
    diagnostics.push({
      severity: "error",
      message: "At least one workflow is required.",
      path: "workflows",
    });
    return diagnostics;
  }

  const workflowIds = new Set<string>();
  for (const [workflowIndex, workflow] of spec.workflows.entries()) {
    const workflowPath = `workflows[${workflowIndex}]`;
    if (!workflow.workflowId) {
      diagnostics.push({
        severity: "error",
        message: "Every workflow requires a workflowId.",
        path: workflowPath,
      });
    } else {
      if (!ID_PATTERN.test(workflow.workflowId)) {
        diagnostics.push({
          severity: "warning",
          message: `Workflow ID "${workflow.workflowId}" should use letters, numbers, hyphens, or underscores.`,
          path: `${workflowPath}.workflowId`,
        });
      }
      if (workflowIds.has(workflow.workflowId)) {
        diagnostics.push({
          severity: "error",
          message: `Duplicate workflow ID "${workflow.workflowId}".`,
          path: `${workflowPath}.workflowId`,
        });
      }
      workflowIds.add(workflow.workflowId);
    }

    if (!Array.isArray(workflow.steps) || !workflow.steps.length) {
      diagnostics.push({
        severity: "error",
        message: `Workflow "${workflow.workflowId}" needs at least one step.`,
        path: `${workflowPath}.steps`,
      });
      continue;
    }

    const stepIds = new Set<string>();
    for (const [stepIndex, step] of workflow.steps.entries()) {
      const stepPath = `${workflowPath}.steps[${stepIndex}]`;
      if (!step.stepId) {
        diagnostics.push({
          severity: "error",
          message: `A step in "${workflow.workflowId}" is missing stepId.`,
          path: stepPath,
        });
        continue;
      }
      if (stepIds.has(step.stepId)) {
        diagnostics.push({
          severity: "error",
          message: `Duplicate step ID "${step.stepId}" in "${workflow.workflowId}".`,
          path: `${stepPath}.stepId`,
        });
      }
      stepIds.add(step.stepId);

      const targetCount = [step.operationId, step.operationPath, step.workflowId].filter(
        Boolean,
      ).length;
      if (targetCount !== 1) {
        diagnostics.push({
          severity: "error",
          message: `Step "${step.stepId}" must define exactly one of operationId, operationPath, or workflowId.`,
          path: stepPath,
        });
      }
    }

    for (const [stepIndex, step] of workflow.steps.entries()) {
      for (const action of [...(step.onSuccess ?? []), ...(step.onFailure ?? [])]) {
        if (action.type === "goto" && action.stepId && !stepIds.has(action.stepId)) {
          diagnostics.push({
            severity: "error",
            message: `Step "${step.stepId}" points to unknown step "${action.stepId}".`,
            path: `${workflowPath}.steps[${stepIndex}]`,
          });
        }
      }
    }
  }

  return diagnostics;
}

export function insertWorkflow(source: string, workflow: ArazzoWorkflow): string {
  const document = parseDocument(source, {
    prettyErrors: true,
    keepSourceTokens: true,
  });

  if (document.errors.length) {
    throw new Error("Fix YAML syntax errors before inserting a workflow.");
  }

  const workflows = document.get("workflows", true);
  if (!isSeq(workflows)) {
    throw new Error("The document does not contain a workflows sequence.");
  }

  workflows.add(document.createNode(workflow));
  return document.toString({ lineWidth: 0 });
}

export function upsertSourceDescription(
  source: string,
  sourceDescription: ArazzoSource,
): string {
  const document = parseDocument(source, {
    prettyErrors: true,
    keepSourceTokens: true,
  });

  if (document.errors.length) {
    throw new Error("Fix YAML syntax errors before adding an API source.");
  }

  const sources = document.get("sourceDescriptions", true);
  if (!isSeq(sources)) {
    throw new Error("The document does not contain a sourceDescriptions sequence.");
  }

  const existing = sources.items.find(
    (item) => isMap(item) && item.get("name") === sourceDescription.name,
  );
  if (existing && isMap(existing)) {
    existing.set("type", sourceDescription.type ?? "openapi");
    existing.set("url", sourceDescription.url);
  } else {
    sources.add(document.createNode(sourceDescription));
  }

  return document.toString({ lineWidth: 0 });
}

export function setWorkflowLayoutExtension(
  source: string,
  workflowId: string,
  layout: ArazzoWorkflowLayout | null,
): string {
  const document = parseDocument(source, {
    prettyErrors: true,
    keepSourceTokens: true,
  });
  if (document.errors.length) {
    throw new Error("Fix YAML syntax errors before updating the embedded layout.");
  }

  const workflow = workflowNode(document, workflowId);
  if (layout) {
    workflow.set("x-arazzo-builder-layout", document.createNode(layout));
    workflow.delete("x-loom-layout");
  } else {
    workflow.delete("x-arazzo-builder-layout");
    workflow.delete("x-loom-layout");
  }
  return document.toString({ lineWidth: 0 });
}

export function findWorkflowStepRange(
  source: string,
  workflowId: string,
  stepId: string,
): { start: number; end: number } | null {
  const document = parseDocument(source, {
    prettyErrors: true,
    keepSourceTokens: true,
  });
  if (document.errors.length) return null;

  try {
    const step = workflowStepNode(document, workflowId, stepId);
    return step.range
      ? { start: step.range[0], end: step.range[1] }
      : null;
  } catch {
    return null;
  }
}

export function findWorkflowStepAtOffset(
  source: string,
  offset: number,
): { workflowId: string; stepId: string } | null {
  const document = parseDocument(source, {
    prettyErrors: true,
    keepSourceTokens: true,
  });
  if (document.errors.length) return null;

  const workflows = document.get("workflows", true);
  if (!isSeq(workflows)) return null;
  for (const workflow of workflows.items) {
    if (!isMap(workflow)) continue;
    const workflowId = workflow.get("workflowId");
    const steps = workflow.get("steps", true);
    if (typeof workflowId !== "string" || !isSeq(steps)) continue;
    for (const step of steps.items) {
      if (!isMap(step) || !step.range) continue;
      const stepId = step.get("stepId");
      if (
        typeof stepId === "string" &&
        offset >= step.range[0] &&
        offset <= step.range[1]
      ) {
        return { workflowId, stepId };
      }
    }
  }
  return null;
}

function workflowStepsNode(
  document: Document.Parsed,
  workflowId: string,
) {
  const workflow = workflowNode(document, workflowId);
  const steps = workflow.get("steps", true);
  if (!isSeq(steps)) throw new Error(`Workflow "${workflowId}" has no steps.`);
  return steps;
}

function workflowNode(
  document: Document.Parsed,
  workflowId: string,
) {
  const workflows = document.get("workflows", true);
  if (!isSeq(workflows)) throw new Error("The document has no workflows sequence.");
  const workflow = workflows.items.find(
    (item) => isMap(item) && item.get("workflowId") === workflowId,
  );
  if (!isMap(workflow)) throw new Error(`Workflow "${workflowId}" was not found.`);
  return workflow;
}

function workflowStepNode(
  document: Document.Parsed,
  workflowId: string,
  stepId: string,
) {
  const steps = workflowStepsNode(document, workflowId);
  const step = steps.items.find(
    (item) => isMap(item) && item.get("stepId") === stepId,
  );
  if (!isMap(step)) throw new Error(`Step "${stepId}" was not found.`);
  return step;
}

export function workflowToSequence(
  spec: ArazzoSpec,
  workflow: ArazzoWorkflow,
  catalogues: ApiCatalogue[] = [],
): string {
  const participants = new Map<string, SequenceParticipant>();
  for (const step of workflow.steps) {
    const participant = participantForStep(spec, step, catalogues);
    participants.set(participant.key, participant);
  }

  const lines = [
    "sequenceDiagram",
    "  autonumber",
    "  actor Initiator as Initiator",
    "  participant Client as Integrating application",
  ];
  for (const participant of participants.values()) {
    lines.push(
      `  participant ${safeId(participant.key)} as ${safeLabel(participant.label)}`,
    );
  }
  lines.push(
    "  Note right of Client: Initiator and client are visualization context",
  );
  lines.push(
    `  Initiator-->>Client: Start · ${safeLabel(workflow.summary ?? workflow.workflowId)}`,
  );
  const inputs = workflowInputLines(workflow);
  if (inputs.length) {
    lines.push(
      `  Note right of Client: ${safeMultilineLabel(["Workflow inputs", ...inputs])}`,
    );
  }

  for (const [index, step] of workflow.steps.entries()) {
    const participant = participantForStep(spec, step, catalogues);
    const target = safeId(participant.key);
    const operation = step.operationId ?? step.operationPath ?? step.workflowId ?? step.stepId;
    const resolved = resolveStepOperation(
      step.operationId,
      step.operationPath,
      catalogues,
    );
    const nestedWorkflow = step.workflowId
      ? spec.workflows.find((candidate) => candidate.workflowId === step.workflowId)
      : undefined;
    const requestLabel = nestedWorkflow
      ? `Run workflow · ${nestedWorkflow.summary ?? nestedWorkflow.workflowId}`
      : resolved
        ? `${resolved.operation.method} ${resolved.operation.path} · ${resolved.operation.summary}`
        : shortOperation(operation);
    const callDetails = [
      `Step ${String(index + 1).padStart(2, "0")} · ${step.stepId}`,
      step.description ?? resolved?.operation.description ?? resolved?.operation.summary,
    ].filter((value): value is string => Boolean(value));

    const bindings = stepRequestBindings(step);
    if (bindings.length) {
      const visibleBindings = bindings
        .slice(0, 8)
        .map((binding) =>
          `${nestedWorkflow ? binding.target.replace(/^parameter\./, "") : binding.target} ← ${sequenceValue(binding.value)}`,
        );
      if (bindings.length > visibleBindings.length) {
        visibleBindings.push(`+${bindings.length - visibleBindings.length} more bindings`);
      }
      const contentType = requestContentType(step);
      callDetails.push(
        nestedWorkflow
          ? "Passes workflow inputs"
          : contentType
            ? `Sends · ${contentType}`
            : "Request bindings",
        ...visibleBindings,
      );
    }
    lines.push(`  Note right of Client: ${safeMultilineLabel(callDetails)}`);

    lines.push(`  Client->>+${target}: ${safeLabel(requestLabel)}`);
    const criteria = (step.successCriteria ?? [])
      .map((criterion) => criterion.condition)
      .filter((condition): condition is string => Boolean(condition));
    const status = statusCodeFromCriteria(criteria);
    const response = resolved?.operation.responses?.find(
      (candidate) => candidate.status === status,
    );
    const responseLabel = nestedWorkflow
      ? `Returns · ${Object.keys(step.outputs ?? {}).join(", ") || "workflow outputs"}`
      : status
        ? `${status}${response?.description ? ` · ${response.description}` : ""}`
        : "Response";
    lines.push(`  ${target}-->>-Client: ${safeLabel(responseLabel)}`);
    const responseDetails = [
      ...criteria.map((criterion) => `Expects · ${criterion}`),
      ...Object.entries(step.outputs ?? {}).map(
        ([name, expression]) =>
          `${nestedWorkflow ? "Maps output" : "Captures"} · ${name} ← ${sequenceValue(expression)}`,
      ),
    ];
    if (responseDetails.length) {
      lines.push(
        `  Note right of Client: ${safeMultilineLabel(responseDetails)}`,
      );
    }
    const transitions = transitionLines(step);
    if (transitions.length) {
      lines.push(
        `  Note right of Client: ${safeMultilineLabel(transitions)}`,
      );
    }
  }

  if (workflow.outputs && Object.keys(workflow.outputs).length) {
    lines.push(
      `  Note right of Client: ${safeMultilineLabel([
        "Workflow outputs",
        ...Object.entries(workflow.outputs).map(
          ([name, expression]) => `${name} ← ${sequenceValue(expression)}`,
        ),
      ])}`,
    );
  }
  const outcome = Object.keys(workflow.outputs ?? {});
  lines.push(
    `  Client-->>Initiator: Complete · ${safeLabel(
      outcome.length ? outcome.join(", ") : workflow.workflowId,
    )}`,
  );
  return lines.join("\n");
}

type SequenceParticipant = {
  key: string;
  label: string;
};

function participantForStep(
  spec: ArazzoSpec,
  step: ArazzoStep,
  catalogues: ApiCatalogue[],
): SequenceParticipant {
  if (step.workflowId) {
    const nested = spec.workflows.find(
      (candidate) => candidate.workflowId === step.workflowId,
    );
    return {
      key: `workflow_${step.workflowId}`,
      label: `${nested?.summary ?? step.workflowId} [workflow]`,
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
    const source = spec.sourceDescriptions.find(
      (candidate) => candidate.name === sourceName,
    );
    return {
      key: sourceName,
      label: catalogue
        ? `${catalogue.title} [${sourceName}]`
        : `${sourceName} [${source?.type === "asyncapi" ? "AsyncAPI" : "OpenAPI"}]`,
    };
  }
  return { key: "API", label: "API" };
}

function workflowInputLines(workflow: ArazzoWorkflow): string[] {
  const required = new Set(workflow.inputs?.required ?? []);
  return Object.entries(workflow.inputs?.properties ?? {}).map(([name, value]) => {
    const property =
      typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : {};
    const type = typeof property.type === "string" ? ` · ${property.type}` : "";
    return `${name}${type}${required.has(name) ? " · required" : " · optional"}`;
  });
}

function sequenceValue(value: string): string {
  const input = value.match(/^\$inputs\.([A-Za-z0-9_.-]+)$/);
  if (input) return `input · ${input[1]}`;
  const stepOutput = value.match(
    /^\$steps\.([A-Za-z0-9_-]+)\.outputs\.([A-Za-z0-9_.-]+)$/,
  );
  if (stepOutput) return `${stepOutput[1]} output · ${stepOutput[2]}`;
  const nestedOutput = value.match(/^\$outputs\.([A-Za-z0-9_.-]+)$/);
  if (nestedOutput) return `workflow output · ${nestedOutput[1]}`;
  const responseBody = value.match(/^\$response\.body#(.*)$/);
  if (responseBody) return `response body · ${responseBody[1] || "/"}`;
  return value;
}

function statusCodeFromCriteria(criteria: string[]): string | undefined {
  for (const condition of criteria) {
    const match = condition.match(/\$statusCode\s*={2,3}\s*['"]?(\d{3})/);
    if (match) return match[1];
  }
  return undefined;
}

function transitionLines(step: ArazzoStep): string[] {
  const describe = (channel: "success" | "failure", action: ArazzoAction) => {
    const target = action.stepId ?? action.workflowId ?? action.type;
    const policy =
      action.type === "retry"
        ? ` · ${action.retryLimit ?? 1} attempts${
            action.retryAfter === undefined ? "" : ` · ${action.retryAfter}s delay`
          }`
        : "";
    const criteria = (action.criteria ?? [])
      .map((criterion) => criterion.condition)
      .filter(Boolean)
      .join(" AND ");
    return `On ${channel}: ${action.name ?? action.type} -> ${target}${policy}${
      criteria ? ` · when ${criteria}` : ""
    }`;
  };
  return [
    ...(step.onSuccess ?? []).map((action) => describe("success", action)),
    ...(step.onFailure ?? []).map((action) => describe("failure", action)),
  ];
}

export function sourceForStep(step: ArazzoStep): string | null {
  const expression = step.operationId ?? step.operationPath ?? "";
  const match = expression.match(/\$sourceDescriptions\.([A-Za-z0-9_-]+)/);
  return match?.[1] ?? null;
}

export function shortOperation(operation: string): string {
  const parts = operation.split(".");
  return parts.at(-1) || operation;
}

function safeId(value: string): string {
  return `node_${value.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

function safeLabel(value: string): string {
  return String(value)
    .replace(/<=/g, "≤")
    .replace(/>=/g, "≥")
    .replace(/</g, "‹")
    .replace(/>/g, "›")
    // Mermaid sequence labels treat semicolons as statement terminators and
    // hashes as comments. Named HTML entities therefore break otherwise valid
    // JSON (for example, &quot;), so use readable Unicode equivalents instead.
    .replace(/&/g, "＆")
    .replace(/"/g, "″")
    .replace(/#/g, "＃")
    .replace(/;/g, "；")
    .replace(/[\r\n\u2028\u2029]+/g, " ");
}

function safeMultilineLabel(values: string[]): string {
  return values.map(safeLabel).join("<br/>");
}

function workspaceShapeDiagnostics(value: unknown): Diagnostic[] {
  if (!isRecord(value)) {
    return [
      {
        severity: "error",
        message: "The document must contain a YAML object.",
      },
    ];
  }

  const diagnostics: Diagnostic[] = [];
  if (typeof value.arazzo !== "string") {
    diagnostics.push({
      severity: "error",
      message: "arazzo must be a string version.",
      path: "arazzo",
    });
  }
  if (
    !isRecord(value.info) ||
    typeof value.info.title !== "string" ||
    typeof value.info.version !== "string" ||
    !optionalStringFieldsAreValid(value.info, ["summary", "description"])
  ) {
    diagnostics.push({
      severity: "error",
      message: "info requires string title and version values.",
      path: "info",
    });
  }
  if (!Array.isArray(value.sourceDescriptions)) {
    diagnostics.push({
      severity: "error",
      message: "sourceDescriptions must be a sequence.",
      path: "sourceDescriptions",
    });
  } else {
    value.sourceDescriptions.forEach((source, index) => {
      if (
        !isRecord(source) ||
        typeof source.name !== "string" ||
        typeof source.url !== "string" ||
        (source.type !== undefined && typeof source.type !== "string")
      ) {
        diagnostics.push({
          severity: "error",
          message: "Every source description requires string name and url values.",
          path: `sourceDescriptions[${index}]`,
        });
      }
    });
  }

  if (!Array.isArray(value.workflows)) {
    diagnostics.push({
      severity: "error",
      message: "workflows must be a sequence.",
      path: "workflows",
    });
    return diagnostics;
  }

  value.workflows.forEach((workflow, workflowIndex) => {
    const workflowPath = `workflows[${workflowIndex}]`;
    if (!isRecord(workflow)) {
      diagnostics.push({
        severity: "error",
        message: "Every workflow must be an object.",
        path: workflowPath,
      });
      return;
    }
    if (typeof workflow.workflowId !== "string") {
      diagnostics.push({
        severity: "error",
        message: "Every workflow requires a string workflowId.",
        path: `${workflowPath}.workflowId`,
      });
    }
    if (!optionalStringFieldsAreValid(workflow, [
      "summary",
      "description",
    ])) {
      diagnostics.push({
        severity: "error",
        message: "Workflow summary and description values must be strings.",
        path: workflowPath,
      });
    }
    if (
      workflow.inputs !== undefined &&
      (!isRecord(workflow.inputs) ||
        (workflow.inputs.type !== undefined &&
          typeof workflow.inputs.type !== "string") ||
        (workflow.inputs.properties !== undefined &&
          !isRecord(workflow.inputs.properties)) ||
        (workflow.inputs.required !== undefined &&
          (!Array.isArray(workflow.inputs.required) ||
            !workflow.inputs.required.every(
              (name: unknown) => typeof name === "string",
            ))))
    ) {
      diagnostics.push({
        severity: "error",
        message: "Workflow inputs must use an object schema.",
        path: `${workflowPath}.inputs`,
      });
    }
    if (
      workflow.outputs !== undefined &&
      !isStringRecord(workflow.outputs)
    ) {
      diagnostics.push({
        severity: "error",
        message: "Workflow outputs must map names to string expressions.",
        path: `${workflowPath}.outputs`,
      });
    }
    if (!Array.isArray(workflow.steps)) {
      diagnostics.push({
        severity: "error",
        message: "Workflow steps must be a sequence.",
        path: `${workflowPath}.steps`,
      });
      return;
    }

    workflow.steps.forEach((step, stepIndex) => {
      const stepPath = `${workflowPath}.steps[${stepIndex}]`;
      if (!isRecord(step)) {
        diagnostics.push({
          severity: "error",
          message: "Every workflow step must be an object.",
          path: stepPath,
        });
        return;
      }
      if (typeof step.stepId !== "string") {
        diagnostics.push({
          severity: "error",
          message: "Every workflow step requires a string stepId.",
          path: `${stepPath}.stepId`,
        });
      }
      if (
        !optionalStringFieldsAreValid(step, [
          "description",
          "operationId",
          "operationPath",
          "workflowId",
        ])
      ) {
        diagnostics.push({
          severity: "error",
          message: "Step descriptions and operation references must be strings.",
          path: stepPath,
        });
      }
      for (const field of [
        "parameters",
        "successCriteria",
        "onSuccess",
        "onFailure",
      ]) {
        if (
          step[field] !== undefined &&
          (!Array.isArray(step[field]) ||
            !step[field].every((item: unknown) => isRecord(item)))
        ) {
          diagnostics.push({
            severity: "error",
            message: `${field} must be a sequence of objects.`,
            path: `${stepPath}.${field}`,
          });
        }
      }
      if (
        Array.isArray(step.parameters) &&
        !step.parameters.every(
          (parameter) =>
            isRecord(parameter) &&
            optionalStringFieldsAreValid(parameter, ["name", "in"]),
        )
      ) {
        diagnostics.push({
          severity: "error",
          message: "Parameter names and locations must be strings.",
          path: `${stepPath}.parameters`,
        });
      }
      if (
        Array.isArray(step.successCriteria) &&
        !step.successCriteria.every(
          (criterion) =>
            isRecord(criterion) &&
            optionalStringFieldsAreValid(criterion, ["condition"]),
        )
      ) {
        diagnostics.push({
          severity: "error",
          message: "Success criteria conditions must be strings.",
          path: `${stepPath}.successCriteria`,
        });
      }
      for (const field of ["onSuccess", "onFailure"]) {
        const actions = step[field];
        if (
          Array.isArray(actions) &&
          !actions.every(
            (action) =>
              isRecord(action) &&
              typeof action.type === "string" &&
              optionalStringFieldsAreValid(action, [
                "name",
                "stepId",
                "workflowId",
              ]) &&
              (action.criteria === undefined ||
                (Array.isArray(action.criteria) &&
                  action.criteria.every(
                    (criterion) =>
                      isRecord(criterion) &&
                      optionalStringFieldsAreValid(criterion, ["condition"]),
                  )))
          )
        ) {
          diagnostics.push({
            severity: "error",
            message: `${field} actions must contain string action fields and criteria.`,
            path: `${stepPath}.${field}`,
          });
        }
      }
      if (
        step.outputs !== undefined &&
        !isStringRecord(step.outputs)
      ) {
        diagnostics.push({
          severity: "error",
          message: "Step outputs must map names to string expressions.",
          path: `${stepPath}.outputs`,
        });
      }
    });
  });

  return diagnostics;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

function optionalStringFieldsAreValid(
  value: Record<string, unknown>,
  fields: string[],
): boolean {
  return fields.every(
    (field) => value[field] === undefined || typeof value[field] === "string",
  );
}
