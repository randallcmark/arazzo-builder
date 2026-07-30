"use client";

import type { OnMount } from "@monaco-editor/react";
import { AlertCircle, Check } from "lucide-react";
import dynamic from "next/dynamic";
import type { Diagnostic } from "@/lib/arazzo";
import {
  OPERATION_RESULT_LIMIT,
  operationMatches,
  type ApiCatalogue,
} from "@/lib/openapi";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="editor-loading">Preparing the YAML editor…</div>,
});

export function YamlWorkspacePanel({
  source,
  onMount,
  onChange,
  catalogues,
  activeCatalogue,
  onActiveCatalogueChange,
  operationQuery,
  onOperationQueryChange,
  diagnostics,
  onCopyReference,
}: {
  source: string;
  onMount: OnMount;
  onChange: (source: string) => void;
  catalogues: ApiCatalogue[];
  activeCatalogue: ApiCatalogue | null;
  onActiveCatalogueChange: (sourceName: string) => void;
  operationQuery: string;
  onOperationQueryChange: (query: string) => void;
  diagnostics: Diagnostic[];
  onCopyReference: (reference: string) => void;
}) {
  const matchingOperations =
    activeCatalogue?.operations.filter((operation) =>
      operationMatches(operation, operationQuery),
    ) ?? [];

  return (
    <div className="yaml-workspace">
      <MonacoEditor
        height="100%"
        defaultLanguage="yaml"
        value={source}
        onMount={onMount}
        onChange={(value) => onChange(value ?? "")}
        theme="vs"
        options={{
          minimap: { enabled: false },
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          lineHeight: 21,
          padding: { top: 18, bottom: 18 },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          renderLineHighlight: "gutter",
          overviewRulerLanes: 0,
          folding: true,
          automaticLayout: true,
        }}
      />
      <aside className="diagnostics-panel">
        {activeCatalogue && (
          <section className="api-reference-browser">
            <header>
              <span>API references</span>
              <strong>{activeCatalogue.operations.length}</strong>
            </header>
            <label>
              <span>Source</span>
              <select
                value={activeCatalogue.sourceName}
                onChange={(event) =>
                  onActiveCatalogueChange(event.target.value)
                }
              >
                {catalogues.map((catalogue) => (
                  <option
                    key={catalogue.sourceName}
                    value={catalogue.sourceName}
                  >
                    {catalogue.sourceName} · {catalogue.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Find operation</span>
              <input
                value={operationQuery}
                onChange={(event) =>
                  onOperationQueryChange(event.target.value)
                }
                placeholder="operationId, path, or method"
              />
            </label>
            <div className="api-reference-list">
              {matchingOperations
                .slice(0, OPERATION_RESULT_LIMIT)
                .map((operation) => {
                  const reference = `$sourceDescriptions.${activeCatalogue.sourceName}.${operation.id}`;
                  return (
                    <button
                      key={operation.id}
                      title={`Copy ${reference}`}
                      onClick={() => onCopyReference(reference)}
                    >
                      <span>
                        <b>{operation.method}</b>
                        {operation.path}
                      </span>
                      <code>{operation.id}</code>
                    </button>
                  );
                })}
              {matchingOperations.length > OPERATION_RESULT_LIMIT && (
                <p className="operation-limit">
                  Showing {OPERATION_RESULT_LIMIT} of {matchingOperations.length}.
                  Narrow the list with search.
                </p>
              )}
            </div>
          </section>
        )}
        <header>
          <span>Diagnostics</span>
          <strong>{diagnostics.length}</strong>
        </header>
        {diagnostics.length ? (
          diagnostics.map((diagnostic, index) => (
            <div className="diagnostic" key={`${diagnostic.message}-${index}`}>
              <AlertCircle size={14} />
              <p>
                {diagnostic.message}
                {diagnostic.path && <code>{diagnostic.path}</code>}
              </p>
            </div>
          ))
        ) : (
          <div className="diagnostic diagnostic--success">
            <Check size={14} />
            <p>No structural issues found.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
