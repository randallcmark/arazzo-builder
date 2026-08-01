"use client";

import { Braces, X } from "lucide-react";
import type { ArazzoStep, ArazzoWorkflow } from "@/lib/arazzo";
import { resolveStepOperation, type ApiCatalogue } from "@/lib/openapi";
import {
  requestContentType,
  stepRequestBindings,
} from "@/lib/workflow-detail";

export function SequenceStepBubble({
  workflow,
  step,
  catalogues,
  onClose,
}: {
  workflow: ArazzoWorkflow;
  step: ArazzoStep;
  catalogues: ApiCatalogue[];
  onClose: () => void;
}) {
  const operation = resolveStepOperation(
    step.operationId,
    step.operationPath,
    catalogues,
  )?.operation;
  const bindings = stepRequestBindings(step);
  const position = workflow.steps.indexOf(step) + 1;

  return (
    <aside
      className="sequence-step-bubble"
      role="dialog"
      aria-label={`Sequence details for ${step.stepId}`}
    >
      <header>
        <div>
          <p className="view-eyebrow">
            Call {String(position).padStart(2, "0")} of {workflow.steps.length}
          </p>
          <h2>{step.stepId}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close sequence details"
        >
          <X size={15} />
        </button>
      </header>

      <div className="sequence-step-bubble-body">
        {operation ? (
          <div className="sequence-operation-heading">
            <b className={`http-method http-method--${operation.method.toLowerCase()}`}>
              {operation.method}
            </b>
            <div>
              <code>{operation.path}</code>
              <strong>{operation.summary}</strong>
            </div>
          </div>
        ) : (
          <code className="sequence-target">
            {step.workflowId ?? step.operationId ?? step.operationPath ?? "Operation"}
          </code>
        )}

        {step.description && <p>{step.description}</p>}

        {bindings.length > 0 && (
          <section>
            <span>
              <Braces size={12} />
              {requestContentType(step) ?? "Request values"}
            </span>
            <div className="sequence-binding-list">
              {bindings.slice(0, 8).map((binding, index) => (
                <div key={`${binding.target}:${index}`}>
                  <code>{binding.target}</code>
                  <code>{binding.value}</code>
                </div>
              ))}
              {bindings.length > 8 && <small>+{bindings.length - 8} more values</small>}
            </div>
          </section>
        )}

        {step.successCriteria?.length ? (
          <section>
            <span>Expected response</span>
            {step.successCriteria.map((criterion, index) => (
              <code key={index}>{criterion.condition}</code>
            ))}
          </section>
        ) : null}

        {step.outputs && Object.keys(step.outputs).length > 0 && (
          <section>
            <span>Captured outputs</span>
            {Object.entries(step.outputs).map(([name, expression]) => (
              <div className="sequence-output" key={name}>
                <strong>{name}</strong>
                <code>{expression}</code>
              </div>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}
