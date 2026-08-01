"use client";

import {
  ArrowRight,
  Braces,
  CheckCircle2,
  ChevronDown,
  GitBranch,
} from "lucide-react";
import type { ArazzoAction, ArazzoStep, ArazzoWorkflow } from "@/lib/arazzo";
import { resolveStepOperation, type ApiCatalogue } from "@/lib/openapi";
import {
  bindingsFromStep,
  requestContentType,
  stepRequestBindings,
  type WorkflowRequestBinding,
} from "@/lib/workflow-detail";
import type { WorkflowEdge } from "@/lib/workflow-graph";
import { OpenApiOperationInspector } from "./OpenApiOperationInspector";

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
    const operationDetails = resolveStepOperation(
      step.operationId,
      step.operationPath,
      catalogues,
    );
    const requestBindings = stepRequestBindings(step);
    const dependencies = requestBindings.flatMap((binding) =>
      binding.expressions.map((expression) => ({
        expression,
        target: binding.target,
      })),
    );
    return (
      <aside className="step-inspector">
        <InspectorHeader
          eyebrow="Selected step"
          title={step.stepId}
          onClose={onClose}
        />
        <div className="inspector-body">
          <section className="inspector-overview">
            <span>Workflow position</span>
            <div className="inspector-position">
              <strong>{String(stepIndex + 1).padStart(2, "0")}</strong>
              <p>
                of {String(workflow.steps.length).padStart(2, "0")} calls in
                <br />
                {workflow.workflowId}
              </p>
            </div>
            {step.description && <p>{step.description}</p>}
          </section>

          {operationDetails ? (
            <OpenApiOperationInspector
              catalogue={operationDetails.catalogue}
              operation={operationDetails.operation}
            />
          ) : (
            <section>
              <span>Operation target</span>
              <code>{step.operationId ?? step.operationPath ?? step.workflowId}</code>
              <small className="inspector-muted">
                Connect the referenced OpenAPI document to resolve its HTTP contract.
              </small>
            </section>
          )}

          <section>
            <span>Arazzo invocation</span>
            <code>{step.operationId ?? step.operationPath ?? step.workflowId}</code>
          </section>

          {requestBindings.length ? (
            <section>
              <span>Request assembled by this step</span>
              {requestContentType(step) && (
                <div className="inspector-inline-meta">
                  <Braces size={13} />
                  {requestContentType(step)}
                </div>
              )}
              <BindingList bindings={requestBindings} />
            </section>
          ) : (
            <section>
              <span>Request assembled by this step</span>
              <p>No Arazzo parameter or request-body overrides are declared.</p>
            </section>
          )}

          {dependencies.length > 0 && (
            <section>
              <span>Data dependencies</span>
              <div className="dependency-list">
                {dependencies.map((dependency, index) => (
                  <div key={`${dependency.expression}:${dependency.target}:${index}`}>
                    <code>{dependency.expression}</code>
                    <ArrowRight size={12} />
                    <code>{dependency.target}</code>
                  </div>
                ))}
              </div>
            </section>
          )}

          <ResponseHandling step={step} />

          {(step.onSuccess?.length || step.onFailure?.length) && (
            <section>
              <span>Flow control</span>
              <ActionList label="On success" actions={step.onSuccess ?? []} />
              <ActionList label="On failure" actions={step.onFailure ?? []} />
            </section>
          )}
        </div>
      </aside>
    );
  }

  if (!selectedEdge) return null;
  const sourceStep = workflow.steps.find(
    (step) => step.stepId === selectedEdge.sourceStepId,
  );
  const targetStep = workflow.steps.find(
    (step) => step.stepId === selectedEdge.targetStepId,
  );
  const exchangedBindings =
    sourceStep && targetStep
      ? bindingsFromStep(targetStep, sourceStep.stepId)
      : [];

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

        {exchangedBindings.length > 0 && (
          <section>
            <span>Exchange between steps</span>
            <p>
              Values captured by {sourceStep?.stepId} are injected into the next
              API request.
            </p>
            <BindingList bindings={exchangedBindings} />
          </section>
        )}

        {sourceStep?.outputs && (
          <section>
            <span>Available source outputs</span>
            <KeyValueList values={sourceStep.outputs} />
          </section>
        )}

        {selectedEdge.kind === "implicit" ? (
          <section>
            <span>Implicit progression</span>
            <p>
              This route is inferred because the calls are adjacent and no explicit
              success action overrides their order.
            </p>
          </section>
        ) : (
          <ActionDetails action={selectedEdge.action} />
        )}

        {!selectedEdge.targetStepId && workflow.outputs && (
          <section>
            <span>Workflow result</span>
            <KeyValueList values={workflow.outputs} />
          </section>
        )}
      </div>
    </aside>
  );
}

function ResponseHandling({ step }: { step: ArazzoStep }) {
  return (
    <section>
      <span>Response handling</span>
      {step.successCriteria?.length ? (
        <div className="criteria-list">
          {step.successCriteria.map((criterion, index) => (
            <div key={index}>
              <CheckCircle2 size={13} />
              <div>
                <code>{criterion.condition}</code>
                {(criterion.type || criterion.context) && (
                  <small>
                    {[criterion.type, criterion.context].filter(Boolean).join(" · ")}
                  </small>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p>No explicit success criteria.</p>
      )}
      {step.outputs && (
        <div className="inspector-subsection">
          <h3>Captured outputs</h3>
          <KeyValueList values={step.outputs} />
        </div>
      )}
    </section>
  );
}

function BindingList({ bindings }: { bindings: WorkflowRequestBinding[] }) {
  return (
    <div className="binding-list">
      {bindings.map((binding, index) => (
        <article key={`${binding.target}:${index}`}>
          <div>
            <b>{binding.kind === "body" ? "BODY" : "PARAM"}</b>
            <code>{binding.target}</code>
          </div>
          <code>{binding.value}</code>
        </article>
      ))}
    </div>
  );
}

function KeyValueList({ values }: { values: Record<string, string> }) {
  return (
    <div className="key-value-list">
      {Object.entries(values).map(([name, expression]) => (
        <div key={name}>
          <strong>{name}</strong>
          <code>{expression}</code>
        </div>
      ))}
    </div>
  );
}

function ActionList({ label, actions }: { label: string; actions: ArazzoAction[] }) {
  if (!actions.length) return null;
  return (
    <div className="inspector-subsection">
      <h3>{label}</h3>
      {actions.map((action, index) => (
        <ActionSummary action={action} key={`${action.name ?? action.type}:${index}`} />
      ))}
    </div>
  );
}

function ActionSummary({ action }: { action: ArazzoAction }) {
  return (
    <article className="action-summary">
      <div>
        <b>{action.type}</b>
        <strong>{action.name ?? actionTarget(action)}</strong>
      </div>
      <code>{actionTarget(action)}</code>
      {action.criteria?.map((criterion, index) => (
        <code key={index}>{criterion.condition}</code>
      ))}
      {action.type === "retry" && (
        <small>
          {action.retryLimit ?? 1} attempts
          {action.retryAfter === undefined ? "" : ` · ${action.retryAfter}s delay`}
        </small>
      )}
    </article>
  );
}

function ActionDetails({ action }: { action?: ArazzoAction }) {
  if (!action) return null;
  return (
    <section>
      <span>Declared action</span>
      <ActionSummary action={action} />
    </section>
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

function actionTarget(action: ArazzoAction) {
  return action.stepId ?? action.workflowId ?? action.type;
}

function edgeTitle(edge: WorkflowEdge) {
  if (edge.kind === "implicit") return "Next step";
  return edge.action?.name ?? edge.kind;
}
