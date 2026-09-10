# DECISIONS.md — Schermate di ricerca NARRALEX (CQ1–CQ3)

Stato: **M1–M4 implementate (v0.20.4)** — pannello iniziale, ponte SPARQL,
CQ1 e CQ2 completi. Rinviate: CQ3 (manca la query SPARQL), network graph
CQ1 (manca la query di co-occorrenze).
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
| CQ1 – Concepts by polarity | fattibile in parte | Query narrative + paradigmatiche consegnate; **network graph e co-occorrenze RINViate**; breakdown età/genere derivabile client-side da `concept_detail` |
| CQ2 – Corpus evidence | fattibile in parte | Parametri entry+polarity coperti; testo passaggio via servizi esistenti (da studiare); `Sort by` da definire |
| CQ3 – Speaker variation | **RINVIATA** | Manca la query SPARQL centrale (intervistati distinti per concetto × età × sesso) e i denominatori; si riparte appena consegnate |

### Attività rinviate
1. **CQ3**: nessuna implementazione senza la SPARQL mancante.
2. **Network graph CQ1**: rinviate le query di co-occorrenza; se non arriveranno,
   le creeremo noi in un secondo momento. Layout radiale (clustering per polarità,
   zero dipendenze) resta la decisione di design quando si farà.

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

- **Denominatore CQ3** (per quando riprenderemo): % = N concetto-gruppo /
  popolazione del gruppo — ma la popolazione è (a) tutti gli intervistati del
  gruppo nel corpus o (b) solo quelli con attestazioni per la lexical entry?
  La specifica suggerisce (b), da confermare esplicitamente.
- **CQ2 – Sort by**: opzioni da definire (esempio nel mockup: "Age (ascending)").
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
