"use client";

import {
  ArrowRight,
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  GitBranch,
  X,
} from "lucide-react";
import { useState } from "react";
import type { ArazzoAction, ArazzoWorkflow } from "@/lib/arazzo";
import { findWorkflowStepRange } from "@/lib/arazzo";
import { resolveStepOperation, type ApiCatalogue } from "@/lib/openapi";
import {
  bindingsFromStep,
  requestContentType,
  stepRequestBindings,
  type WorkflowRequestBinding,
} from "@/lib/workflow-detail";
import type { WorkflowEdge } from "@/lib/workflow-graph";
import { OpenApiOperationInspector } from "./OpenApiOperationInspector";

type StepInspectorTab = "contract" | "data" | "controlFlow" | "yaml";

const stepTabs: Array<{ id: StepInspectorTab; label: string }> = [
  { id: "contract", label: "Contract" },
  { id: "data", label: "Data" },
  { id: "controlFlow", label: "Control flow" },
  { id: "yaml", label: "YAML" },
];

export function SelectionInspector({
  workflow,
  source,
  selectedStepId,
  selectedEdge,
  catalogues,
  onSelectStep,
  onCopy,
  onClose,
}: {
  workflow: ArazzoWorkflow;
  source: string;
  selectedStepId: string | null;
  selectedEdge: WorkflowEdge | null;
  catalogues: ApiCatalogue[];
  onSelectStep: (stepId: string) => void;
  onCopy: (value: string, message: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<StepInspectorTab>("contract");
  const step = workflow.steps.find(
    (candidate) => candidate.stepId === selectedStepId,
  );

  if (step) {
    const stepIndex = workflow.steps.indexOf(step);
    const previousStep = stepIndex > 0 ? workflow.steps[stepIndex - 1] : null;
    const nextStep =
      stepIndex < workflow.steps.length - 1 ? workflow.steps[stepIndex + 1] : null;
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
    const yamlRange = findWorkflowStepRange(source, workflow.workflowId, step.stepId);
    const yamlSnippet = yamlRange ? source.slice(yamlRange.start, yamlRange.end) : null;

    return (
      <aside className="step-inspector">
        <InspectorHeader
          eyebrow={`Step ${String(stepIndex + 1).padStart(2, "0")} of ${String(
            workflow.steps.length,
          ).padStart(2, "0")}`}
          title={step.stepId}
          onClose={onClose}
          stepNav={{
            onPrevious: () => previousStep && onSelectStep(previousStep.stepId),
            onNext: () => nextStep && onSelectStep(nextStep.stepId),
            canPrevious: Boolean(previousStep),
            canNext: Boolean(nextStep),
          }}
        />
        <div className="inspector-tabs" role="tablist" aria-label="Step detail">
          {stepTabs.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "is-active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="inspector-body">
          {tab === "contract" && (
            <>
              {step.description && <p className="inspector-step-description">{step.description}</p>}
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
              {step.successCriteria?.length ? (
                <section>
                  <span>Expected response</span>
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
                </section>
              ) : null}
            </>
          )}

          {tab === "data" && (
            <>
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

              {step.outputs && Object.keys(step.outputs).length > 0 && (
                <section>
                  <span>Captured outputs</span>
                  <KeyValueList values={step.outputs} />
                </section>
              )}
            </>
          )}

          {tab === "controlFlow" &&
            (step.onSuccess?.length || step.onFailure?.length ? (
              <section>
                <span>Flow control</span>
                <ActionList label="On success" actions={step.onSuccess ?? []} />
                <ActionList label="On failure" actions={step.onFailure ?? []} />
              </section>
            ) : (
              <section>
                <span>Flow control</span>
                <p>No explicit onSuccess/onFailure actions are declared.</p>
              </section>
            ))}

          {tab === "yaml" && (
            <section className="inspector-yaml">
              <span>
                {step.stepId}
                <button
                  className="icon-button"
                  onClick={() =>
                    yamlSnippet && onCopy(yamlSnippet, `Copied ${step.stepId} YAML`)
                  }
                  disabled={!yamlSnippet}
                  aria-label="Copy step YAML"
                >
                  <Copy size={13} />
                </button>
              </span>
              {yamlSnippet ? (
                <pre>
                  <code>{yamlSnippet}</code>
                </pre>
              ) : (
                <p>Unable to locate this step in the YAML source.</p>
              )}
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
  stepNav,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  stepNav?: {
    onPrevious: () => void;
    onNext: () => void;
    canPrevious: boolean;
    canNext: boolean;
  };
}) {
  return (
    <header>
      <div>
        <p className="view-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <div className="inspector-header-actions">
        {stepNav && (
          <>
            <button
              className="icon-button"
              onClick={stepNav.onPrevious}
              disabled={!stepNav.canPrevious}
              aria-label="Previous step"
            >
              <ChevronUp size={15} />
            </button>
            <button
              className="icon-button"
              onClick={stepNav.onNext}
              disabled={!stepNav.canNext}
              aria-label="Next step"
            >
              <ChevronDown size={15} />
            </button>
          </>
        )}
        <button
          className="icon-button inspector-close"
          onClick={onClose}
          aria-label="Close inspector"
        >
          <X size={16} />
        </button>
      </div>
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
