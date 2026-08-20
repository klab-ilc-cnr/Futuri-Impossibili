# AGENTS.md

## Progetto

Interfaccia web React per il progetto **Futuri (im)possibili**: caricare, leggere, annotare e
interrogare le trascrizioni delle interviste ai ragazzi di Caivano, con un dizionario narrativo
(concetti associati alle parole di indagine). Il backend è **LexO-server** (Java/Tomcat),
contattato SOLO tramite i proxy API in `app/api/lexo/*` (mai direttamente dal client).

## Stack (attenzione: non è Next puro)

- **Next.js 16 App Router eseguito su Vite** tramite **vinext** (Next-on-Vite,
  pinned `1.0.0-beta.5`) + `@cloudflare/vite-plugin` (workerd/miniflare).
  La build NON è `next build`: si usa `npm run build` → `vinext build`.
- React 19, TypeScript, Tailwind CSS 4 (postcss), drizzle (INUTILIZZATO).
- Il progetto è nato da uno scaffold "site-creator" (Codex/Cloudflare): restano residui
  del template (vedi "File morti").

## Comandi

Guida operativa completa (installazione locale, build, proxy, deploy VM e Apache) in
`INSTALL.md`; i dettagli della prima installazione sulla VM in `deploy/README.md`.

- `npm ci` — installa (Node >= 22.13). Su macchine con npm 11 che blocca i postinstall,
  se mancano i binari nativi: `node node_modules/workerd/install.js` e
  `node node_modules/esbuild/install.js`.
- `npm run dev` — dev server (porta 3000, vedi output); l'app è su
  `http://localhost:3000/futuri-impossibili` (il basePath è attivo anche in dev).
  **Nota**: `vinext dev` gira dentro workerd/miniflare, che NON riesce a raggiungere
  IP privati come il LexO di test (`{{LEXO_TEST_URL}}` — "Network connection lost").
  Per testare le API contro il backend remoto usare `npm run start` + `start:proxy` (sotto).
- `npm run build` — build di produzione (`vinext build` → `dist/`).
- `npm run build:deploy` — build + `deploy/post-build.sh` (sposta gli asset hashed da
  `dist/client/futuri-impossibili/_next` a `dist/client/_next`). **Da usare SEMPRE per i deploy**.
- `npm run start` — server di produzione locale (porta 3000, `-p`/`-H` per cambiarla; serve `dist/`).
  **Nota**: in `vinext start` gli asset `_next/static` sono serviti solo alla root, quindi il sito
  va visto tramite il proxy locale (sotto), non direttamente sulla 3000.
- `npm run start:proxy` — reverse-proxy locale (Node, `deploy/local-proxy.mjs`, porta 3001): riscrive
  `/futuri-impossibili/_next/static/*` → `/_next/static/*` e inoltra tutto il resto a `vinext start`.
  Replica le 2 regole Apache del reverse proxy. **Flusso per testare in locale**: `npm run build:deploy`,
  `npm run start`, poi in un’altra shell `npm run start:proxy` e aprire
  `http://localhost:3001/futuri-impossibili/`. Per usare il backend remoto su questa macchina:
  `LEXO_SERVER_URL={{LEXO_TEST_URL}} npm run start`.
- `npm run lint` — eslint: 0 errori; accettati i 3 warning `<img>` in `page.tsx` e il
  warning `useCallback` per la dependency `conceptFilter` in `drawOverlayBars`
  (voluta: il filtro concetti deve far ricalcolare le barre).
- `npm test` — **si rompe per design**: i test del template puntano ad `app/_sites-preview/`
  (mai esistito in questo repo). Non "sistemarli".
- Typecheck `npx tsc --noEmit`: gli errori in `worker/index.ts` e `db/index.ts`
  (`cloudflare:workers`, `Fetcher`, `D1Database`) sono pre-esistenti e attesi (file morti).

## Architettura

- SPA: `app/page.tsx` è `"use client"` e contiene tutta l'interfaccia; i menu sono bottoni
  (stato client-side, nessuna route). Il layout è `app/layout.tsx` (root layout + metadata).
- `app/api/lexo/**` — route handler che fanno da **proxy** verso LexO-server: leggono
  `LEXO_SERVER_URL` (default `http://localhost:8080/LexO-server`, senza slash finale) e, in
  alcune route, `LEXO_SERVER_AUTHORIZATION`. Client sempre con `cache: "no-store"`.
- Backend di test raggiungibile dalla macchina di sviluppo:
  `{{LEXO_TEST_URL}}`. Sulla VM di produzione è su
  `http://localhost:8080/LexO-server` (stessa macchina).

### Bug noto LexO-server sul delete concetto (issue upstream #17)

`GET /service/delete/lexicalConcept` (usato dal proxy `DELETE` di `lexical-concept/route.ts`)
**NON cancella davvero**: lo SPARQL update opera sul named graph `…/graphs/lexical/lexica`
(vuoto), mentre i concetti nuovi sono in `…/graphs/lexical/lexicalConcept` → LexO risponde
200+timestamp ma il concetto resta (riappare su refresh della lista). La GUI permette comunque
"Elimina" dal menu contestuale; il concetto sembra sparire finché non si ricarica la pagina.
**Fix in attesa upstream** (issue https://github.com/andreabellandi/LexO-server/issues/17).
Non cercare workaround lato client; semmai il problema va risolto in LexO-server
(`SKOSManager.deleteLexicalConcept` dovrebbe usare `LexiconCrudSupport.lexicalConceptGraphUri()`).

Attenzione: gli IRI dei concetti contengono `+` (offset UTC, es. `…_416+02_00`). Il DELETE di
LexO fa un `URLDecoder.decode` extra, quindi il proxy DEVE **doppio-encodare** `id`
(`new URLSearchParams({ id: encodeURIComponent(id), ... })`) perché il `+` arrivi intatto
(single-encode lo trasforma in spazio → "does not exist").

## Rendering delle annotazioni nel testo

- `drawOverlayBars` (`app/page.tsx`) disegna le barre sotto le annotazioni leggendo le
  coordinate dei `mark[data-annotation-index]` e `.overlap-text[data-annotations]` dal DOM.
  Il `useLayoutEffect` che lo chiama ha tra le deps `workspaceVisible` (cioè
  `activePage === 4`): il testo e le attestazioni vengono caricati in background PRIMA di
  entrare nella sezione "Costruisci Dizionario", quindi senza quella dep l'effetto non
  riparte al mount e le barre mancano fino al primo click su un'annotazione. Non rimuovere
  quella dipendenza.
- La banda gialla è continua grazie al solo `box-shadow: 2px 0` (NON `-2px 0`) su
  `.mark`/`.overlap-text`: un'ombra a sinistra dipinta dopo (ordine DOM, `position: relative`)
  taglierebbe l'ultimo glifo del segmento precedente (es. la "o" di "sesso" dentro
  "sesso, però").
- **Barre vs hit-testing del drag**: le `.bar` (figli assoluti di `.annotation-layer`) e le
  `.locus-handle` (con i pseudo-elementi `::before`/`::after` che disegnano knob e asta a
  cavallo del boundary) sono elementi vuoti/assoluti che `document.caretPositionFromPoint`
  restituisce come `offsetNode` (elemento, non testo): `textOffsetAtPoint` calcolava allora un
  offset sbagliato — le `.bar` facevano "saltare" il boundary a fine documento (es. offset
  `2560`), le maniglie lo facevano **oscillare** tra "fine riga N / inizio riga N+1" sui
  soft-wrap (impossibile fissare il boundary destro). `pointer-events: none` NON risolve
  (l'hit-test del caret lo ignora), solo `display: none` funziona: per questo
  `textOffsetAtPoint` nasconde temporaneamente sia `annotationLayerRef` sia le `.locus-handle`
  durante il calcolo e li ripristina in `finally`. Non rimuovere.
- **Line-height uniforme**: `.text-area` ha `line-height: calc(1.5em + var(--bar-step))`,
  così OGNI riga (annotata o no) riserva gli 8px per le barre. Se le righe annotate fossero
  più alte delle altre (com'era, con il solo `mark` a 33.5px e il testo a 25.5px), l'altezza
  del documento cambierebbe al variare dei confini dell'annotazione e tutto il testo sotto
  "salterebbe" di 8px a riga durante il drag del locus. Il `lineHeight` inline è stato tolto
dal `mark` perché ridondante (equivale alla base). `.overlap-text` conserva lo spazio extra
  `* (N+1)` per le barre impilate.

## Locus editing drag & highlight wrapping (v0.5.5)

**Status**: RESOLVED (v0.5.5).

### Problem description & diagnosis
- In previous versions (<= v0.5.3), dragging locus handles modified React state on every `pointermove`, causing continuous DOM re-mounting, sub-pixel kerning shifts of text fragments, and shaking/feedback loops.
- In v0.5.4, the preview boxes had opaque solid backgrounds covering text, and post-drag commits split words across inline `<mark>` boundaries, causing words on line N+1 to reflow/jump to line N.
- Multi-line highlights had a "broken ribbon" visual artifact across soft-wraps due to default `box-decoration-break: slice`.

### Solution applied (Locus Overlay & Zero-Split DOM)
- **Zero-split text DOM**: During the entire `locusEditing` session, text nodes in the DOM remain 100% intact and are never fragmented across word boundaries by inline marks. The active highlight and interactive start/end handles are rendered entirely in `.locus-drag-preview-layer`.
- **Text visibility & highlight blend**: Overlay boxes use `mix-blend-mode: multiply` and `rgba(85, 175, 125, 0.38)` so the black text underneath remains 100% sharp and readable.
- **Deterministic hit-testing**: `textOffsetAtPoint` (`app/page.tsx`) traverses visible text nodes with `TreeWalker`, finds the candidate visual line with minimal vertical distance (`distY`), and performs binary search on character bounds via `Range.getBoundingClientRect()`.
- **Line fragment decoration**: Added `-webkit-box-decoration-break: clone; box-decoration-break: clone;` in `app/globals.css` to `.text-area mark`, `.text-area .overlap-text`, and `.text-area mark.locus-editing`.

## basePath — regole obbligatorie

L'app gira sotto `/futuri-impossibili` (`next.config.ts`, default da `NEXT_PUBLIC_BASE_PATH`).
**Bug upstream noto**: vinext (0.0.50 e 1.0.0-beta.5) NON serve gli asset sotto il basePath in
`vinext start` — gli export `__basePath`/`__assetPrefix` non vengono emessi nel bundle.
Il workaround è già in place (post-build move + rewrite del reverse proxy). **Non cercare di
"fixare" vinext**: aggiungere una regola nel proxy o nel post-build, non toccare i node_modules.

- In `app/page.tsx` ogni URL client root-relative DEVE usare il prefisso `basePath`
  (costante definita sopra le costanti endpoint: `textsEndpoint`, `attestationsEndpoint`, ecc.
  e le `<img src>`). Un nuovo `fetch("/api/...")` o `<img src="/...">` senza prefisso
  si rompe in produzione.
- `app/globals.css` ha un solo `url()` hardcoded con prefisso
  (`/futuri-impossibili/sentiment.webp`): il CSS non può leggere env, va tenuto in sync col default.
- `app/layout.tsx`: favicon prefissato a mano (vinext non lo fa da solo).

## File morti / non toccare

- `app/chatgpt-auth.ts` — auth hosting OpenAI/ChatGPT, mai importata.
- `db/`, `worker/index.ts`, `.openai/hosting.json`, `drizzle*`, `examples/`, `tests/` —
  roba del template Cloudflare/D1 non usata (la UI usa solo i proxy API).
- `Avvia-LexO.command` — launcher dev macOS-only del developer originale, con path cablato
  `/Users/andreabellandi/.cache/codex-runtimes/...` e `open` (macOS). Inutile su Linux,
  NON eseguirlo; su Mac apre `http://localhost:3000/futuri-impossibili`.

## Deploy (sintesi; runbook completo in `deploy/README.md`)

- VM Alpine `{{VM_IP}}`: progetto in `/opt/futuri-impossibili`, utente `futuri`,
  servizio openrc `/etc/init.d/futuri-impossibili`, porta `3001` su `0.0.0.0`,
  log in `/opt/futuri-impossibili/futuri-impossibili.log`.
- `.env.local` sulla VM: `LEXO_SERVER_URL=http://localhost:8080/LexO-server` e
  `NEXT_PUBLIC_BASE_PATH=/futuri-impossibili` (default comunque coperto).
- NAT: bastion (`{{BASTION_IP}}`) con iptables `{{NAT_PORT}} → {{VM_IP}}:3001` (source limitato
  al reverse proxy); ssh/scp verso la VM via porta `{{SSH_PORT}}` (es. `scp -P {{SSH_PORT}} ... {{BASTION_IP}}:/tmp`).
- URL pubblica: `https://{{PUBLIC_HOST}}/futuri-impossibili` — Apache con 2 regole:
  `/futuri-impossibili/_next/static` → `/_next/static` (asset) e `/futuri-impossibili/`
  in passthrough (pagina, API, file pubblici).
- Aggiornamento: la VM NON ha git → tgz dei sorgenti (comando nel `deploy/README.md`),
  extract su `/opt/futuri-impossibili`, `npm ci && npm run build:deploy`, `rc-service
  futuri-impossibili restart`. **Mai deploy senza `build:deploy`**, altrimenti gli asset 404.

## Convenzioni

- Commit: messaggi in italiano, lowercase, stile "verbo passato"
  (es. "introdotto base path /futuri-impossibili per il deploy sotto directory").
- Codice: non aggiungere commenti se non richiesti.
- Versioning dell'interfaccia: semver `x.y.z` basta una costante `appVersion` in
  `app/page.tsx` (renderizzata come `v…` a destra in `main-nav`, classe
  `.main-nav-version`). Bump: `x`=cambi grossi/breaking, `y`=nuove feature,
  `z`=bugfix. Agganciare il bump al commit che introduce la modifica.
- Smoke test proxy: `curl http://<host>:<porta>/futuri-impossibili/api/lexo/lexical-concepts`.
