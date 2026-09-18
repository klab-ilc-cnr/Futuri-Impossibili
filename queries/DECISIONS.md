# DECISIONS.md — Schermate di ricerca NARRALEX (CQ1–CQ3)

Stato: **M1–M4 + CQ3 implementate (v0.21.0)** — pannello iniziale, ponte SPARQL,
CQ1, CQ2, CQ3 e network graph CQ1 completi (client-side). Rinviate: query
(manca la query di co-occorrenze).
Fonti: `queries/00_pannello_iniziale.md`, `01_cq1_concepts_by_polarity.md`,
`02_cq2_corpus_evidence.md`, `03_cq3_speaker_variation.md` e le SPARQL
`filterd_concept_by_polarity.sparql`, `filtered_paradigmatic_concept.sparql`,
`concept_detail.sparql`.

## Stato implementazione

- **v0.18.0** — M1: proxy `POST /api/lexo/cq/[queryId]` + template SPARQL in
  `app/cq/sparql.ts` (vereblati fedeli alle tre query consegnate, `{{TOKEN}}`
  parametrizzati; uso di `String.raw` per preservare gli escape `\\s` SPARQL).
  M2: componente `app/cq/panel.tsx` (pannello iniziale, card CQ1/CQ2/CQ3 con
  CQ3 disabilitata «In preparazione», preview SPARQL via parametri d'esempio,
  pannello «in costruzione» per Open analysis panel), nav item esistente
  «Interrogazioni/Queries» (index 3, `activePage === 3`), stringhe `cq` in
  `strings.ts` it/en.
- **v0.19.0** — M3: `app/cq/cq1.tsx` (CQ1 list view). `basePath` estratto in
  `app/base-path.ts` (importato anche da `page.tsx`). Selezione entry
  (auto-select della prima), chips polarità multi-toggle (qualsiasi
  sottoinsieme, min 1), sort (Intervistati/Occorrenze/A–Z/Z–A, default
  Intervistati = misura primaria), pannelli polarità con barre + troncamento
  a 8 e «Mostra tutti», pannello «Concetti paradigmatici» (seconda query),
  donut Distribuzione complessiva (SVG, solo polarità selezionate, %
  ricalcolate sul totale selezionato), dettaglio concetto (intervistati
  distinti, occorrenze, età più rappresentata, ripartizioni età/genere) con
  passaggi idratati via cache attestazioni, esportazione CSV dei passaggi.
  Verificato end-to-end con backend finti (LexO + GraphDB) via proxy reali.
- **v0.20.0** — M4: `app/cq/cq2.tsx` (CQ2 Corpus evidence, client-side per
  decisione 9). Frase-query con i due selettori inline (entry + polarità,
  un'unica coppia di controlli); filtri secondari età (per anno, dalle età
  presenti nel result set) e genere (M/F); sort Età crescente/decrescente/
  ID A–Z (default età crescente); box Search configuration (solo riepilogo,
  non editabile); «Concetti nei risultati» con barre comparative (display-only,
  interazione = punto aperto); tabella passaggi 6 colonne con paginazione 20/
  pagina, range «X–Y di N» e export CSV; click su riga → riga espansa con
  contesto KWIC (windowing della ricerca esistente) + metadati parlante.
  Result set = attestazioni **narrative** per term (match case-insensitive su
  `rdfs:comment` o metadata `lexicalEntry` = IRI dell'entry) con polarità
  MARL = quella selezionata (specchia la ricerca «Termine», NON usa SPARQL).
  Conseguenza nota: i conteggi client (es. femmina: 72 positive / 45
  negative) sono leggermente maggiori dei corrispettivi SPARQL (69/41) perché
  il client è l'unione comment+lexicalEntry mentre la SPARQL matcha solo
  `rdfs:comment` esatto — differenza attesa e accettata. Utility condivise
  estratte in `app/cq/shared.ts` (parsing, demografia, KWIC, CSV, costanti).
- **v0.20.1** — pannello iniziale: «Apri pannello di analisi» sempre attivo
  (la specifica 00 prevedeva l'abilitazione solo dopo selezione — cambiato su
  richiesta: al click seleziona anche la card, così la preview resta coerente).
- **v0.20.2** — CQ1: donut «Distribuzione complessiva» spostato nella colonna
  laterale sopra «Dettaglio concetto» (prima occupava l'intera larghezza della
  colonna principale con molto spazio bianco); i pannelli polarità salgono in
  cima alla colonna principale.
- **v0.20.3** — CQ2: barre dei «Concetti nei risultati» colorate per polarità
  (verde/giallo/rosso, come CQ1 — prima tutte verdi). Cursore `progress`
  (spin) su tutto il pannello durante i caricamenti, in entrambe le CQ.
- **v0.20.4** — CQ2: filtri «contiene» per colonna nella tabella passaggi
  (case-insensitive, sticky con l'header, reset paginazione e chiusura riga
  espansa a ogni digitazione; colonna Polarità esclusa perché costante).
  Coesistono con i select Età/Genere della specifica (il select è esatto,
  il filtro colonna è contains).
- **v0.20.5** — corretto il wrap del contesto nella riga espansa CQ2:
  la cella ereditava `td:first-child { white-space: nowrap }` (specificità
  CSS) → classe dedicata `td.cq2-context-cell` con `white-space: normal`.
- **v0.21.0** — CQ3 speaker variation (client-side): fasce d'età condivise
  **12–16 / 17–21 / >21** (a gruppi di 5 anni, su richiesta del team; usate
  anche dal filtro età di CQ2), denominatore = popolazione del gruppo nel
  corpus (decisione (a), mostra anche gli 0%), colonna Età di CQ2 con anno
  esatto (il filtro colonna «contiene» permette la selezione fine, es. «15»),
  concetti = unione narrativi + paradigmatici dell'entry, polarità mostrata
  ma non filtrabile, bar chart per concetto (categorie = fasce, serie F/M,
  % sul gruppo), heatmap per multi-concetto (righe = concetti, colonne =
  fascia × genere, cella = % sul gruppo, click → drill-down), tabella con
  N e % sempre, 0/0% esplicito, sort per % totale decrescente o A–Z.
- **v0.21.1–v0.21.3** — CQ3: Search configuration ristrutturata come pannello
  laterale (mockup del progettista): entry dropdown, concetti **multi-select
  a chip rimovibili** con combobox «Aggiungi concetto…» (digiti dentro il
  select, la lista si restringe con startsWith, Enter/click per aggiungere,
  Esc chiude, lista «Nessun concetto…» quando zero match), filtri Gruppi di
  età e Genere a dropdown che riducono i gruppi confrontati (una fascia +
  tutti i generi = confronto F/M nella fascia), vista a radio Barri/
  Heatmap/Tabella, sort «Frequenza (decrescente)»/A–Z. Cursore invisibile
  del text-field separato risolto (Tailwind preflight azzera gli input:
  classe con stile completo). Sort renominato Frequenza per fedeltà al mockup.
- **v0.21.4** — CQ3: rendering progressivo come CQ1/CQ2 (config sempre visibile
  e interattiva durante il caricamento, risultati con «Caricamento…» inline,
  errori non bloccanti).
- **v0.21.5** — pannello iniziale: click su tutta la card apre direttamente il
  pannello della CQ (deviazione dalla specifica 00, che prevedeva il pulsante
  «Apri pannello di analisi» — rimosso su richiesta; «Visualizza query» resta
  con stopPropagation); card role="button" con Enter/Spazio; stringhe openPanel
  rimosse, about aggiornato.

### Contratto proxy `POST /api/lexo/cq/[queryId]`

- `queryId`: `cq1-narrative-concepts-by-polarity` | `cq1-paradigmatic-concepts`
  | `cq1-concept-detail` (404 se sconosciuto).
- Body JSON: `term` (label, sanitizzato, tag `@it` forzato), `polarity`
  (positive|neutral|negative → marl:), `concept` (IRI http/https validata,
  racchiusa in `<>`), `sex` (Maschio|Femmina|Tutti), `ageMode` (maggiore di|
  minore di|compreso tra|età esatta|qualunque), `age1`/`age2` (interi 0–120,
  default 0), `residence` (testo, default "").
- Risposta: `{ queryId, variables: string[], rows: Record<string, string>[] }`
  (binding SPARQL normalizzati: solo il `value`).
- Guardie: sanitizzazione di apici/backslash/spazi in label e residence,
  enum per sex/ageMode/polarity, validazione sintattica dell'IRI,
  **solo SELECT** (i template sono statici e firmati col codice; il client non
  invia mai SPARQL).
- Env: `GRAPHDB_SPARQL_URL` (default
  `http://localhost:7200/repositories/LexOLexica`, senza trailing slash) e
  `GRAPHDB_AUTHORIZATION` opzionale.
- Verificato end-to-end: workerd (vinext start) raggiunge GraphDB via loopback
  (finto GraphDB in smoke test); parametrizzazione e normalizzazione OK.

## Architettura dati

### Esecuzione SPARQL
- Lo swagger di LexO **non espone** un servizio pass-through SPARQL (in verifica
  con i colleghi backend). Finchè assente: il proxy dell'app parla **direttamente
  con GraphDB** via `http://localhost:7200/repositories/LexOLexica`
  (protocollo SPARQL standard, POST con `query=`). In produzione l'app gira
  sulla stessa VM del backend → loopback, la porta 7200 non è esposta al mondo.
- Repository: **LexOLexica** (le query federano con `SERVICE <repository:LexOTexts>`
  dove serve). **Accesso senza credenziali**, test e produzione coincidono →
  **massima cautela: niente query di scrittura/cancellazione**, solo SELECT.
- **Le query SPARQL risiedono come template nel proxy** (`app/api/lexo/*`):
  il client invia solo `cqId + parametri` (term, polarity, filtri demografici).
  **Mai SPARQL arbitraria dal client.** Query versionate col codice.
- Le SPARQL consegnate hanno parametri hardcoded (`VALUES`) da inizializzare
  con dati di esempio: vanno **parametrizzate lato proxy** prima dell'esecuzione.

### Modifiche alle query
- Possiamo **modificare le SPARQL consegnate**, motivandolo. Motivazione già nota:
  `concept_detail.sparql` non restituisce il testo del passaggio (value/offset)
  — serve per la tabella passages di CQ1/CQ2.

### Testo dei passaggi (CQ1/CQ2)
- Da recuperare **dal backend con i servizi esistenti** (ricerche per
  termine/concetto già implementate: `attestations/by-observable`,
  `attestations/corpus`, windowing KWIC client-side). Se insufficiente,
  si studia insieme una soluzione (estensione SPARQL o servizio LexO).

### Sviluppo locale
- Buone notizà (verificato): da `vinext start` (workerd) il server di test
  LexO (`{{LEXO_TEST_URL}}`) e GraphDB (`{{GRAPHDB_TEST_URL}}`, porta pubblica
  14720) sono raggiungibili direttamente, senza tunnel. Il vecchio caveat
  riguardava `vinext dev`. Workflow per provare l'area Interrogazioni con
  dati reali: `npm run build:deploy`, poi
  `LEXO_SERVER_URL={{LEXO_TEST_URL}} GRAPHDB_SPARQL_URL={{GRAPHDB_TEST_URL}}/repositories/LexOLexica npm run start`
  + `npm run start:proxy`, aprire `http://localhost:3001/futuri-impossibili/`.
  Repo GraphDB: `LexOLexica` (lessico) e `LexOTexts` (testi, federato via
  `SERVICE`), senza credenziali, test e produzione coincidono (solo SELECT!).

## Scoping iniziale (CQ per CQ)

| CQ | Stato | Note |
|----|-------|------|
| Pannello iniziale | fattibile subito | Nessun dato lessicale richiesto; SPARQL come stringhe statiche (solo preview) |
| CQ1 – Concepts by polarity | completo | Query narrative + paradigmatiche consegnate; **network graph implementato** (v0.22.0, client-side, § specifica `queries/04_network_graph.md`); breakdown età/genere derivabile client-side da `concept_detail` |
| CQ2 – Corpus evidence | fattibile in parte | Parametri entry+polarity coperti; testo passaggio via servizi esistenti (da studiare); `Sort by` da definire |
| CQ3 – Speaker variation | **RINVIATA** | Manca la query SPARQL centrale (intervistati distinti per concetto × età × sesso) e i denominatori; si riparte appena consegnate |

### Attività rinviate
1. **CQ3**: nessuna implementazione senza la SPARQL mancante.
2. ~~**Network graph CQ1**~~: risolto in v0.22.0 **senza query di co-occorrenza** —
   calcolata client-side dalle cache esistenti + testo canonico (dettagli sotto).

## Decisioni prese

1. **Accesso pubblico**: le CQ non modificano dati, nessun gate password.
   (Nota tecnica: `reservedMenuItemIndex` è hardcoded a 4 — attenzione se si
   aggiungono nav item.)
2. **Età per anno, niente fasce**: le query restituiscono il dato granulare
   (età esatta per intervistato); l'aggregazione per anno (e qualsiasi futura
   fascia) è una **trasformazione client-side**. Nessun bin server-side.
3. **Grafo radiale** quando/si se fa: layout radiale con cluster per polarità,
   SVG hand-rolled, **nessuna nuova dipendenza** (niente d3/cytoscape).
4. **Export CSV** client-side, semplice: funzionalità secondaria, minimo sforzo.
5. **Localizzazione it/en da subito**: ogni stringa nuova in `strings.ts`
   (`dictionaries` con chiave `it` + `en`, il tipo li rende obbligatori).
6. **1 intervista = 1 intervistato**: "intervistati distinti" = `COUNT(DISTINCT ?interview)`
   / distinct fileId.
7. **UI secondo design system esistente**: i mockup sono solo indicativi;
   riuso pattern KWIC esistenti (tabella `subgrid` sticky, filtri colonna,
   paginazione client, contesti snap).
8. **Navigazione**: nuovo item **"Interrogazioni / Queries"** (localizzato it/en).
   CQ3 **presente ma disabilitata** nel pannello iniziale (query SPARQL non
   ancora consegnata). Attenzione a `reservedMenuItemIndex` hardcoded a 4 se
   il nuovo item viene inserito prima dell'area riservata.
9. **CQ2 – result set via client-side (strada "a")**: passaggi recuperati
   dalla cache `attestations/corpus` esistente (stessa logica della ricerca
   "Termine": filtro su `rdfs:comment` + polarità MARL nei metadati),
   zero query GraphDB per interazione. Il proxy SPARQL resta usato per CQ1.
   Rischi accettati: primo caricamento batch (una richiesta, già in essere per
   le ricerche KWIC, cache per sessione); memoria proporzionale al corpus —
   se il corpus crescerà di ordini di grandezza si rivaluterà (ibrido SPARQL).
10. **Struttura codice**: 3 componenti separati (pannello CQ, CQ1, CQ2)
    importati da `page.tsx` — stesso pattern SPA, nessun routing nuovo.
    Nessun refactor del monolite esistente per ora (funziona tutto).

## Rischi noti accettati

- **Metadati parlante come testo libero**: età/sesso/residenza estratti via regex
  da `dct:description` ("Sesso: F, Età: 15, Residenza: …"). Un formato malformato
  produce silenziosamente "sconosciuto" (il filtro lo esclude ma non errore).
  Da accettare; eventualmente segnalare al team dei dati.
- **Accoppiamento diretto a GraphDB** (bypass di LexO): siamo dipendenti da
  nome repository, struttura grafi e formato metadati; futuri cambiamenti di
  LexO richiederanno revisione.
- **Proxy aperti**: come tutti i proxy esistenti, nessuna autenticazione;
  il danno massimo è lettura (solo SELECT, mai update/insert).

## Punti aperti

- **CQ2 – apertura full context / speaker metadata**: risolto in v0.20.0
  (riga espansa inline); **CQ2 – Sort by**: risolto (età crescente/decrescente/
  ID). **Denominatore CQ3**: risolto in v0.21.0 — opzione (a), popolazione
  totale del gruppo nel corpus.
- **Passaggio del tempo**: SPARQL pass-through di LexO in verifica — se
  arriverà, rivalutare l'architettura (proxy → LexO invece di GraphDB diretto).
- **CQ2 – apertura full context / speaker metadata**: forma da definire
  (drawer/modal/vista) — riusare pattern esistenti.
- **CQ1 – click-through passaggio → intervista**: differito (non previsto
  esplicitamente dalla specifica CQ1).
- **CQ1 – Realisation type** nella tabella passaggi: nessuna sorgente dati
  disponibile (né SPARQL né servizi esistenti) → colonna omessa.
- **Passaggio del tempo**: SPARQL pass-through di LexO in verifica — se
  arriverà, rivalutare l'architettura (proxy → LexO invece di GraphDB diretto).

## Punti aperti risolti (v0.19.0)

- **CQ1 – Overall distribution** con 1/2 polarità: mostra solo i segmenti
  delle polarità selezionate, percentuali ricalcolate sul totale selezionato.
- **CQ1 – selezione di 2 polarità**: chips toggle multi-select (qualsiasi
  sottoinsieme non vuoto di {positiva, neutra, negativa}).
- **CQ1 – "Frequency"**: risolto — la misura primaria è **intervistati
  distinti**; opzioni esplicite Intervistati / Occorrenze / A–Z / Z–A.
- **Query narrative a conteggio zero**: la SPARQL elenca tutti i concetti ×
  polarità (OPTIONAL) → il client scarta le righe con intervistati = 0 e
  occorrenze = 0.

## Domande ai colleghi backend

1. Esiste/arriverà un servizio pass-through SPARQL in LexO?
2. SPARQL mancanti: CQ3 (speaker variation) + denominatori; co-occorrenze
   per network graph (entrambe rinviate come scope, ma da consegnare).
3. Possibilità di estendere `concept_detail.sparql` con value/offset del
   passaggio (in alternativa: idratazione client-side via servizi esistenti).

## Network Graph CQ1 (v0.22.0)

Implementato secondo `queries/04_network_graph.md`, **senza nuove query SPARQL e
senza nuovi endpoint**: la co-occorrenza è calcolata client-side.

### Perché client-side è possibile (ricognizione sui dati reali)
- Il payload `/service/attestations/{fileId}` espone già la mappa attestazione→concetto:
  - **narrativa**: `observable` = IRI del concetto (`observableTypes` contiene
    `ontolex#LexicalConcept`), `rdfs:comment` = termine della entry;
  - **paradigmatica**: `observable` = sense della entry, `referringConcept` = concetto.
  Sui dati di test **0 attestazioni non attribuite**: nessun match per etichetta,
  nessuna ambiguità.
- `texts/corpus` fornisce il testo canonico di tutti i documenti (53/53 nei test):
  da lì si ricavano i **turni di risposta**.

### Unità di co-occorrenza: turno di risposta (non frase)
I testi hanno ogni riga etichettata `Intervistato:` / `Intervistatore:`.
Decisione del team: "frase" = **risposta completa dell'intervistato a un quesito**,
non la singola frase. Regola implementata (`buildRespondentTurns` in `shared.ts`):
unità = sequenza massima di righe consecutive dell'intervistato (le righe senza
prefisso ereditano il parlante precedente; le righe dell'intervistatore chiudono
l'unità); un'attestazione appartiene al turno in cui **inizia** il suo span.
Nessuna fusione attraverso backchannel brevi (regola semplice, decisa dal team).
Se il testo manca → **fallback documento** (unità dichiarata nel tooltip).
Sui dati di test: ~12.7 turni di risposta per intervista, **359/359 attestazioni
dentro un turno dell'intervistato**. Densità risultante (es. femmina): 87 archi /
18 nodi isolati (contro 54/24 a livello frase e 176/2 a livello documento).

### Topologia e nodi
- Entry al centro come **ancora visiva** (non nodo di co-occorrenza).
- Settori per polarità (dalla selezione CQ1) + **quarto settore grigio
  "Paradigmatici"**: i concetti paradigmatici non hanno polarità nel lessico
  (verificato: 0/18 con `hasPolarity`), quindi non possono stare nei tre settori
  colorati. I concetti presenti in entrambe le liste sono deduplicati (vince il
  narrativo, che ha la polarità).
- Peso arco = conteggio grezzo dei turni condivisi; nessuna Jaccard/PMI (§7).
- Leggibilità (**parametri interni, nessun pannello filtri**): soglia peso ≥1,
  **Top-K = 5** vicini più forti per nodo, **Top-8 nodi per settore** (con nota
  "N concetti non mostrati"). Pesi reali minuscoli (max 2–3): lo spessore è
  quasi-lineare con arrotondamento visivo.
- Layout **radiale deterministico**: anelli concentrici per settore, nodi ordinati
  per occorrenze decrescenti, angoli calcolati da `{start,end}` dell'attestazione
  e dalla lista turni (ricerca binaria) — nessun force layout.

### Interazioni
Click nodo → concept detail + tabella passaggi (stessi stati CQ1, nessuna seconda
implementazione); hover nodo/arco → tooltip (tooltip arco: forza, unità usata,
documenti); "Highlight co-occurring concepts" dal pannello dettaglio (evidenzia
vicini e archi, attenua il resto, reversibile); zoom (rotella, 0.4–4×) + pan +
"Adatta"; "Torna alla lista". In modalità grafo il sort è nascosto (§11).

**Rifiniture v0.22.1–v0.22.2 (usabilità archi).**
- **Area di click archi**: layer di hit invisibile (`stroke-width: 16`,
  `pointer-events: stroke`, cursore pointer) sopra il path visibile, che resta
  `pointer-events: none`; gli hit stanno sotto i nodi. L'encoding dello spessore
  non cambia.
- **Hover = solo evidenza, niente tooltip** (v0.22.3): l'elemento in hover + i
  nodi collegati si "illuminano" (arco più marcato, anello sui nodi) e il resto
  viene attenuato; il tooltip non appare, per non coprire il sottografo
  evidenziato. Hover su nodo = nodo + archi incidenti + vicini.
- **Tooltip solo al click** (v0.22.3), agganciato nell'angolo alto-destro del
  pannello (dove il grafo radiale non arriva) e non al punto del click, così non
  copre nodi/archi. Vale per archi e nodi; resta finché non lo si chiude con
  click sullo stesso elemento, click sullo sfondo, Esc o la ×. Mentre è fissato,
  l'hover altrove non lo sostituisce (scelta 1a) e l'evidenza resta.
- **Pulsante «Evidenzia concetti co-occorrenti» (v0.22.6)**: mostrato **solo in
  vista Lista** (è il ponte lista→grafo con il vicinato già evidenziato, non
  essendoci hover nella lista); in vista Grafo è nascosto perché ridondante (il
  click sul nodo fa lo stesso). Per togliere l'evidenza in grafo resta il
  pulsante «Rimuovi evidenziazione» nella barra del grafo. L'azione resta nel
  pannello dettaglio come da specifica §12.
- Precedenza evidenze: arco attivo (hover/fissato) > highlight del concetto
  selezionato > nessuna. Il click sull'arco non modifica la selezione del concetto.
- **Bug del pointer capture (v0.22.5)**: il `pointerdown` sull'SVG catturava
  sempre il puntatore (`setPointerCapture`), ritargettando gli eventi successivi
  all'SVG: il `click` non arrivava mai a nodi/archi (nessun tooltip, nessuna
  selezione, nessun aggiornamento di concept detail e passaggi). Ora la cattura
  avviene **solo se il pointerdown parte dallo sfondo** (drag/pan), quindi i
  click sugli elementi funzionano con input reale.

### Costi accettati
`texts/corpus` caricato **solo alla prima apertura della vista Grafo** (~120 KB
nei test), cache per montaggio del componente; resta il rischio noto di memoria
proporzionale al corpus (già accettato per CQ2/CQ3).

### Punti aperti (rimandati, come da §18 della specifica)
- raffinamento soglia/Top-K/Top-N dopo valutazione visiva del team;
- fusione dei turni interrotti da backchannel brevi;
- evoluzione a finestra di caratteri dagli offset (alternativa C);
- comportamento con 1/2 polarità selezionate (al momento: distribuzione uniforme
  dei settori visibili).


## Palette della polarità — verde "dato" distinto dal verde UI (v0.22.7)

**Problema**: il positivo usava `var(--green)` (`#174f3b`), lo **stesso token**
dell'accent UI (toggle Lista/Grafo attivo, bottoni) e quasi identico alla barra
del menu (`--green-dark` `#103a2c`): i nodi "dati" del grafo sembravano elementi
di interfaccia, e la palette era squilibrata (9.0 / 6.8 / 1.3 di contrasto).

**Scelta (A2)**: introdurre token dedicati per la **polarità nei dati**, separati
dal verde UI (che resta per menu, bottoni, toggle, focus):
- `--pos-fill: #4ea36a` — riempimenti (nodi grafo, donut, pallini, barre, sfondo chip): 2.95:1 sul fondo del grafo;
- `--pos-ink: #2f7a4c` — testi/bordi (etichette di settore, titoli pannelli, chip): 4.98:1;
- `--neu-fill: #e6c33c` — giallo "dato" (donut, pallini, nodi, barre): 1.63:1 (era 1.29);
- `--neu-ink: #756414` — testi neutri: 5.57:1 (prima `#8a761d` = 4.26:1, sotto AA).

**Perché non il blu**: tecnicamente ottimo (nessun blu nell'app → separazione
massima; blu/rosso/giallo è la terna più sicura per il daltonismo rosso-verde),
ma avrebbe divergato dalle **faccine di `sentiment.webp`** usate dall'annotazione,
il cui positivo è verde `#74be55`: A2 allinea invece le CQ all'annotazione.

**Giallo e scritte**: chip e "dato" hanno ruoli diversi. Il chip neutro resta
chiaro (`#ffe066`, testo `#5d4f10` intatto a 6.22:1); si scurisce solo il giallo
"dato", su cui non c'è testo. Non si insegue il 3:1 per il neutro: servirebbe
`#a88b1f`, un senape/marrone che snatura il "neutro".

**Bonus (v0.22.7)**: le etichette di settore `Positive`/`Negative` uscivano dal
`viewBox` del grafo e venivano tagliate; `viewBox` portato a `-460 -400 920 800`.


## Resa visiva del grafo: inquadratura, densità e marche (v0.23.0)

Problema segnalato dal team: molto spazio inutilizzato, nodi/etichette piccoli,
archi troppo sottili, titoli di settore lontani dai rispettivi grappoli.

**Diagnosi (misurata)**: il grafo era disegnato in un `viewBox` fisso 920×800
mentre il contenuto reale occupava ~571×570 unità → il contenuto veniva scalato
a 0,85 e il pannello (712×544) aggiungeva ~31% di spazio orizzontale inutile.
Inoltre il primo anello partiva a 132 unità (corona vuota al centro) e il titolo
di settore usava il raggio massimo **globale** (dettato dal settore negativo).

**Interventi (A+B+C+D)**:
- **A — `viewBox` adattivo**: si calcola il bounding box reale del contenuto
  (nodi, etichette visibili, titoli di settore) e lo si espande fino all'**aspect
  del pannello** misurato con `ResizeObserver`; l'SVG ha ora un'altezza dedicata
  (`clamp(460px, 66vh, 700px)`) per avvicinare l'aspetto del pannello a quello
  del contenuto. Scala risultante da 0,85 a **1,18** (+39%) con riempimento
  orizzontale 0,95.
- **B — anelli più compatti**: base 132→84, passo 92→80, spaziatura 60→34.
- **C — titoli di settore per-settore**, posizionati proiettando i nodi (e le
  loro etichette) **sull'asse del settore**, non in distanza euclidea: il titolo
  sta subito fuori dal proprio grappolo. Ancoraggio verso l'esterno
  (`start`/`end`/`middle` secondo il coseno) per non invadere i nodi.
- **D — marche più grandi**: raggio nodo 6–15 → 7–18, font etichette 9,5 → 11,5
  con alone chiaro (`paint-order: stroke`), archi 1,0–2,8 → 1,4–3,6, titoli 12.
- **Etichette con evitamento deterministico delle collisioni**: si etichettano
  prima i concetti con più occorrenze; chi si sovrappone a un'etichetta già
  disposta resta senza label (pallino + tooltip/click). Serve a sostenere
  l'aumento del numero di nodi senza un muro di testo.

**Trade-off documentato**: area del pannello fissa → più nodi mostrati = marche
più piccole. Con Top-8 per settore la scala ~1,18; con Top-16 scende a ~1,0;
con "tutti i concetti" servirebbero ~5 anelli (scala ~0,6), quindi per il "tutti"
andrebbe cambiato il packing (es. fillotassi) o ci si affida allo zoom.
