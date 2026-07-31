# Security model

This project is a browser-local workflow tool, not a security boundary.

## Data handling

- Imported Arazzo and OpenAPI documents are processed in the browser.
- Drafts and layouts may remain in browser `localStorage` until that origin's
  storage is cleared.
- Exported files are created by the browser and are not uploaded by the
  application.
- Cross-origin OpenAPI URLs are requested directly by the browser only after an
  explicit action in the API source dialog and are subject to the destination's
  CORS policy.
- The application has no account system, authorization model, secret store, or
  shared server-side persistence.

Do not place credentials, private keys, access tokens, or confidential API
descriptions in public fixtures or client-visible environment variables.

## Validation scope

The built-in diagnostics are not a complete Arazzo security or conformance
validator. Review generated YAML before using it to drive privileged or
automated API activity.

The implementation trust boundaries and review hotspots are documented in
`docs/architecture.md` and `docs/review-checklist.md`.

## Dependency audit scope

Continuous integration audits production dependencies at high severity. The
full development tree is reviewed separately because build and lint tooling is
not deployed with the application.

At this revision, patched DOMPurify, PostCSS, and Sharp versions are pinned
through documented package overrides. A remaining high-severity
`brace-expansion` denial-of-service advisory is reachable through the
development-only ESLint 9 plugin chain. Its automated remediation requires an
ESLint 10 change that is outside those plugins' declared peer support. This
exception should be removed when the Next.js ESLint toolchain supports the
patched dependency path.

Dependency lifecycle scripts are governed by npm's native, strict
`allowScripts` policy. The required npm version is declared in `package.json`;
older npm clients are not supported because they do not enforce this control.
New dependency resolution also applies the two-day minimum release age declared
in `.npmrc`. Security fixes that have not yet aged into that window require a
documented, package-specific target-environment exception rather than a
downgrade to a vulnerable release.

## Supported version

Security fixes target the latest revision of `main`. Older forks and deployed
revisions must be assessed independently.

## Reporting

Use the repository's enabled GitHub Private Vulnerability Reporting facility
for sensitive findings. For non-sensitive defects, open a GitHub issue with
reproduction steps. Do not publish credentials, private API descriptions, or
active secrets in an issue.
