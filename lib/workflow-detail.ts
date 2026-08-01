import type { ArazzoStep } from "./arazzo";

export type WorkflowRequestBinding = {
  target: string;
  value: string;
  expressions: string[];
  kind: "parameter" | "body";
};

export function stepRequestBindings(step: ArazzoStep): WorkflowRequestBinding[] {
  const bindings: WorkflowRequestBinding[] = [];
  for (const parameter of step.parameters ?? []) {
    const name = parameter.name?.trim() || "unnamed";
    const location = parameter.in?.trim() || "parameter";
    bindings.push({
      target: `${location}.${name}`,
      value: formatArazzoValue(parameter.value),
      expressions: runtimeExpressions(parameter.value),
      kind: "parameter",
    });
  }

  const requestBody = asRecord(step.requestBody);
  if (requestBody) {
    if ("payload" in requestBody) {
      for (const entry of flattenPayload(requestBody.payload)) {
        bindings.push({
          target: `body${entry.path ? `.${entry.path}` : ""}`,
          value: formatArazzoValue(entry.value),
          expressions: runtimeExpressions(entry.value),
          kind: "body",
        });
      }
    }
    if (Array.isArray(requestBody.replacements)) {
      for (const replacement of requestBody.replacements) {
        const value = asRecord(replacement);
        if (!value) continue;
        const target =
          typeof value.target === "string"
            ? value.target
            : typeof value.path === "string"
              ? value.path
              : "replacement";
        bindings.push({
          target: target.startsWith("/")
            ? `body#${target}`
            : `body.${target.replace(/^\.?/, "")}`,
          value: formatArazzoValue(value.value),
          expressions: runtimeExpressions(value.value),
          kind: "body",
        });
      }
    }
  }
  return bindings;
}

export function requestContentType(step: ArazzoStep): string | null {
  const requestBody = asRecord(step.requestBody);
  return typeof requestBody?.contentType === "string"
    ? requestBody.contentType
    : null;
}

export function bindingsFromStep(
  targetStep: ArazzoStep,
  sourceStepId: string,
): WorkflowRequestBinding[] {
  const prefix = `$steps.${sourceStepId}.outputs.`;
  return stepRequestBindings(targetStep).filter((binding) =>
    binding.expressions.some((expression) => expression.startsWith(prefix)),
  );
}

export function runtimeExpressions(value: unknown): string[] {
  const expressions = new Set<string>();
  visitValues(value, (candidate) => {
    for (const match of candidate.matchAll(
      /\$(?:inputs|steps|workflows|sourceDescriptions)(?:\.[A-Za-z0-9_-]+)+/g,
    )) {
      expressions.add(match[0]);
    }
  });
  return Array.from(expressions);
}

export function formatArazzoValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "not specified";
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    const json = JSON.stringify(value);
    return json.length > 600 ? `${json.slice(0, 597)}…` : json;
  } catch {
    return "structured value";
  }
}

function flattenPayload(
  value: unknown,
  path = "",
  result: Array<{ path: string; value: unknown }> = [],
): Array<{ path: string; value: unknown }> {
  if (result.length >= 16) return result;
  if (Array.isArray(value)) {
    if (!value.length) result.push({ path, value });
    value.slice(0, 6).forEach((item, index) =>
      flattenPayload(item, `${path}[${index}]`, result),
    );
    return result;
  }
  const record = asRecord(value);
  if (record) {
    const entries = Object.entries(record);
    if (!entries.length) result.push({ path, value });
    for (const [key, item] of entries) {
      flattenPayload(item, path ? `${path}.${key}` : key, result);
      if (result.length >= 16) break;
    }
    return result;
  }
  result.push({ path, value });
  return result;
}

function visitValues(value: unknown, visit: (value: string) => void) {
  if (typeof value === "string") {
    visit(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => visitValues(item, visit));
    return;
  }
  const record = asRecord(value);
  if (record) Object.values(record).forEach((item) => visitValues(item, visit));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
