# NARRALEX – Pannello iniziale delle competency questions

## Riassunto delle scelte
- La feature è un'aggiunta alla piattaforma esistente: riusa shell, design system e servizi backend già disponibili.
- L'utente parte da un pannello con **3 competency questions (CQ)**.
- Ogni CQ ha un link **View query** per mostrare la formulazione SPARQL corrispondente.
- Dopo la selezione di una CQ, il pulsante **Open analysis panel** si abilita e apre la pagina specifica.
- CQ1 unifica le precedenti query “single polarity” e “grouped polarity”: la stessa pagina permette di visualizzare 1, 2 o 3 polarità.
- CQ2 recupera evidenza testuale dal corpus e consente restrizioni successive per età e genere.
- CQ3 confronta la distribuzione di uno o più concetti per età e genere; il grafico a barre è la vista primaria, con heatmap e tabella come viste alternative.
- I conteggi comparativi devono privilegiare **intervistati distinti**; le occorrenze restano un'informazione secondaria dove prevista.
- Non introdurre endpoint o schemi backend nuovi in queste specifiche: il coding agent deve mappare i dati sui servizi esistenti.

## Scopo della pagina
Pagina di ingresso alla nuova area di esplorazione. Permette di scegliere il tipo di interrogazione prima di aprire il relativo pannello analitico.

## Componenti

### 1. Titolo e testo introduttivo
- Titolo: **Explore NARRALEX through competency questions**.
- Breve testo che spiega che le CQ permettono di esplorare lexical entries, narrative concepts, corpus evidence e speaker variation.
- Nessuna nuova navigazione locale Home / Lexical entries / Search / About: usare la navigazione già prevista dalla piattaforma esistente.

### 2. Card CQ1 – Concepts by polarity
- Titolo: **CQ1 – Concepts by polarity**.
- Query: **Which concepts are associated with the narrative senses of a given lexical entry, by polarity?**
- Azione **View query**:
  - seleziona la CQ;
  - aggiorna il pannello Query preview;
  - mostra la SPARQL della CQ.
- **Open analysis panel** apre la pagina descritta in `01_cq1_concepts_by_polarity.md`.

### 3. Card CQ2 – Corpus evidence
- Titolo: **CQ2 – Corpus evidence**.
- Query: **Retrieve all corpus passages in which a narrative sense of a given lexical entry is associated with a concept of a specified polarity.**
- Azione **View query** come sopra.
- **Open analysis panel** apre `02_cq2_corpus_evidence.md`.

### 4. Card CQ3 – Speaker variation
- Titolo: **CQ3 – Speaker variation**.
- Query: **How does the distribution of one or more narrative concepts associated with a given lexical entry vary across speakers' age and gender?**
- Deve supportare la selezione di più concetti.
- Azione **View query** come sopra.
- **Open analysis panel** apre `03_cq3_speaker_variation.md`.

### 5. Query preview
- Mostra la CQ selezionata in linguaggio naturale.
- Mostra la corrispondente query **SPARQL**.
- Prima della selezione mostra uno stato informativo/vuoto.
- È una preview/inspection, non un editor SPARQL.

### 6. Open analysis panel
- Stato iniziale: disabilitato finché nessuna CQ è selezionata.
- Dopo la selezione: diventa attivo.
- Apre il pannello specifico della CQ.

### 7. About these queries
Box informativo sintetico:
- spiega che le CQ collegano lexical entries, narrative concepts, corpus evidence e speaker variation;
- chiarisce che **View query** = ispezione della SPARQL;
- chiarisce che **Open analysis panel** = esplorazione dei risultati.

## Flusso principale
1. Utente seleziona una CQ tramite card / View query.
2. Query preview mostra linguaggio naturale + SPARQL.
3. Open analysis panel si abilita.
4. Click → apertura della pagina CQ.
5. Il ritorno al selettore CQ usa il normale pattern di navigazione della piattaforma.

## Dati necessari
- Elenco CQ e identificatore.
- Testo della CQ.
- SPARQL associata alla CQ.
- Nessun dato lessicale è richiesto finché non viene aperto il pannello analitico.

## Stati
- **Vuoto**: nessuna CQ selezionata; preview informativa; Open analysis panel disabilitato.
- **Selezionato**: CQ evidenziata; preview aggiornata; pulsante attivo.
- **Loading/error**: usare i pattern standard della piattaforma.

## Nota UI
Il mockup è illustrativo, non prescrittivo su stile visivo/spaziatura: questi seguono il design system della piattaforma esistente.
