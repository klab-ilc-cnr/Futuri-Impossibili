# CQ2 – Corpus evidence

## Competency question
**Retrieve all corpus passages in which a narrative sense of a given lexical entry is associated with a concept of a specified polarity.**

## Scopo
Recuperare l'evidenza testuale del corpus relativa a una lexical entry e a una polarità, con possibilità di restringere successivamente il risultato per caratteristiche dei parlanti.

## Dati necessari
- lexical entries;
- narrative senses;
- concetti associati;
- polarità;
- passaggi del corpus;
- ID dell'intervistato/passaggio;
- età;
- genere;
- conteggio dei passaggi restituiti;
- frequenza dei concetti presenti nel result set.

`Realisation type` è stato rimosso dalla tabella finale di questa CQ.

## Componenti

### 1. Selettori principali: Lexical entry + Polarity
Devono esistere **una sola volta** nella pagina, senza duplicazioni.

Nelle iterazioni sono stati pensati come parte della frase-query:
**All passages in which a narrative sense of [LEXICAL ENTRY] is associated with a concept of [POLARITY] polarity.**

- `[LEXICAL ENTRY]`: dropdown.
- `[POLARITY]`: dropdown con Positive / Negative / Neutral.
- Cambiare uno dei due valori aggiorna l'intero result set.

Nota: nella conversazione sono state provate anche varianti con i due controlli in una riga separata. La decisione stabile è evitare la duplicazione: usare una sola rappresentazione/editabilità dei due parametri.

### 2. Filtri secondari
Dopo la scelta dei due parametri principali:
- **Age groups**;
- **Gender**.

Sono restrizioni facoltative:
- default = tutti i gruppi / tutti i generi;
- aggiornano i risultati senza cambiare CQ.

Elementi rimossi dai filtri:
- Concepts;
- Realisation type.

### 3. Sort by
Dropdown per ordinare i passaggi.
- Nel mockup discusso compare `Age (ascending)` come esempio/default.
- Le altre opzioni non sono state definite: usare solo quelle già supportate dalla piattaforma o concordarle successivamente.

### 4. Search configuration
Box di riepilogo, non un secondo set di filtri.
Mostra:
- Lexical entry selezionata;
- Polarity selezionata;
- numero di risultati/passaggi;
- Age filter attivo;
- Gender filter attivo.

Non deve rendere nuovamente modificabili lexical entry e polarity.

### 5. Concepts in results
Riepilogo dei concetti presenti nei passaggi restituiti.
- Titolo dinamico coerente con la polarità, es. `Positive concepts in results`.
- Per ogni concetto:
  - nome;
  - frequenza/conteggio;
  - barra orizzontale comparativa.
- Serve come overview del result set.
- Click/interazione sui concetti non definita esplicitamente: vedi punti aperti.

### 6. Corpus passages table
Elemento principale.
Mostra:
- ID;
- Passage;
- Concept;
- Polarity;
- Age;
- Gender.

Elementi esplicitamente rimossi:
- Realisation type.

Altri elementi:
- numero totale di passaggi nel titolo, es. `Corpus passages (24)`;
- paginazione;
- indicazione del range corrente;
- **Export results**.

### 7. Click su un passaggio
Comportamento discusso:
- permette di vedere il contesto completo del passaggio;
- permette di accedere ai metadata del parlante.
La forma precisa (drawer, modal, nuova vista) non è stata definita.

### 8. Tip/help
Testo di aiuto coerente con i controlli effettivamente disponibili:
- restringere per age group e gender;
- usare l'ordinamento;
- cliccare un passaggio per contesto completo e speaker metadata.

Non citare filtri rimossi.

## Flusso
1. L'utente arriva da CQ2 nel pannello iniziale.
2. Seleziona lexical entry.
3. Seleziona polarity.
4. Il sistema restituisce i passaggi.
5. Facoltativamente restringe per age group e/o gender.
6. Ordina i risultati.
7. Esporta oppure apre un passaggio per il contesto completo.

## Stati
- **Zero risultati**: mostra stato vuoto con i parametri attivi; il box Search configuration resta visibile.
- **Loading/error**: usare pattern standard della piattaforma.

## Punti aperti
- Posizionamento finale dei selettori lexical entry/polarity: inline nella frase-query vs riga controlli. Vincolo certo: non duplicarli.
- Opzioni complete di `Sort by`.
- Interazione del box `Concepts in results`.
- Modalità esatta di apertura del full context / speaker metadata.
- In una fase della conversazione è stata proposta la rimozione della frase-query parametrica; successivamente la logica di selezione lexical entry/polarity è rimasta necessaria. Implementare un solo set di controlli, scegliendo il pattern più coerente con la piattaforma esistente.

## Nota UI
Il mockup è illustrativo, non prescrittivo su stile visivo/spaziatura: questi seguono il design system della piattaforma esistente.
