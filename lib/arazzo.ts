import {
  isMap,
  isSeq,
  parseDocument,
  type Document,
  type Node,
  type ParsedNode,
} from "yaml";

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
  criteria?: Array<{ condition?: string }>;
  retryAfter?: number;
  retryLimit?: number;
};

export type ArazzoStep = {
  stepId: string;
  description?: string;
  operationId?: string;
  operationPath?: string;
  workflowId?: string;
  parameters?: Array<{ name?: string; in?: string; value?: unknown }>;
  requestBody?: unknown;
  successCriteria?: Array<{ condition?: string }>;
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
  for (const workflow of spec.workflows) {
    const workflowPath = `workflows.${workflow.workflowId || "unknown"}`;
    if (!workflow.workflowId) {
      diagnostics.push({
        severity: "error",
        message: "Every workflow requires a workflowId.",
        path: workflowPath,
      });
    } else if (!ID_PATTERN.test(workflow.workflowId)) {
      diagnostics.push({
        severity: "warning",
        message: `Workflow ID "${workflow.workflowId}" should use letters, numbers, hyphens, or underscores.`,
        path: workflowPath,
      });
    } else if (workflowIds.has(workflow.workflowId)) {
      diagnostics.push({
        severity: "error",
        message: `Duplicate workflow ID "${workflow.workflowId}".`,
        path: workflowPath,
      });
    }
    workflowIds.add(workflow.workflowId);

    if (!Array.isArray(workflow.steps) || !workflow.steps.length) {
      diagnostics.push({
        severity: "error",
        message: `Workflow "${workflow.workflowId}" needs at least one step.`,
        path: `${workflowPath}.steps`,
      });
      continue;
    }

    const stepIds = new Set<string>();
    for (const step of workflow.steps) {
      if (!step.stepId) {
        diagnostics.push({
          severity: "error",
          message: `A step in "${workflow.workflowId}" is missing stepId.`,
          path: `${workflowPath}.steps`,
        });
        continue;
      }
      if (stepIds.has(step.stepId)) {
        diagnostics.push({
          severity: "error",
          message: `Duplicate step ID "${step.stepId}" in "${workflow.workflowId}".`,
          path: `${workflowPath}.steps.${step.stepId}`,
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
          path: `${workflowPath}.steps.${step.stepId}`,
        });
      }
    }

    for (const step of workflow.steps) {
      for (const action of [...(step.onSuccess ?? []), ...(step.onFailure ?? [])]) {
        if (action.type === "goto" && action.stepId && !stepIds.has(action.stepId)) {
          diagnostics.push({
            severity: "error",
            message: `Step "${step.stepId}" points to unknown step "${action.stepId}".`,
            path: `${workflowPath}.steps.${step.stepId}`,
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

export function reorderWorkflowStep(
  source: string,
  workflowId: string,
  stepId: string,
  direction: -1 | 1,
): string {
  const document = parseDocument(source, {
    prettyErrors: true,
    keepSourceTokens: true,
  });
  if (document.errors.length) {
    throw new Error("Fix YAML syntax errors before reordering steps.");
  }

  const steps = workflowStepsNode(document, workflowId);
  const currentIndex = steps.items.findIndex(
    (item) => isMap(item) && item.get("stepId") === stepId,
  );
  const targetIndex = currentIndex + direction;
  if (
    currentIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= steps.items.length
  ) {
    return source;
  }

  const [step] = steps.items.splice(currentIndex, 1);
  steps.items.splice(targetIndex, 0, step);
  return document.toString({ lineWidth: 0 });
}

export function materializeImplicitConnection(
  source: string,
  workflowId: string,
  sourceStepId: string,
  targetStepId: string,
): string {
  const document = parseDocument(source, {
    prettyErrors: true,
    keepSourceTokens: true,
  });
  if (document.errors.length) {
    throw new Error("Fix YAML syntax errors before editing connections.");
  }

  const step = workflowStepNode(document, workflowId, sourceStepId);
  step.set(
    "onSuccess",
    document.createNode([
      {
        name: `Continue to ${targetStepId}`,
        type: "goto",
        stepId: targetStepId,
      },
    ]),
  );
  return document.toString({ lineWidth: 0 });
}

export function updateWorkflowAction(
  source: string,
  workflowId: string,
  stepId: string,
  channel: "onSuccess" | "onFailure",
  actionIndex: number,
  patch: { name?: string; condition?: string },
): string {
  const document = parseDocument(source, {
    prettyErrors: true,
    keepSourceTokens: true,
  });
  if (document.errors.length) {
    throw new Error("Fix YAML syntax errors before editing connections.");
  }

  const step = workflowStepNode(document, workflowId, stepId);
  const actions = step.get(channel, true);
  if (!isSeq(actions)) throw new Error(`The step has no ${channel} actions.`);
  const action = actions.items[actionIndex];
  if (!isMap(action)) throw new Error("The selected action could not be edited.");

  if (patch.name !== undefined) action.set("name", patch.name);
  if (patch.condition !== undefined) {
    const criteria = action.get("criteria", true);
    if (patch.condition.trim()) {
      if (isSeq(criteria) && criteria.items.length) {
        const firstCriterion = criteria.items[0];
        if (isMap(firstCriterion)) {
          firstCriterion.set("condition", patch.condition.trim());
        } else {
          criteria.items[0] = document.createNode({
            condition: patch.condition.trim(),
          });
        }
      } else {
        action.set(
          "criteria",
          document.createNode([{ condition: patch.condition.trim() }]),
        );
      }
    } else {
      if (isSeq(criteria) && criteria.items.length > 1) {
        criteria.items.splice(0, 1);
      } else {
        action.delete("criteria");
      }
    }
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
    workflow.set("x-loom-layout", document.createNode(layout));
  } else {
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

export function workflowToFlowchart(
  workflow: ArazzoWorkflow,
  direction: "LR" | "TB" = "LR",
): string {
  const lines = [
    `flowchart ${direction}`,
    "  classDef step fill:#ffffff,stroke:#5b68f6,color:#20204b,stroke-width:1.5px",
    "  classDef endpoint fill:#e7e5ff,stroke:#8d84dc,color:#20204b,stroke-width:1.5px",
    '  INPUT(["Inputs"]):::endpoint',
  ];

  for (const [index, step] of workflow.steps.entries()) {
    const operation = step.operationId ?? step.operationPath ?? step.workflowId ?? "step";
    lines.push(
      `  ${safeId(step.stepId)}["${index + 1}. ${safeLabel(step.stepId)}<br/><small>${safeLabel(shortOperation(operation))}</small>"]:::step`,
    );
  }
  lines.push('  OUTPUT(["Outputs"]):::endpoint');

  if (workflow.steps.length) {
    lines.push(`  INPUT --> ${safeId(workflow.steps[0].stepId)}`);
  }

  workflow.steps.forEach((step, index) => {
    const explicitSuccess = (step.onSuccess ?? []).some(
      (action) => action.type === "goto" || action.type === "end",
    );
    const next = workflow.steps[index + 1];
    if (next && !explicitSuccess) {
      lines.push(`  ${safeId(step.stepId)} --> ${safeId(next.stepId)}`);
    }
    for (const action of step.onSuccess ?? []) {
      if (action.type === "goto" && action.stepId) {
        lines.push(
          `  ${safeId(step.stepId)} -->|"${safeLabel(action.name ?? "success")}"| ${safeId(action.stepId)}`,
        );
      } else if (action.type === "end") {
        lines.push(`  ${safeId(step.stepId)} -->|"end"| OUTPUT`);
      }
    }
    for (const action of step.onFailure ?? []) {
      if (action.type === "goto" && action.stepId) {
        lines.push(
          `  ${safeId(step.stepId)} -.->|"${safeLabel(action.name ?? "failure")}"| ${safeId(action.stepId)}`,
        );
      }
    }
  });

  const last = workflow.steps.at(-1);
  const lastEnds = last?.onSuccess?.some((action) => action.type === "end");
  if (last && !lastEnds) {
    lines.push(`  ${safeId(last.stepId)} --> OUTPUT`);
  }

  return lines.join("\n");
}

export function workflowToSequence(
  spec: ArazzoSpec,
  workflow: ArazzoWorkflow,
): string {
  const sources = new Map(spec.sourceDescriptions.map((source) => [source.name, source]));
  const participants = new Set<string>();
  for (const step of workflow.steps) {
    participants.add(sourceForStep(step) || "API");
  }

  const lines = ["sequenceDiagram", "  autonumber", "  participant User"];
  for (const participant of participants) {
    lines.push(`  participant ${safeId(participant)} as ${safeLabel(participant)}`);
  }
  lines.push(`  Note over User: ${safeLabel(workflow.summary ?? workflow.workflowId)}`);

  for (const step of workflow.steps) {
    const sourceName = sourceForStep(step) || "API";
    const source = sources.get(sourceName);
    const target = safeId(sourceName);
    const operation = step.operationId ?? step.operationPath ?? step.workflowId ?? step.stepId;
    lines.push(`  User->>+${target}: ${safeLabel(shortOperation(operation))}`);
    const criterion = step.successCriteria?.[0]?.condition ?? "Response";
    lines.push(`  ${target}-->>-User: ${safeLabel(criterion)}`);
    if (step.outputs && Object.keys(step.outputs).length) {
      lines.push(
        `  Note right of User: ${safeLabel(Object.keys(step.outputs).join(", "))}`,
      );
    }
    if (source?.url) {
      lines.push(`  %% ${source.url}`);
    }
  }
  return lines.join("\n");
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
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/[<>]/g, "")
    .replace(/\n/g, " ");
}

export type YamlDocument = Document<ParsedNode, true> & {
  contents: Node;
};
