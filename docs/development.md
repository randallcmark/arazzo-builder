# Development, customization, and deployment

## Requirements

- Node.js 20.9 or newer.
- npm, using the committed `package-lock.json`.

## Local setup

```bash
nvm use
cp .env.example .env.local
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Reproducible validation

Run the same check used by continuous integration:

```bash
npm run check
```

This runs:

1. Vitest unit tests.
2. ESLint with the Next.js Core Web Vitals and TypeScript rules.
3. A production Next.js build and TypeScript check.

For a dependency advisory check:

```bash
npm audit --omit=dev
```

This is the deployment-focused audit used by CI. A clean-context repository
review should also run `npm audit` without exclusions and report development
tooling advisories separately from shipped runtime dependencies.

## Security-pinned transitive dependencies

`package.json` temporarily overrides three transitive packages:

- DOMPurify 3.4.12 for Monaco Editor.
- PostCSS 8.5.25 for Next.js.
- Sharp 0.35.3 for Next.js.

These versions address advisories affecting the versions declared by the
current upstream packages. The application does not use `next/image`, so Sharp
is not exercised by application behavior, but retaining a patched optional
version keeps the installed production tree clean.

Reassess and remove each override when Monaco Editor and Next.js declare
patched compatible ranges themselves. Any override change requires
`npm run check` and both production-only and full dependency audits.

The full development tree may continue to report the `brace-expansion`
denial-of-service advisory through ESLint 9 plugins that depend on Minimatch 3.
The affected packages are not shipped in the production application. Do not
force ESLint 10 while the installed Next.js ESLint plugins declare support only
through ESLint 9; upgrade that toolchain together when its peer ranges permit.

The `allowScripts` policy approves only the exact installed versions of
`fsevents` and `unrs-resolver`. Review and re-approve them when either pinned
version changes; do not replace the policy with a blanket script allowance.

Tests live beside the modules they exercise in `lib/*.test.ts`. New mutation
behavior should have tests for both the parsed result and preservation of
unrelated YAML content such as comments.

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
