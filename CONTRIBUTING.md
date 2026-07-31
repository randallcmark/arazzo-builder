# Contributing

Thank you for helping improve Arazzo Builder.

## Before starting

- Use Node.js 20.17 or newer and npm 11.16 or newer.
- Read `docs/architecture.md`, especially the source-of-truth and viewer
  read-only invariants.
- Open an issue before beginning a large behavioral or architectural change.
- Do not submit source, styles, fixtures, or tests copied from
  `connEthics/arazzo-demo` or another project without compatible,
  redistributable licensing.

## Development

```bash
cp .env.example .env.local
npm ci
npm run check
```

Dependency lifecycle scripts are denied unless their exact package version is
approved in `package.json`. Do not add a broad install-script allowance or
bypass the two-day minimum package age in `.npmrc`.

## Pull requests

- Keep changes focused and explain the user-visible outcome.
- Add a regression test for corrected defects.
- Preserve comments and unrelated YAML content when changing document
  mutations.
- State any manual verification that remains.
- Update documentation and third-party notices when behavior or direct
  dependencies change.

By contributing, you agree that your repository-owned contribution is licensed
under the project’s MIT License.
