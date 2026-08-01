import { ShieldCheck } from "lucide-react";
import type { ApiCatalogue, OpenApiOperation } from "@/lib/openapi";

export function OpenApiOperationInspector({
  catalogue,
  operation,
}: {
  catalogue: ApiCatalogue;
  operation: OpenApiOperation;
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
          <h3>Declared parameters</h3>
          {operation.parameters.map((parameter) => (
            <article key={`${parameter.location}:${parameter.name}`}>
              <div>
                <strong>{parameter.name}</strong>
                <small>
                  {parameter.location} · {parameter.required ? "required" : "optional"}
                </small>
              </div>
              {parameter.schema && <code>{parameter.schema}</code>}
              {parameter.description && <p>{parameter.description}</p>}
            </article>
          ))}
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
