"use client";

import { FileUp, Link2, LoaderCircle, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import type { ApiCatalogue } from "@/lib/openapi";

export function ApiSourceDialog({
  open,
  catalogues,
  onClose,
  onAddUrl,
  onAddFile,
}: {
  open: boolean;
  catalogues: ApiCatalogue[];
  onClose: () => void;
  onAddUrl: (name: string, url: string) => Promise<void>;
  onAddFile: (name: string, file: File, referenceUrl: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"url" | "file">("url");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const submit = async () => {
    const cleanName = name.trim();
    if (!/^[A-Za-z0-9_-]+$/.test(cleanName)) {
      setError("Source names may contain letters, numbers, hyphens, and underscores.");
      return;
    }
    if (mode === "url" && !url.trim()) {
      setError("Enter the URL of an OpenAPI document.");
      return;
    }
    if (mode === "file" && !file) {
      setError("Choose an OpenAPI YAML or JSON file.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      if (mode === "url") {
        await onAddUrl(cleanName, url.trim());
      } else if (file) {
        await onAddFile(
          cleanName,
          file,
          referenceUrl.trim() || `./${file.name}`,
        );
      }
      setName("");
      setUrl("");
      setReferenceUrl("");
      setFile(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The API source could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="workflow-dialog api-source-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-source-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="view-eyebrow">API catalogue</p>
            <h2 id="api-source-dialog-title">Connect an OpenAPI spec</h2>
            <span>
              Enumerate operation IDs and make this API available to every workflow.
            </span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </header>

        <div className="api-source-body">
          {catalogues.length > 0 && (
            <section className="connected-sources">
              <div className="builder-panel-heading">
                <span>Connected APIs</span>
                <small>{catalogues.length} sources</small>
              </div>
              <div>
                {catalogues.map((catalogue) => (
                  <article key={catalogue.sourceName}>
                    <span>{catalogue.sourceName}</span>
                    <div>
                      <strong>{catalogue.title}</strong>
                      <small>{catalogue.location}</small>
                    </div>
                    <b>{catalogue.operations.length} ops</b>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="source-loader">
            <div className="source-mode-tabs" role="tablist" aria-label="Source type">
              <button
                role="tab"
                aria-selected={mode === "url"}
                className={mode === "url" ? "is-active" : ""}
                onClick={() => {
                  setMode("url");
                  setError("");
                }}
              >
                <Link2 size={15} />
                From URL
              </button>
              <button
                role="tab"
                aria-selected={mode === "file"}
                className={mode === "file" ? "is-active" : ""}
                onClick={() => {
                  setMode("file");
                  setError("");
                }}
              >
                <FileUp size={15} />
                From file
              </button>
            </div>

            <div className="source-loader-fields">
              <label className="builder-field">
                <span>Arazzo source name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="payments"
                />
                <small>
                  Used in references such as $sourceDescriptions.payments.createPayment.
                </small>
              </label>

              {mode === "url" ? (
                <label className="builder-field">
                  <span>OpenAPI URL</span>
                  <input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://api.example.com/openapi.json"
                    inputMode="url"
                  />
                  <small>The server must allow this browser to fetch the document.</small>
                </label>
              ) : (
                <>
                  <button
                    className="source-file-picker"
                    onClick={() => fileInput.current?.click()}
                  >
                    <FileUp size={20} />
                    <span>
                      <strong>{file?.name ?? "Choose OpenAPI file"}</strong>
                      <small>YAML or JSON · up to 5 MB</small>
                    </span>
                  </button>
                  <input
                    ref={fileInput}
                    className="visually-hidden"
                    type="file"
                    accept=".yaml,.yml,.json,application/yaml,application/json,text/yaml"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] ?? null;
                      setFile(nextFile);
                      if (nextFile && !name) {
                        setName(sourceNameFromFilename(nextFile.name));
                      }
                      if (nextFile && !referenceUrl) {
                        setReferenceUrl(`./${nextFile.name}`);
                      }
                    }}
                  />
                  <label className="builder-field">
                    <span>Reference path in exported Arazzo</span>
                    <input
                      value={referenceUrl}
                      onChange={(event) => setReferenceUrl(event.target.value)}
                      placeholder="./openapi.yaml"
                    />
                    <small>
                      The file stays in your browser. This path tells Arazzo where it
                      will be hosted later.
                    </small>
                  </label>
                </>
              )}
            </div>
          </section>
        </div>

        <footer>
          <div>{error && <p className="form-error">{error}</p>}</div>
          <button className="secondary-button" onClick={onClose}>
            Done
          </button>
          <button
            className="primary-button primary-button--compact"
            onClick={() => void submit()}
            disabled={loading}
          >
            {loading ? (
              <>
                <LoaderCircle className="spin" size={15} />
                Reading spec
              </>
            ) : (
              <>
                Connect API
                <Plus size={15} />
              </>
            )}
          </button>
        </footer>
      </section>
    </div>
  );
}

function sourceNameFromFilename(filename: string): string {
  return (
    filename
      .replace(/\.(openapi|swagger)?\.(yaml|yml|json)$/i, "")
      .replace(/\.(yaml|yml|json)$/i, "")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "api"
  );
}
