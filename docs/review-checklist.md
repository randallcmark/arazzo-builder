# Clean-context review checklist

Use this checklist for an independent review. Treat the repository contents and
command results as the only evidence. Do not infer safety, correctness, license
compatibility, or deployment behavior from prior conversations.

## Establish scope

- Record the Git revision and `git status --short`.
- Identify uncommitted and untracked files before reviewing.
- Read `README.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`,
  `docs/provenance.md`, and `docs/architecture.md`.
- Confirm whether the review covers only repository-owned code or also the
  provenance and redistribution terms of replacement fixtures.

## Reproduce the build

```bash
npm ci
npm run check
npm audit --omit=dev
npm audit
```

Record exact failures and warnings. Do not substitute a successful local
development server for the production build. Separate shipped production
dependency findings from development-only tooling findings.

## Review high-risk boundaries

- Imported YAML/JSON size limits and parse errors.
- YAML syntax-tree mutations and preservation of comments.
- Cross-step `goto` validation.
- Remote URL fetching and CORS assumptions.
- Mermaid strict mode and generated SVG insertion.
- `localStorage` decoding, quota failure, and namespace collision.
- Download/export content and filenames.
- Monaco selection synchronization.
- Separation between presentation coordinates and execution order.
- Viewer read-only behavior versus builder mutations.

## Review licensing and provenance

- Confirm the root license applies to repository-owned code.
- Compare direct dependencies in `package.json` with
  `THIRD_PARTY_NOTICES.md`.
- Inspect the lockfile for unexpected dependency changes.
- Confirm no source, styles, fixtures, or tests were copied from
  `connEthics/arazzo-demo`.
- Review replacement OpenAPI/Arazzo fixtures under their own applicable terms.
- Treat third-party names and trademarks as identification, not endorsement.

## Review test adequacy

- Each source mutation should have a positive test and a preservation test.
- Graph projections should test implicit, success, failure, retry, and end
  semantics.
- Storage tests should include current and legacy formats.
- Defects found during review should receive a regression test.
- UI interaction claims not covered by automated tests should be listed
  explicitly as manual verification gaps.

## Report format

Report findings by severity with:

1. A concise statement of the problem.
2. File and line evidence.
3. A reproducible trigger or failing test.
4. User or deployment impact.
5. The smallest safe correction.

Finish with explicit lists of:

- Checks performed.
- Checks not performed.
- Assumptions that remain unverified.
- Residual risks after any fixes.
