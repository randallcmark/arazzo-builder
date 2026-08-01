"use client";

import {
  ArrowDownToLine,
  Braces,
  ChevronDown,
  ChevronsDownUp,
  ChevronUp,
  ClipboardCopy,
  Printer,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ArazzoSpec, ArazzoWorkflow } from "@/lib/arazzo";
import type { ApiCatalogue } from "@/lib/openapi";
import {
  sequenceCallDetails,
  sequenceToMermaid,
  type SequenceCallDetail,
} from "@/lib/sequence";

export function SequenceCallLog({
  spec,
  workflow,
  catalogues,
  selectedStepId,
  onStepSelect,
  onCopyMarkdown,
  onCopyMermaid,
}: {
  spec: ArazzoSpec;
  workflow: ArazzoWorkflow;
  catalogues: ApiCatalogue[];
  selectedStepId: string | null;
  onStepSelect: (stepId: string) => void;
  onCopyMarkdown: (markdown: string) => void;
  onCopyMermaid: (mermaid: string) => void;
}) {
  const details = useMemo(
    () => sequenceCallDetails(spec, workflow, catalogues),
    [catalogues, spec, workflow],
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(selectedStepId ? [selectedStepId] : []),
  );
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const inputEntries = Object.entries(workflow.inputs?.properties ?? {});
  const outputEntries = Object.entries(workflow.outputs ?? {});

  // Expanding the newly-selected step's card is a render-time state
  // adjustment (React's recommended alternative to setState-in-an-effect);
  // scrolling it into view is a genuine DOM side effect and stays in one.
  const [lastSelectedStepId, setLastSelectedStepId] = useState(selectedStepId);
  if (selectedStepId !== lastSelectedStepId) {
    setLastSelectedStepId(selectedStepId);
    if (selectedStepId) {
      const stepId = selectedStepId;
      setExpanded((current) => (current.has(stepId) ? current : new Set(current).add(stepId)));
    }
  }

  useEffect(() => {
    if (!selectedStepId) return;
    cardRefs.current[selectedStepId]?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [selectedStepId]);

  const toggle = (stepId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const printAll = () => {
    const previouslyExpanded = expanded;
    setExpanded(new Set(details.map((detail) => detail.step.stepId)));
    window.requestAnimationFrame(() => {
      window.print();
      setExpanded(previouslyExpanded);
    });
  };

  return (
    <div className="sequence-call-log">
      <div className="call-log-toolbar">
        <button className="quiet-button" onClick={() => setExpanded(new Set())}>
          <ChevronsDownUp size={13} />
          Collapse all
        </button>
        <button
          className="quiet-button"
          onClick={() =>
            onCopyMarkdown(
              details.map((detail) => callDetailMarkdown(detail)).join("\n\n"),
            )
          }
        >
          <ClipboardCopy size={13} />
          Copy as Markdown
        </button>
        <button
          className="quiet-button"
          onClick={() => onCopyMermaid(sequenceToMermaid(spec, workflow, catalogues))}
        >
          <Braces size={13} />
          Copy as Mermaid
        </button>
        <button className="quiet-button" onClick={printAll}>
          <Printer size={13} />
          Print
        </button>
      </div>

      <div className="call-log-body">
        <nav className="call-log-nav" aria-label="Steps on this page">
          <p>On this page</p>
          {inputEntries.length > 0 && <div className="call-log-nav-marker">Inputs</div>}
          {details.map((detail) => (
            <button
              key={detail.step.stepId}
              className={`call-log-nav-item ${
                detail.step.stepId === selectedStepId ? "is-active" : ""
              }`}
              onClick={() => onStepSelect(detail.step.stepId)}
            >
              <span>{String(detail.index + 1).padStart(2, "0")}</span>
              <span>{detail.step.stepId}</span>
              {detail.operation && <small>{detail.operation.method}</small>}
            </button>
          ))}
          {outputEntries.length > 0 && <div className="call-log-nav-marker">Outputs</div>}
        </nav>

        <div className="call-log-main">
          <div>
            <h2>{workflow.summary || workflow.workflowId}</h2>
            {workflow.description && <p className="call-log-summary">{workflow.description}</p>}
          </div>

          {inputEntries.length > 0 && (
            <div className="call-log-card call-log-inputs">
              <span className="call-log-eyebrow">Given these inputs</span>
              <div className="call-log-input-list">
                {inputEntries.map(([name, value]) => {
                  const property =
                    typeof value === "object" && value !== null
                      ? (value as Record<string, unknown>)
                      : {};
                  const required = workflow.inputs?.required?.includes(name);
                  return (
                    <div key={name}>
                      <code>{name}</code>
                      <span className="call-log-input-meta">
                        {[typeof property.type === "string" ? property.type : null, required ? "required" : "optional"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {details.map((detail) => (
            <CallLogCard
              key={detail.step.stepId}
              detail={detail}
              expanded={expanded.has(detail.step.stepId)}
              selected={detail.step.stepId === selectedStepId}
              onToggle={() => toggle(detail.step.stepId)}
              onSelect={() => onStepSelect(detail.step.stepId)}
              cardRef={(element) => {
                cardRefs.current[detail.step.stepId] = element;
              }}
            />
          ))}

          {outputEntries.length > 0 && (
            <div className="call-log-card call-log-outputs">
              <span className="call-log-eyebrow">The workflow returns</span>
              <div className="call-log-output-list">
                {outputEntries.map(([name, expression]) => (
                  <div key={name}>
                    <code>{name}</code>
                    <ArrowDownToLine size={11} />
                    <code className="call-log-output-expression">{expression}</code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CallLogCard({
  detail,
  expanded,
  selected,
  onToggle,
  onSelect,
  cardRef,
}: {
  detail: SequenceCallDetail;
  expanded: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  cardRef: (element: HTMLDivElement | null) => void;
}) {
  const { step, index, participant, operation, requestBindings, contentType, statusCode, outputs } = detail;
  return (
    <div
      className={`call-log-card call-log-call ${selected ? "is-selected" : ""}`}
      ref={cardRef}
    >
      <button
        className="call-log-call-header"
        onClick={() => {
          onSelect();
          onToggle();
        }}
        aria-expanded={expanded}
      >
        <span className="call-log-step-number">{String(index + 1).padStart(2, "0")}</span>
        {operation && (
          <b className={`http-method http-method--${operation.method.toLowerCase()}`}>
            {operation.method}
          </b>
        )}
        <code>{operation?.path ?? step.workflowId ?? step.operationId ?? step.operationPath}</code>
        <span className="call-log-step-id">· {step.stepId}</span>
        <span className="call-log-source">{participant.label}</span>
        {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      {expanded && (
        <div className="call-log-call-body">
          <div className="call-log-request">
            <span className="call-log-eyebrow">Request</span>
            <div className="call-log-code-block">
              <div>
                {operation?.method ?? ""} {operation?.path ?? ""}
              </div>
              {requestBindings.map((binding, bindingIndex) => (
                <div key={`${binding.target}:${bindingIndex}`} className="call-log-code-line">
                  {binding.target} = <span className="call-log-code-value">{binding.value}</span>
                </div>
              ))}
              {contentType && <div className="call-log-code-line">Content-Type: {contentType}</div>}
            </div>
            {(step.description || operation?.summary) && (
              <p>{step.description ?? operation?.summary}</p>
            )}
          </div>
          <div className="call-log-response">
            <span className="call-log-eyebrow call-log-eyebrow--response">Response</span>
            <div className="call-log-response-status">
              {statusCode ? <b className="call-log-status-badge">{statusCode}</b> : <b className="call-log-status-badge">—</b>}
              <span>{statusCode ? "Successful response" : "No explicit status expected"}</span>
            </div>
            {Object.keys(outputs).length > 0 && (
              <div className="call-log-code-block">
                {Object.entries(outputs).map(([name, expression]) => (
                  <div key={name} className="call-log-code-line">
                    {expression} <span className="call-log-code-arrow">→</span> {name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function callDetailMarkdown(detail: SequenceCallDetail): string {
  const { step, index, participant, operation, requestBindings, statusCode, outputs } = detail;
  const lines = [
    `### ${String(index + 1).padStart(2, "0")} · ${step.stepId}${
      operation ? ` — ${operation.method} ${operation.path}` : ""
    }`,
    `_${participant.label}_`,
  ];
  if (requestBindings.length) {
    lines.push("", "**Request**");
    lines.push(...requestBindings.map((binding) => `- ${binding.target} ← ${binding.value}`));
  }
  if (statusCode || Object.keys(outputs).length) {
    lines.push("", "**Response**");
    if (statusCode) lines.push(`- ${statusCode}`);
    lines.push(
      ...Object.entries(outputs).map(([name, expression]) => `- ${name} ← ${expression}`),
    );
  }
  return lines.join("\n");
}
