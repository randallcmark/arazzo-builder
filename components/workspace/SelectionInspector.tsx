"use client";

import { ChevronDown, GitBranch } from "lucide-react";
import type { ArazzoWorkflow } from "@/lib/arazzo";
import {
  operationReferenceParts,
  type ApiCatalogue,
} from "@/lib/openapi";
import type { WorkflowEdge } from "@/lib/workflow-graph";

export function SelectionInspector({
  workflow,
  selectedStepId,
  selectedEdge,
  catalogues,
  onClose,
}: {
  workflow: ArazzoWorkflow;
  selectedStepId: string | null;
  selectedEdge: WorkflowEdge | null;
  catalogues: ApiCatalogue[];
  onClose: () => void;
}) {
  const step = workflow.steps.find(
    (candidate) => candidate.stepId === selectedStepId,
  );

  if (step) {
    const stepIndex = workflow.steps.indexOf(step);
    const operationDetails = resolveCatalogueOperation(
      step.operationId,
      catalogues,
    );
    return (
      <aside className="step-inspector">
        <InspectorHeader
          eyebrow="Selected step"
          title={step.stepId}
          onClose={onClose}
        />
        <div className="inspector-body">
          <section>
            <span>Workflow position</span>
            <p>
              Step {String(stepIndex + 1).padStart(2, "0")} of{" "}
              {String(workflow.steps.length).padStart(2, "0")}
            </p>
          </section>
          <section>
            <span>Operation</span>
            <code>{step.operationId ?? step.operationPath ?? step.workflowId}</code>
          </section>
          {operationDetails && (
            <section className="resolved-operation">
              <span>Resolved from OpenAPI</span>
              <strong>
                {operationDetails.catalogue.title}
                <small>
                  sourceDescriptions.{operationDetails.catalogue.sourceName}
                </small>
              </strong>
              <p>{operationDetails.operation.summary}</p>
              <code>
                {operationDetails.operation.method}{" "}
                {operationDetails.operation.path}
              </code>
              <small>{operationDetails.catalogue.location}</small>
            </section>
          )}
          {step.description && (
            <section>
              <span>Description</span>
              <p>{step.description}</p>
            </section>
          )}
          {step.successCriteria?.length ? (
            <section>
              <span>Success criteria</span>
              {step.successCriteria.map((criterion, index) => (
                <code key={index}>{criterion.condition}</code>
              ))}
            </section>
          ) : null}
          {step.outputs && (
            <section>
              <span>Outputs</span>
              {Object.entries(step.outputs).map(([name, expression]) => (
                <code key={name}>
                  {name} = {expression}
                </code>
              ))}
            </section>
          )}
        </div>
      </aside>
    );
  }

  if (!selectedEdge) return null;
  return (
    <aside className="step-inspector link-inspector" key={selectedEdge.id}>
      <InspectorHeader
        eyebrow="Selected link"
        title={edgeTitle(selectedEdge)}
        onClose={onClose}
      />
      <div className="inspector-body">
        <section>
          <span>Connection</span>
          <div className={`connection-kind connection-kind--${selectedEdge.kind}`}>
            <GitBranch size={14} />
            {selectedEdge.kind}
          </div>
          <div className="connection-route">
            <code>{selectedEdge.sourceStepId ?? selectedEdge.source}</code>
            <span>to</span>
            <code>{selectedEdge.targetStepId ?? "workflow output"}</code>
          </div>
        </section>

        {selectedEdge.kind === "implicit" ? (
          <section>
            <span>Implicit progression</span>
            <p>
              This progression is inferred because these steps are adjacent in
              the workflow.
            </p>
          </section>
        ) : (
          <>
            {selectedEdge.action?.name && (
              <section>
                <span>Action name</span>
                <p>{selectedEdge.action.name}</p>
              </section>
            )}
            {selectedEdge.action?.criteria?.length ? (
              <section>
                <span>Criteria</span>
                {selectedEdge.action.criteria.map((criterion, index) => (
                  <code key={index}>{criterion.condition}</code>
                ))}
              </section>
            ) : (
              <section>
                <span>Criteria</span>
                <p>Unconditional action</p>
              </section>
            )}
            {selectedEdge.kind === "retry" && (
              <section>
                <span>Retry policy</span>
                <p>
                  {selectedEdge.action?.retryLimit ?? 1} attempts
                  {selectedEdge.action?.retryAfter !== undefined
                    ? ` · ${selectedEdge.action.retryAfter}s delay`
                    : ""}
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function InspectorHeader({
  eyebrow,
  title,
  onClose,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <header>
      <div>
        <p className="view-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <button
        className="icon-button"
        onClick={onClose}
        aria-label="Close inspector"
      >
        <ChevronDown size={17} />
      </button>
    </header>
  );
}

function edgeTitle(edge: WorkflowEdge) {
  if (edge.kind === "implicit") return "Next step";
  return edge.action?.name ?? edge.kind;
}

function resolveCatalogueOperation(
  reference: string | undefined,
  catalogues: ApiCatalogue[],
) {
  const parts = operationReferenceParts(reference);
  if (!parts) return null;
  const catalogue = catalogues.find(
    (candidate) => candidate.sourceName === parts.sourceName,
  );
  const operation = catalogue?.operations.find(
    (candidate) => candidate.id === parts.operationId,
  );
  return catalogue && operation ? { catalogue, operation } : null;
}
