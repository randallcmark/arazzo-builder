# Development, customization, and deployment

## Requirements

- Node.js 20.17 or newer.
- npm 11.16 or newer, using the committed `package-lock.json`.

## Local setup

```bash
nvm use
npm install --global npm@11.17.0
cp .env.example .env.local
npm ci
npm run dev
```

Open `http://localhost:3000`.

If `nvm` is not installed, use any Node.js installation that satisfies the
declared engine. The npm upgrade is still required when that installation
ships an older npm release.

## Reproducible validation

Run the same check used by continuous integration:

```bash
npm run check
```

This runs:

1. Vitest unit tests.
2. ESLint with the Next.js Core Web Vitals and TypeScript rules.
3. A production Next.js build and TypeScript check.

CI actions are pinned to reviewed commit SHAs and updated through the committed
Dependabot configuration. CodeQL and dependency-review workflows are not
enabled at this project size; production audit, tests, lint, and the production
build remain the required checks.

For a dependency advisory check:

```bash
npm audit --omit=dev
```

This is the deployment-focused audit used by CI. A clean-context repository
review should also run `npm audit` without exclusions and report development
tooling advisories separately from shipped runtime dependencies.

## Security-pinned transitive dependencies

`package.json` temporarily overrides several transitive packages:

- DOMPurify 3.4.12 for Monaco Editor.
- PostCSS 8.5.24 for Next.js and Vite.
- Sharp 0.35.3 for Next.js.
- Baseline Browser Mapping 2.11.6 for Next.js and Browserslist.
- Flatted 3.4.3 for ESLint.
- The compatible `brace-expansion` branches used by Minimatch 3 and 10.

The DOMPurify, PostCSS, and Sharp versions address advisories affecting the
versions declared by the current upstream packages. The other overrides keep
lockfile regeneration within the repository's package-age policy. The
application does not use `next/image`, so Sharp is not exercised by application
behavior, but retaining a patched optional version keeps the installed
production tree clean.

Vite 7.3.6 is an explicit development dependency because Vitest's broad
optional peer range would otherwise select the newly published Vite 8 and
Rolldown line. Lucide React 1.27.0 is pinned directly, and
`@napi-rs/wasm-runtime` 1.1.6 is pinned as a development dependency so npm
deduplicates the compatible optional resolver runtime.

Reassess and remove each compatibility pin when its upstream dependency range
can resolve safely without it. Any dependency change requires `npm run check`
and both production-only and full dependency audits.

The full development tree may continue to report the `brace-expansion`
denial-of-service advisory through ESLint 9 plugins that depend on Minimatch 3.
The affected packages are not shipped in the production application. Do not
force ESLint 10 while the installed Next.js ESLint plugins declare support only
through ESLint 9; upgrade that toolchain together when its peer ranges permit.

This repository requires npm 11.16 or newer and enables
`strict-allow-scripts=true` in `.npmrc`. The native npm `allowScripts` policy
therefore blocks an install when a dependency has an unreviewed lifecycle
script. Only the exact installed versions of Esbuild, `fsevents`, and
`unrs-resolver` are approved. Review and re-approve them when a pinned version
changes; do not replace the policy with a blanket script allowance.

Use the package-manager version declared in `package.json`. Older npm clients
do not implement this policy and are rejected by the repository's engine
requirements.

## Dependency release-age policy

`.npmrc` sets `min-release-age=2`, so npm resolves only package versions that
have been public for more than two days. This mirrors the default 48-hour
minimum enforced by Aikido Endpoint Protection and prevents a routine lockfile
refresh from selecting a version that the target environment will immediately
block.

`npm ci` continues to install the committed lockfile exactly. When changing a
dependency:

1. Use the reviewed npm version declared in `package.json`.
2. Run `npm install`; do not bypass the minimum-age setting.
3. Inspect the direct and transitive lockfile changes.
4. Run `npm ci`, `npm run check`, `npm audit --omit=dev`, and `npm audit`.

If an urgent security fix is less than two days old, do not downgrade to a
known-vulnerable release. Record the advisory and request a narrow,
time-limited package exception in the target environment, then remove the
exception after the release has aged into policy.

Tests live beside the modules they exercise. Library behavior uses the default
Vitest Node environment; React interaction tests opt into jsdom. New mutation
behavior should have tests for both the parsed result and preservation of
unrelated YAML content such as comments. User-facing regressions should receive
an interaction test where practical.

## Fork customization

Start with the deliberately small customization surface:

1. Change identity, default document paths, the draft key, and the storage
   namespace in `config/site.ts`.
2. Replace `public/workflows/deel-arazzo.yml` and
   `public/openapi/deel-openapi.json`.
3. Adjust the design tokens at the top of `app/globals.css`.
4. Replace `public/og.png` and landing-page example copy where appropriate.
5. Set `NEXT_PUBLIC_SITE_URL` to the deployed origin.

Changing both `draftStorageKey` and `storageNamespace` is recommended for a fork
so drafts and layouts from two tools on the same origin cannot collide.

## Deployment contract

The default deployment is a standard Next.js Node server:

```text
Install: npm ci
Build:   npm run build
Start:   npm run start
```

The application expects to be hosted at the origin root. A sub-path deployment
requires a deliberate `basePath` change and corresponding handling for public
fixture URLs.

No database, writable runtime filesystem, or persistent volume is required.

## Publishing a baseline change

1. Export and review the intended YAML.
2. Replace the file configured by `defaultDocumentUrl`.
3. Run `npm run check`.
4. Commit the fixture and related tests together.
5. Deploy the resulting Git revision.

Published baselines are shared. Browser drafts remain local and independent.
