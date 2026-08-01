"use client";

import {
  ArrowDownToLine,
  ArrowUpRight,
  Play,
  Server,
  Workflow,
} from "lucide-react";
import { useMemo, type KeyboardEvent } from "react";
import type { ArazzoSpec, ArazzoWorkflow } from "@/lib/arazzo";
import type { ApiCatalogue } from "@/lib/openapi";
import {
  sequenceCallDetails,
  sequenceLanes,
  type SequenceCallDetail,
  type SequenceLane,
} from "@/lib/sequence";

export function SequenceDiagram({
  spec,
  workflow,
  catalogues,
  selectedStepId,
  onStepSelect,
}: {
  spec: ArazzoSpec;
  workflow: ArazzoWorkflow;
  catalogues: ApiCatalogue[];
  selectedStepId: string | null;
  onStepSelect: (stepId: string) => void;
}) {
  const lanes = useMemo(
    () => sequenceLanes(spec, workflow, catalogues),
    [catalogues, spec, workflow],
  );
  const details = useMemo(
    () => sequenceCallDetails(spec, workflow, catalogues),
    [catalogues, spec, workflow],
  );
  const laneIndex = useMemo(
    () => new Map(lanes.map((lane, index) => [lane.key, index])),
    [lanes],
  );
  const laneTemplate = `repeat(${lanes.length}, minmax(200px, 260px))`;
  const inputEntries = Object.entries(workflow.inputs?.properties ?? {});
  const outputEntries = Object.entries(workflow.outputs ?? {});

  return (
    <div
      className="sequence-diagram"
      aria-label="Sequence diagram of workflow calls"
    >
      <div className="sequence-lane-header" style={{ gridTemplateColumns: laneTemplate }}>
        {lanes.map((lane) => (
          <LaneCard key={lane.key} lane={lane} />
        ))}
      </div>

      <div className="sequence-diagram-body">
        <div
          className="sequence-lifelines"
          style={{ gridTemplateColumns: laneTemplate }}
          aria-hidden="true"
        >
          {lanes.map((lane) => (
            <span key={lane.key} className="sequence-lifeline" />
          ))}
        </div>

        {inputEntries.length > 0 && (
          <div className="sequence-io-strip">
            <span className="sequence-io-label">Inputs</span>
            {inputEntries.map(([name]) => (
              <code key={name}>{name}</code>
            ))}
          </div>
        )}

        {details.map((detail) => (
          <SequenceBand
            key={detail.step.stepId}
            detail={detail}
            laneTemplate={laneTemplate}
            targetColumn={laneIndex.get(detail.participant.key) ?? 1}
            selected={detail.step.stepId === selectedStepId}
            onSelect={() => onStepSelect(detail.step.stepId)}
          />
        ))}

        {outputEntries.length > 0 && (
          <div className="sequence-io-strip">
            <span className="sequence-io-label">Outputs</span>
            {outputEntries.map(([name, expression]) => (
              <span key={name} className="sequence-io-pair">
                <code>{name}</code>
                <span>←</span>
                <code>{expression}</code>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LaneCard({ lane }: { lane: SequenceLane }) {
  const Icon = lane.kind === "runner" ? Play : lane.kind === "workflow" ? Workflow : Server;
  return (
    <div className={`sequence-lane-card sequence-lane-card--${lane.kind}`}>
      <Icon size={13} />
      <span>
        <strong>{lane.label}</strong>
        <small>{lane.sublabel}</small>
      </span>
    </div>
  );
}

function SequenceBand({
  detail,
  laneTemplate,
  targetColumn,
  selected,
  onSelect,
}: {
  detail: SequenceCallDetail;
  laneTemplate: string;
  targetColumn: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { step, index, participant, operation, requestBindings, statusCode, outputs } = detail;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      className={`sequence-band ${selected ? "is-selected" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      aria-pressed={selected}
      aria-label={`Inspect ${step.stepId}`}
    >
      <div className="sequence-band-grid" style={{ gridTemplateColumns: laneTemplate }}>
        {targetColumn > 0 && (
          <div
            className="sequence-activation-bar"
            style={{ gridColumn: targetColumn + 1, gridRow: "1 / 3" }}
            aria-hidden="true"
          />
        )}
        {targetColumn > 0 && (
          <div
            className="sequence-band-connector"
            style={{ gridColumn: `1 / ${targetColumn + 2}`, gridRow: 1 }}
            aria-hidden="true"
          >
            <span className="sequence-connector-line sequence-connector-line--request" />
            <span className="sequence-connector-line sequence-connector-line--response" />
          </div>
        )}
        <div
          className="sequence-band-cell sequence-band-cell--runner"
          style={{ gridColumn: 1, gridRow: 2 }}
        >
          <span className="sequence-step-number">{String(index + 1).padStart(2, "0")}</span>
          <strong>{step.stepId}</strong>
        </div>
        <div
          className="sequence-band-cell sequence-band-cell--target"
          style={{ gridColumn: targetColumn + 1, gridRow: 2 }}
        >
          {operation ? (
            <div className="sequence-call-heading">
              <b className={`http-method http-method--${operation.method.toLowerCase()}`}>
                {operation.method}
              </b>
              <code>{operation.path}</code>
            </div>
          ) : step.workflowId ? (
            <div className="sequence-call-heading">
              <b className="sequence-badge sequence-badge--workflow">
                <Workflow size={11} />
              </b>
              <code>{step.workflowId}</code>
            </div>
          ) : (
            <div className="sequence-call-heading">
              <b className="sequence-badge sequence-badge--unresolved">?</b>
              <code className="sequence-target">
                {step.operationId ?? step.operationPath ?? "Operation"}
              </code>
            </div>
          )}
          <div className="sequence-band-chips">
            {requestBindings.slice(0, 3).map((binding, bindingIndex) => (
              <span className="sequence-chip" key={`${binding.target}:${bindingIndex}`}>
                <ArrowUpRight size={9} />
                {binding.target}
              </span>
            ))}
            {statusCode && (
              <span className="sequence-chip sequence-chip--status">{statusCode}</span>
            )}
            {Object.keys(outputs).map((name) => (
              <span className="sequence-chip sequence-chip--output" key={name}>
                <ArrowDownToLine size={9} />
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
      <span className="visually-hidden">
        calls {participant.label}
      </span>
    </div>
  );
}
