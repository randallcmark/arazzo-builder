import {
  isMap,
  isSeq,
  parseDocument,
  type Document,
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

export function sourceForStep(step: ArazzoStep): string | null {
  const expression = step.operationId ?? step.operationPath ?? "";
  const match = expression.match(/\$sourceDescriptions\.([A-Za-z0-9_-]+)/);
  return match?.[1] ?? null;
}

export function shortOperation(operation: string): string {
  const parts = operation.split(".");
  return parts.at(-1) || operation;
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
