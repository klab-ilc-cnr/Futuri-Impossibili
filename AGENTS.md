# AGENTS.md

## Project Overview

React web interface for the **Futuri (im)possibili** project: upload, read, annotate, and
query interview transcripts of youths from Caivano, linked to a narrative dictionary
(concepts associated with research target words). The backend is **LexO-server** (Java/Tomcat),
contacted ONLY through the API proxies in `app/api/lexo/*` (never directly from the client).

## Stack (Important: Not Pure Next.js)

- **Next.js 16 App Router running on Vite** via **vinext** (Next-on-Vite,
  pinned `1.0.0-beta.5`) + `@cloudflare/vite-plugin` (workerd/miniflare).
  The build is NOT `next build`: `npm run build` → `vinext build` is used.
- React 19, TypeScript, Tailwind CSS 4 (postcss), drizzle (UNUSED).
- The project originated from a "site-creator" scaffold (Codex/Cloudflare): template leftovers
  remain (see "Dead Files").

## Commands

Complete operational guide (local installation, build, proxy, VM deploy, and Apache) in
`INSTALL.md`; first-time VM setup details in `deploy/README.md`.

- `npm ci` — install dependencies (Node >= 22.13). On machines with npm 11 blocking postinstall,
  if native binaries are missing: `node node_modules/workerd/install.js` and
  `node node_modules/esbuild/install.js`.
- `npm run dev` — dev server (port 3000, see output); the app runs at
  `http://localhost:3000/futuri-impossibili` (basePath is active in dev).
  **Note**: `vinext dev` runs inside workerd/miniflare, which CANNOT reach
  private IPs such as the remote test LexO (`{{LEXO_TEST_URL}}` — "Network connection lost").
  To test APIs against the remote backend, use `npm run start` + `start:proxy` (below).
- `npm run build` — production build (`vinext build` → `dist/`).
- `npm run build:deploy` — build + `deploy/post-build.sh` (moves hashed assets from
  `dist/client/futuri-impossibili/_next` to `dist/client/_next`). **ALWAYS use for deployments**.
- `npm run start` — local production server (port 3000, `-p`/`-H` to change; serves `dist/`).
  **Note**: in `vinext start` the assets `_next/static` are only served at root, so the site
  must be accessed via the local proxy (below), not directly on port 3000.
- `npm run start:proxy` — local reverse-proxy (Node, `deploy/local-proxy.mjs`, port 3001): rewrites
  `/futuri-impossibili/_next/static/*` → `/_next/static/*` and forwards everything else to `vinext start`.
  Replicates the 2 Apache reverse proxy rules. **Local test workflow**: `npm run build:deploy`,
  `npm run start`, then in another shell `npm run start:proxy` and open
  `http://localhost:3001/futuri-impossibili/`. To use the remote backend on this machine:
  `LEXO_SERVER_URL={{LEXO_TEST_URL}} npm run start`.
- `npm run lint` — eslint: 0 errors; accepted 3 `<img>` warnings in `page.tsx`.
- `npm test` — **broken by design**: template tests point to `app/_sites-preview/`
  (never existed in this repo). Do not "fix" them.
- Typecheck `npx tsc --noEmit`: pre-existing and expected errors in `worker/index.ts` and `db/index.ts`
  (`cloudflare:workers`, `Fetcher`, `D1Database`) (dead files).

## Architecture

- SPA: `app/page.tsx` is `"use client"` and contains the entire interface; navigation items are buttons
  (client-side state, no routing). The root layout is `app/layout.tsx` (layout + metadata).
- `app/api/lexo/**` — route handlers acting as **proxies** to LexO-server: they read
  `LEXO_SERVER_URL` (default `http://localhost:8080/LexO-server`, without trailing slash) and, in
  some routes, `LEXO_SERVER_AUTHORIZATION`. Client requests always use `cache: "no-store"`.
- Test backend reachable from development machine:
  `{{LEXO_TEST_URL}}`. On the production VM it is on
  `http://localhost:8080/LexO-server` (same machine).

### Known LexO-server Concept Deletion Bug (Upstream Issue #17)

`GET /service/delete/lexicalConcept` (used by the `DELETE` proxy in `lexical-concept/route.ts`)
**DOES NOT actually delete**: the SPARQL update operates on named graph `…/graphs/lexical/lexica`
(empty), whereas new concepts live in `…/graphs/lexical/lexicalConcept` → LexO responds with
200+timestamp but the concept persists (reappears on list refresh). The GUI allows "Delete" from the
context menu; the concept appears removed until the page is reloaded.
**Upstream fix pending** (issue https://github.com/andreabellandi/LexO-server/issues/17).
Do not attempt client-side workarounds; it must be fixed in LexO-server
(`SKOSManager.deleteLexicalConcept` should use `LexiconCrudSupport.lexicalConceptGraphUri()`).

Note: Concept IRIs contain `+` (UTC offset, e.g. `…_416+02_00`). LexO's DELETE performs an extra
`URLDecoder.decode`, so the proxy MUST **double-encode** `id`
(`new URLSearchParams({ id: encodeURIComponent(id), ... })`) so that `+` arrives intact
(single-encode turns it into a space → "does not exist").

### Text Deletion Service

`DELETE /service/texts/{fileId}` (proxy `app/api/lexo/texts/[fileId]/route.ts`) deletes the text NIF
graph, detaches it from its corpus, clears its attestation/annotation graphs and removes persisted
files. **Always returns HTTP 200** with a JSON body `{"deleted": true|false}` — the client MUST check
`payload.deleted === true`, not just `response.ok`. The UI exposes deletion via the trash button in
the archive `sidebar-heading-row` (confirmation modal, same pattern as annotation/concept deletion).
The archive heading has exactly 3 buttons: bulk upload (multiple files), delete current interview, reload.

## In-Text Annotation Rendering (Solution B - Decoupled Pure Text & Graphic Layer v0.6.0)

- **100% Pure Text in DOM**: Interview transcript text in `.text-area` NEVER contains `<mark>` or `<span>` inline splitting tags.
  This permanently prevents reflow, line jumping, or font kerning displacement: words are never broken across element boundaries by the browser's layout engine.
- **Unified Graphic Layer (`.annotation-layer`)**: Absolutely positioned over the text (`mix-blend-mode: multiply`), drawing:
  1. Yellow highlights for saved attestations (`.annotation-highlight`) with hover tooltips and click handlers.
     - Overlapping highlight segments are sliced into non-overlapping boxes to prevent darkening/double-multiplication.
  2. Multi-level stacked underline bars (`.bar`) underneath each line.
  3. Green active locus editing highlights (`.locus-editing-highlight`) and start/end handles (`.locus-handle`).
- **Deterministic Hit-Testing & Soft-Wrap Affinity**: `textOffsetAtPoint` (`app/page.tsx`) finds the closest line (`distY`) and character boundary (`distX`) via `Range.getClientRects()`.
- **Uniform Line-Height & Paragraph Breaks**: `.text-area` has `line-height: calc(1.5em + var(--bar-step))` reserving space for underline bars. Multiple newlines (`\n\n+`) are wrapped in `.paragraph-break` (`line-height: 10px; font-size: 0;`) to provide natural, compact paragraph spacing while preserving 100% of the original string and exact NIF character indices.

## basePath — Mandatory Rules

The app runs under `/futuri-impossibili` (`next.config.ts`, default from `NEXT_PUBLIC_BASE_PATH`).
**Known upstream bug**: vinext (0.0.50 and 1.0.0-beta.5) DOES NOT serve assets under basePath in
`vinext start` — exports `__basePath`/`__assetPrefix` are not emitted into the bundle.
The workaround is in place (post-build move + reverse proxy rewrite). **Do NOT try to
"fix" vinext**: add a rule to proxy or post-build script, do not modify node_modules.

- In `app/page.tsx`, every root-relative client URL MUST use the `basePath` prefix
  (constant defined above endpoint constants: `textsEndpoint`, `attestationsEndpoint`, etc.
  and `<img src>`). Any `fetch("/api/...")` or `<img src="/...">` without prefix
  breaks in production.
- `app/globals.css` has one hardcoded `url()` with prefix
  (`/futuri-impossibili/sentiment.webp`): CSS cannot read env vars, keep in sync with default.
- `app/layout.tsx`: favicon manually prefixed (vinext does not prefix it automatically).

## Dead Files / Do Not Touch

- `app/chatgpt-auth.ts` — OpenAI/ChatGPT hosting auth, never imported.
- `db/`, `worker/index.ts`, `.openai/hosting.json`, `drizzle*`, `examples/`, `tests/` —
  scaffold leftovers from Cloudflare/D1 template (UI uses only API proxies).
- `Avvia-LexO.command` — macOS-only dev launcher with hardcoded path
  `/Users/andreabellandi/.cache/codex-runtimes/...` and `open` (macOS). Do NOT execute on Linux;
  on Mac it opens `http://localhost:3000/futuri-impossibili`.

## Deployment Summary (Full Runbook in `deploy/README.md`)

- Alpine VM `{{VM_IP}}`: project in `/opt/futuri-impossibili`, user `futuri`,
  openrc service `/etc/init.d/futuri-impossibili`, port `3001` on `0.0.0.0`,
  log in `/opt/futuri-impossibili/futuri-impossibili.log`.
- `.env.local` on VM: `LEXO_SERVER_URL=http://localhost:8080/LexO-server` and
  `NEXT_PUBLIC_BASE_PATH=/futuri-impossibili` (default covered).
- NAT: bastion (`{{BASTION_IP}}`) with iptables `{{NAT_PORT}} → {{VM_IP}}:3001` (source restricted
  to reverse proxy); ssh/scp to VM via port `{{SSH_PORT}}` (e.g. `scp -P {{SSH_PORT}} ... {{BASTION_IP}}:/tmp`).
- Public URL: `https://{{PUBLIC_HOST}}/futuri-impossibili` — Apache with 2 rules:
  `/futuri-impossibili/_next/static` → `/_next/static` (assets) and `/futuri-impossibili/`
  in passthrough (page, API, public files).
- Upgrade: VM does NOT have git → source tgz (command in `deploy/README.md`),
  extract to `/opt/futuri-impossibili`, `npm ci && npm run build:deploy`, `rc-service
  futuri-impossibili restart`. **Never deploy without `build:deploy`**, otherwise assets return 404.

## Conventions

- Commits: Italian messages, lowercase, past-tense verb style
  (e.g. "introdotto base path /futuri-impossibili per il deploy sotto directory").
- Code: Do not add unnecessary comments unless requested.
- Interface Versioning: semver `x.y.z` defined in `appVersion` constant in
  `app/page.tsx` (rendered as `v…` on the right in `main-nav`, class
  `.main-nav-version`). Bump: `x`=breaking/major, `y`=new features,
  `z`=bugfixes. Keep version bump aligned with the commit introducing the change.
- Smoke test proxy: `curl http://<host>:<porta>/futuri-impossibili/api/lexo/lexical-concepts`.
