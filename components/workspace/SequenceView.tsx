"use client";

import type { ArazzoSpec, ArazzoWorkflow } from "@/lib/arazzo";
import type { ApiCatalogue } from "@/lib/openapi";
import { SequenceCallLog } from "./SequenceCallLog";
import { SequenceDiagram } from "./SequenceDiagram";

export type SequenceDensity = "diagram" | "callLog";

export function SequenceView({
  spec,
  workflow,
  catalogues,
  density,
  selectedStepId,
  onStepSelect,
  onCopyMarkdown,
}: {
  spec: ArazzoSpec;
  workflow: ArazzoWorkflow;
  catalogues: ApiCatalogue[];
  density: SequenceDensity;
  selectedStepId: string | null;
  onStepSelect: (stepId: string) => void;
  onCopyMarkdown: (markdown: string) => void;
}) {
  if (density === "callLog") {
    return (
      <SequenceCallLog
        spec={spec}
        workflow={workflow}
        catalogues={catalogues}
        selectedStepId={selectedStepId}
        onStepSelect={onStepSelect}
        onCopyMarkdown={onCopyMarkdown}
      />
    );
  }

  return (
    <SequenceDiagram
      spec={spec}
      workflow={workflow}
      catalogues={catalogues}
      selectedStepId={selectedStepId}
      onStepSelect={onStepSelect}
    />
  );
}
