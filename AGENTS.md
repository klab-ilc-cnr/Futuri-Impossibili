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
The archive heading has exactly 4 buttons: bulk upload (multiple files), multi-selection toggle,
delete, reload.

### Bulk Interview Deletion (v0.9.0)

- **Proxy**: `DELETE /api/lexo/texts/bulk` → `DELETE /service/texts/bulk` (body `{fileIds}`,
  async job 202); `GET /api/lexo/texts/deletions/[bulkId]/status` → job status polling.
- **UI**: a 4th archive-heading button ("Selezione") toggles multi-selection mode; rows toggle
  selection (server-source only, checkbox shown); the trash button then bulk-deletes the selected
  interviews (disabled with 0 selected, tooltip "Seleziona almeno una intervista"). In normal mode
  the trash keeps deleting the currently displayed interview. Confirm modal warns when the open
  interview is included. Progress ("Eliminate X di N…") renders in the archive list; terminal
  states COMPLETED / PARTIALLY_COMPLETED / FAILED produce a growl (partial lists failures by
  fileId), archive reloads and the active interview falls back to the first remaining one if it
  was deleted. LexO job item states: DELETED / NOT_FOUND / FAILED; job states:
  PENDING / RUNNING / COMPLETED / PARTIALLY_COMPLETED / FAILED.
- **Semantics**: deleting interviews removes everything referencing them (NIF text, corpus
  attachment, attestations/annotations). Deleting only the annotations of an interview is a
  different operation (not implemented).

## JSON Text Import (v0.9.2)

- The archive upload `accept` includes `.json` / `application/json`; files go through the same
  `POST /api/lexo/texts/bulk` proxy (mixed TXT/MD/JSON allowed server-side, shared `language=it`,
  no `corpusId` — JSON files carry their own optional `metadata.corpus`, which must already exist
  on LexO or the file fails with `INVALID_CORPUS`).
- **Attestation phase reporting**: JSON bulk items carry `attestationState`, `attestationTotal`,
  `savedAttestations`, `unsavedAttestations[]` (`id`, `observable`, `type`, stable `code`, `cause`).
  A text can convert successfully (`state: COMPLETED`) while its attestations fail individually
  (no rollback): e.g. `OBSERVABLE_TYPE_MISMATCH` (observable must have the exact rdf:type in the
  lexicon graph — lexicon entries are `ontolex#Word`, NOT `ontolex#LexicalEntry`) or
  `INVALID_CORPUS`. `describeUnsavedAttestations` surfaces up to 3 failures in the growl:
  merged into `bulkPartial` for `PARTIALLY_COMPLETED` jobs, standalone `bulkAttestationsPartial`
  growl for otherwise-COMPLETED jobs (fixes silent data loss).
- LexO JSON schema: root `{metadata?, text{type:"txt", content}, attestations[]}`; each attestation
  requires `observable` (existing IRI), exact OntoLex `type`, `value` equal to the substring,
  `start_char`/`end_char` (Unicode code-point offsets on the canonical text, end exclusive) and
  `gloss` (REQUIRED, even empty-ish — missing gloss rejects the item with
  `BULK_MISSING_JSON_FIELD`). Import creates attestations with creator "imported"; offsets must
  match `nif:isString` exactly.
- Line-break semantics (LexO commit `69c28c3`): plain TXT and JSON `text.content` preserve every
  LF in the canonical text (per-line trim + whitespace collapse; blank lines kept).

## JSON-Imported Attestations in the Viewer (v0.10.0)

- `parseAttestations` now accepts observables of type `LexicalSense` (existing behaviour) **and**
  `LexicalConcept` (direct match in the concept list → full concept panel flow: options, edit,
  delete guard); imported concepts have no referring-concept metadata so they behave as narrative
  annotations with empty options until edited. `LexicalEntry`/`Form` observables render as
  label-only highlights (attestationIris kept for locus move/delete, but no concept entry →
  no concept panel integration; the server rejects direct `LexicalEntry` type anyway —
  real entries are `ontolex#Word`).
- Unknown observables (not in the concept list) still render as highlight with
  `observableLabel` fallback (e.g. "femmina@it") via the existing label pipeline.

## Locus Bar Placement & Unsaved-Change Guard (v0.10.1 – v0.10.4)

- **Locus bar placement (v0.10.1)**: the `.annotation-actions` bar (locus edit + eraser) is
  positioned by `locusBarY(relTop, annotationHeight, wrapHeight)` in BOTH positioning sites
  (`openAnnotationEditor` and the edit-branch of `captureSelection`): above the annotation when
  there is ≥56px of room, otherwise BELOW it (clamped inside the text wrap) — never covering the
  highlighted text.
- **Tooltips in edit mode (v0.10.2)**: hovering another annotation (text hit-test in the
  `.text-area` `onMouseMove` or `.bar` `onmouseenter`) shows its tooltip even while a locus edit
  session is open; the annotation being edited (`index === editingAnnotationIndex`) and
  `dragging`/`locusDragging` still suppress it.
- **Unsaved-change guard (v0.10.2–v0.10.4)**: `editDirty` = removed/added/updated concept lists
  non-empty; `locusDirty` = boundaries moved from `selection.sourceStart/sourceEnd`. While a locus
  edit session is open and either is true: clicking another annotation (`editAnnotation` guard) or
  clicking outside (outside-click close effect, `finishOutsideLocusPointer`) opens the
  `dirtySwitchOpen` confirm modal ("Scartare le modifiche?") — Annulla/Esc/overlay keeps the
  session and changes; "Scarta e procedi" runs `resetSelectionFlow()` then
  `openAnnotationEditor(target)` (the pending target is kept in `dirtySwitchTargetRef`, null =
  just close). `editAnnotation` is the guarded wrapper; `openAnnotationEditor` is the raw opener
  so the confirm flow can bypass the guard. The modal ref is ignored by the pointerdown-outside
  logic (no loop). Clean sessions close/switch directly as before.

## Password Gate on "Costruisci Dizionario" (v0.11.0 – v0.11.1)

- The nav item 4 (`reservedMenuItemIndex`) is gated client-side: while locked, clicking it opens
  a `.confirm-modal` password dialog (kicker "AREA RISERVATA"); the correct password unlocks,
  navigates to page 4 and loads concepts. Wrong password → inline `.password-error`, field
  cleared and refocused. Esc / Annulla / overlay close without navigating.
- The secret is stored ONLY as a SHA-256 hex digest in the `workspacePasswordHash` constant
  (app/page.tsx) and verified with `crypto.subtle.digest`; the plaintext password never appears
  in the source or the bundle. To change it:
  `printf %s 'newpassword' | sha256sum` → replace the constant (no redeploy of the backend
  needed; it is a deterrent, NOT real authentication — the LexO API proxies remain open).
- Unlock state persists in `sessionStorage["fi-workspace-unlocked"]` (per browser tab): reload
  keeps it, a new tab asks again. The 🔒 `nav-lock` icon shows on the nav item while locked and
  disappears once unlocked (no 🔓 variant — too small to tell apart).

## Archive Identity, Import Report & Term Display (v0.11.2 – v0.12.2)

- **Metadata id in the archive list (v0.11.2)**: LexO stores the JSON `metadata.id` (and .md
  front-matter `id:`) as `dcterms:identifier`; `/service/texts` returns it in
  `metadata.id`/`metadataValues.id` (see `TextCatalogManager.readMetadata`). The list shows the
  id as the primary label (filename as `title` tooltip, fallback to filename when absent); the
  interview search matches both name and id.
- **Real unsaved-attestation count (v0.11.3)**: the import summary uses the full
  `unsavedAttestations` count (v0.9.2 wrongly reused the 3-example slice as the counter).
- **Imported term from rdfs:comment (v0.12.0)**: JSON-imported narrative attestations carry the
  target term (e.g. "femmina") as an `rdfs:comment` literal metadata (producer pipeline). It is
  read into the display-only `AnnotationConcept.term` and shown as the italic entry in the
  tooltip and the read-only "Entrata lessicale" panel, as fallback when
  `resolveLexicalEntryLabel` resolves nothing (real entry IRI still wins). NOTE: re-saving an
  imported annotation in the app drops unknown metadata (term disappears) — preservation via
  `narrativeMetadata` is planned but NOT implemented.
- **Upload progress + count row (v0.12.1)**: the bulk conversion poller takes an `onProgress`
  callback ("Caricati X di Y…" in the interview list, like bulk deletion); the
  "N interviste"/"X selezionate" counter moved from the 4-button heading row to its own
  `.sidebar-count-row` (it used to overflow the column).
- **Import report panel (v0.12.2)**: the import growls are replaced by a persistent
  `.import-report` box at the top of the interview list (`importReport` state: running flag,
  completed/total, full problem list — per-file conversion failure or per-attestation
  `code`/`cause`, no truncation). Live during upload (the poller now forwards the whole
  `BulkTextJob` via `buildImportProblems`), stays after completion until closed (×) or replaced
  by the next import. Growls remain for hard errors only (LexO unreachable, admission refusal,
  timeout); `bulkPartial`/`bulkNoText` strings and the `describeBulkFailures`/
  `describeUnsavedAttestations`/`countUnsavedAttestations` helpers were removed.

## Dictionary Builder UI Cleanup & KWIC Searches (v0.13.0 – v0.14.17)

### Workspace cleanup (v0.13.0 – v0.13.1)
- Removed the "INSERISCI E ANNOTA" workspace bar and both sidebars' kickers ("ARCHIVIO",
  "REPERTORIO") and the concept-intro hint block (all 3 variants). The counts ("N interviste",
  "N voci") live INSIDE `.sidebar-heading` under the title row; a single `border-bottom` closes
  the header. All three columns share header height 64px (`.document-toolbar` height 64) so the
  border lines align.
- Document toolbar: "TXT" badge and character count removed; title shows
  `metadataId || name` (tooltip = filename); the description tab (Sesso/Età/Residenza) is an
  inline pill right after the title (no notch, `pointer-events: none`); the right side is free
  for the search buttons. While a search view is open the title+tab are hidden.

### Searches (v0.14.x)
- **Three searches, one result set**: toolbar buttons Forma / Concetto / Termine toggle the
  document body between text and search panel; results persist until a new search runs;
  selecting an interview in the list closes the search view (`selectInterview` calls
  `setSearchView(null)`).
- **Forma**: client-side scan of all canonical texts via new batch proxy
  `GET /api/lexo/texts/corpus` (`{fileId: text}`, cached per session in `corpusTextsRef`).
  Case-insensitive; wildcards `*` (any within-word sequence) and `?` (one within-word char) —
  implemented as `[^\\s\\p{P}\\p{S}]` with flags `giu`, so jollys never cross spaces or
  punctuation. Context window `SEARCH_CONTEXT_CHARS` (50) word-snapped.
- **Concetto / Termine**: new proxy `POST /api/lexo/attestations/by-observable` (forwards
  observable/limit/offset, limit 500). Blocked comboboxes (values only from the lexicon:
  `concepts` with per-concept attestation counts / `lexicalEntries`, lazy-loaded on view open).
  Clicking a value runs the search immediately; typing runs on Enter when exactly one item
  matches. Term search = entry → senses → by-observable in parallel (paradigmatic only;
  narrative same-term attestations need a LexO-side service — upstream issue pending).
- **Results table** (`.kwic-scroll`, single grid with `subgrid` rows — head/filters/rows share
  tracks and stay aligned; header sticky): forma = 4 columns (Documento | Contesto sinistro |
  Keyword | Contesto destro); concetto/termine = 2 columns (Documento | Annotazione) with the
  attestation value bold and contexts (only when value < `SEARCH_KEYWORD_CONTEXT_MIN` = 40
  chars) merged into the same cell. Doc column `fit-content(120px)` with filter input capped
  (`max-width: 105px`) so the input never inflates the auto track; left context is a
  `justify-content: flex-end` flex cell (overflow clipped on the left, keyword-nearest words
  always visible); right context ellipsizes by design. Per-column "contains" filters + client
  pager (20/page, `SEARCH_PAGE_SIZE`).
- **Search refinements (v0.14.19 – v0.16.5)**: contexts are ALWAYS computed in concetto/termine
  (no length threshold). Term search is the UNION of senses (by-observable, paradigmatic) and a
  corpus scan of ALL attestations (new batch proxy `GET /api/lexo/attestations/corpus`,
  `attestationsCorpusRef` cache) matching `rdfs:comment` === entry label (case-insensitive) or
  `lexicalEntry` metadata === entry IRI — narrative imported + in-app included; dedupe by
  attestation IRI. Concept search also gained the paradigmatic attestations of the concept
  (corpus scan: observableTypes LexicalSense + referringConcept === concept). Rows carry
  `kind` (narrativo/paradigmatico) + `term`/`concept` cross columns; anno-mode table is 3
  columns (Documento | Annotazione | Termine o Concetto, third column "—" when unresolvable)
  with a third per-column filter. A select filters Tutte / Solo narrative / Solo paradigmatiche
  (value "tutte" = no kind constraint — it is NOT an AND of kinds); searching starts on combobox
  value click or Enter (auto-select when exactly one match). Search inputs have an embedded ×
  clear button; forma has a "Solo occorrenze in annotazioni" checkbox (match contained in an
  attestation span of the same document, via attestations corpus).
- **Click-through**: row click opens the row's interview (`selectInterview`) then
  `pendingScroll` scrolls the text area to the match and drops persistent `.search-flash`
  overlays (removed on the next pointerdown anywhere, or when reopening a search view).
  `drawAnnotationsLayer` re-runs on search-view swap (deps include `searchView`). Search
  buttons are disabled while an annotation/creation session is open (`selection !== null`).

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

### Lexical Entry Persistence & Read-Only Display (v0.7.1)

- **Narrative metadata persistence**: the lexical entry IRI chosen at creation is now saved in
  attestation metadata under `https://lexo.ilc.cnr.it#lexicalEntry` (via `narrativeMetadata`,
  `lexicalEntryProperty`), so it is recoverable when re-opening the annotation.
- **Paradigmatic recoverability**: paradigmatic attestations store the sense IRI as `observable`
  (plus `referringConcept`); the entry is resolved client-side via `entry.senses.includes(observableIri)`.
- **Read-only display in edit mode**: for existing concepts the "Entrata lessicale" panel renders a
  static `.concept-entry-readonly` div (label resolved via `resolveLexicalEntryLabel` from
  `lexicalEntries`; falls back to "Nessuna entrata associata" for annotations created before v0.7.1,
  which have no persisted entry). No `cursor: wait` in read-only state (that CSS is reserved for loading).
- **Timing**: `editAnnotation` never stores raw non-resolvable IRIs into `lexicalEntry`; resolution
  happens at render time when `lexicalEntries` finish loading.

### Localization (v0.8.0 — Phase 1: the annotation tool)

- **Dictionary**: `app/strings.ts` exports `dictionaries: Record<Lang, Dict>` (`it` source of truth,
  `type Dict = typeof it` so TypeScript rejects missing keys in `en`), plus `detectInitialLang()`.
  Strings are strings or interpolation functions (`t.errors.saveDetail(detail)`).
- **Language state**: `useSyncExternalStore(subscribeLang, getLangSnapshot, getServerLangSnapshot)`
  in `app/page.tsx` — server snapshot always `"it"` (no hydration mismatch); client snapshot reads
  `localStorage["fi-lang"]` → fallback `navigator.language` (en* → en). Switch writes localStorage,
  notifies subscribers and sets `document.documentElement.lang`.
- **Rule: only display labels are translated.** Values persisted to LexO-server are NEVER translated:
  `definitionType` Italian literals (`definitionTypeValues`), `evidenceStatus` "attestato"/"inferito",
  polarity MARL IRIs, `pragmaticUsage`/`note` free text. `parsePolarity`/`parseDefinitionType`/
  `parseEvidenceStatus` must keep reading the persisted values.
- LexO data (concept/entry labels, interview metadata), technical error details from proxies and
  bibliographic titles stay untranslated. Numbers use `numberLocale` (`en-US`/`it-IT`).
- Phase 1 (v0.8.0) covers nav + workspace (archive, document, concept panel, action bar, modals,
  context menu, growl) and the imperative graphic layer. NOT yet translated (phase 2): landing /
  publications / contacts pages, statistics placeholder, module-scope technical error
  ("Tempo massimo superato durante l'importazione bulk").

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

## Known Limitations & Next Steps

- **Dependency audit**: `npm audit --omit=dev` is CLEAN since next 16.3.4 (`fix/next-16-3-4`
  branch merged, pin 16.3.4 exact — verified against vinext beta.5 with full build + smoke).
  Remaining `npm audit` advisories are dev/build-only (vite, ws, undici — two Windows-specific)
  and are accepted: they do not run on the server and are pinned by the frozen vinext beta
  toolchain.

- **Imported term lost on re-save**: re-saving an imported annotation in the app rebuilds
  attestation metadata from `narrativeMetadata(options)` only, so the producer's
  `rdfs:comment` term (see v0.12.0) disappears after the first edit. Planned: re-emit
  `rdfs:comment` in `narrativeMetadata` when the parsed `term` is present.
- **Localization phase 2**: the static pages (Il Progetto, Pubblicazioni, Contatti), the
  statistics placeholder aria, and the module-scope bulk-conversion timeout string
  ("Tempo massimo superato durante l'importazione bulk", page.tsx) are still Italian-only.
- **Annotation-only deletion of one interview**: deleting an interview removes everything
  referencing it; deleting only its annotations (keeping the text) is a different LexO
  operation, not implemented.
- **Corpus selector**: TXT/MD uploads never send `corpusId` (no corpus); JSON files carry
  their own optional `metadata.corpus`. An optional corpus picker for TXT/MD uploads is a
  possible future addition (requires a corpus-list service).

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
