"use client";

import {
  ArrowDownToLine,
  Braces,
  CircleCheck,
  CircleX,
  ExternalLink,
} from "lucide-react";
import type { ArazzoSource, ArazzoWorkflow } from "@/lib/arazzo";
import { shortOperation, sourceForStep } from "@/lib/arazzo";

export function DocumentationView({
  workflow,
  sources,
}: {
  workflow: ArazzoWorkflow;
  sources: ArazzoSource[];
}) {
  return (
    <div className="docs-view">
      <header className="docs-heading">
        <p className="view-eyebrow">Workflow documentation</p>
        <h2>{workflow.summary || workflow.workflowId}</h2>
        <p>{workflow.description || "No extended description has been provided."}</p>
        <div className="docs-meta">
          <span>{workflow.steps.length} steps</span>
          <span>{Object.keys(workflow.inputs?.properties ?? {}).length} inputs</span>
          <span>{Object.keys(workflow.outputs ?? {}).length} outputs</span>
        </div>
      </header>

      {workflow.inputs?.properties && (
        <section className="docs-section">
          <div className="docs-section-title">
            <Braces size={17} />
            <div>
              <small>Before you begin</small>
              <h3>Workflow inputs</h3>
            </div>
          </div>
          <div className="property-grid">
            {Object.entries(workflow.inputs.properties).map(([name, schema]) => (
              <div className="property-card" key={name}>
                <code>{name}</code>
                <span>{schemaDescription(schema)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="docs-section">
        <div className="docs-section-title">
          <ArrowDownToLine size={17} />
          <div>
            <small>The choreography</small>
            <h3>Steps</h3>
          </div>
        </div>
        <div className="step-timeline">
          {workflow.steps.map((step, index) => {
            const sourceName = sourceForStep(step);
            const source = sources.find((candidate) => candidate.name === sourceName);
            return (
              <article className="step-document" key={step.stepId}>
                <div className="step-rail">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="step-document-body">
                  <div className="step-document-heading">
                    <div>
                      <small>{shortOperation(step.operationId ?? step.operationPath ?? "Operation")}</small>
                      <h4>{step.stepId}</h4>
                    </div>
                    {source && (
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.name}
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  {step.description && <p>{step.description}</p>}

                  <div className="step-facts">
                    {step.parameters?.length ? (
                      <div>
                        <span>Parameters</span>
                        {step.parameters.map((parameter, parameterIndex) => (
                          <code key={`${parameter.name}-${parameterIndex}`}>
                            {parameter.name}: {String(parameter.value ?? "—")}
                          </code>
                        ))}
                      </div>
                    ) : null}
                    {step.successCriteria?.length ? (
                      <div>
                        <span>
                          <CircleCheck size={13} /> Success
                        </span>
                        {step.successCriteria.map((criterion, criterionIndex) => (
                          <code key={criterionIndex}>{criterion.condition}</code>
                        ))}
                      </div>
                    ) : null}
                    {step.outputs && Object.keys(step.outputs).length ? (
                      <div>
                        <span>Outputs</span>
                        {Object.entries(step.outputs).map(([name, expression]) => (
                          <code key={name}>
                            {name}: {expression}
                          </code>
                        ))}
                      </div>
                    ) : null}
                    {step.onFailure?.length ? (
                      <div>
                        <span>
                          <CircleX size={13} /> Failure path
                        </span>
                        {step.onFailure.map((action, actionIndex) => (
                          <code key={actionIndex}>
                            {action.name || action.type} → {action.stepId || action.type}
                          </code>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function schemaDescription(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "Any value";
  const record = schema as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "value";
  const description =
    typeof record.description === "string" ? record.description : undefined;
  return description ? `${type} · ${description}` : type;
}
