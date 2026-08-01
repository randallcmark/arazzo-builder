import { ShieldCheck } from "lucide-react";
import type { ApiCatalogue, OpenApiOperation } from "@/lib/openapi";
import type { WorkflowRequestBinding } from "@/lib/workflow-detail";

export function OpenApiOperationInspector({
  catalogue,
  operation,
  requestBindings = [],
}: {
  catalogue: ApiCatalogue;
  operation: OpenApiOperation;
  requestBindings?: WorkflowRequestBinding[];
}) {
  return (
    <section className="resolved-operation">
      <span>Resolved OpenAPI operation</span>
      <div className="operation-route-heading">
        <b className={`http-method http-method--${operation.method.toLowerCase()}`}>
          {operation.method}
        </b>
        <code>{operation.path}</code>
      </div>
      <strong>
        {operation.summary}
        <small>
          {catalogue.title} · sourceDescriptions.{catalogue.sourceName}
        </small>
      </strong>
      {operation.description && <p>{operation.description}</p>}
      {operation.deprecated && <div className="operation-warning">Deprecated</div>}
      {operation.tags?.length ? (
        <div className="inspector-tags">
          {operation.tags.map((tag) => (
            <i key={tag}>{tag}</i>
          ))}
        </div>
      ) : null}

      {operation.servers?.map((server) => (
        <code key={server} className="server-url">
          {server}
        </code>
      ))}

      {operation.parameters?.length ? (
        <div className="api-contract-group">
          <h3>Declared parameters versus this step</h3>
          <div className="parameter-coverage" role="table">
            <div className="parameter-coverage-heading" role="row">
              <span role="columnheader">OpenAPI declares</span>
              <span role="columnheader">This step sends</span>
            </div>
            {operation.parameters.map((parameter) => {
              const target = `${parameter.location}.${parameter.name}`;
              const binding = requestBindings.find(
                (candidate) => normalizeTarget(candidate.target) === normalizeTarget(target),
              );
              return (
                <article
                  className={binding ? "" : "is-unset"}
                  key={target}
                  role="row"
                >
                  <div role="cell">
                    <strong>{parameter.name}</strong>
                    <small>
                      {parameter.location} · {parameter.required ? "required" : "optional"}
                      {parameter.schema ? ` · ${parameter.schema}` : ""}
                    </small>
                    {parameter.description && <p>{parameter.description}</p>}
                  </div>
                  <div role="cell">
                    {binding ? (
                      <>
                        <code>{binding.value}</code>
                        <small>{binding.target}</small>
                      </>
                    ) : (
                      <span className="parameter-unset">
                        {parameter.required ? "Required · not set" : "Not set"}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {operation.requestBody && (
        <div className="api-contract-group">
          <h3>Declared request body</h3>
          <p>{operation.requestBody.description ?? "Request payload"}</p>
          <div className="inspector-tags">
            {operation.requestBody.contentTypes.map((contentType) => (
              <i key={contentType}>{contentType}</i>
            ))}
            <i>{operation.requestBody.required ? "required" : "optional"}</i>
          </div>
        </div>
      )}

      {operation.responses?.length ? (
        <div className="api-contract-group">
          <h3>Declared responses</h3>
          {operation.responses.map((response) => (
            <article key={response.status} className="api-response-row">
              <b>{response.status}</b>
              <div>
                <p>{response.description ?? "Response"}</p>
                {response.contentTypes.length > 0 && (
                  <small>{response.contentTypes.join(" · ")}</small>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {operation.security?.length ? (
        <div className="inspector-inline-meta">
          <ShieldCheck size={13} />
          {operation.security.join(" or ")}
        </div>
      ) : null}
      <small className="inspector-muted">{catalogue.location}</small>
    </section>
  );
}

function normalizeTarget(target: string): string {
  return target.trim().toLowerCase();
}
