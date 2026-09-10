# CQ1 – Concepts by polarity

## Competency question
**Which concepts are associated with the narrative senses of a given lexical entry, by polarity?**

Questa CQ accorpa due casi precedentemente separati:
- overview con tutte le polarità;
- retrieval focalizzato su una o più polarità.

## Scopo
Mostrare i concetti associati ai narrative senses di una lexical entry e permettere all'utente di vedere una, due o tutte e tre le polarità.

## Dati necessari
Per la lexical entry selezionata:
- narrative senses;
- concetti associati;
- polarità dell'associazione/senso: positive, negative, neutral;
- numero di **intervistati distinti** associati a ciascun concetto;
- numero di occorrenze;
- distribuzione per età e genere per il concetto selezionato;
- passaggi del corpus che supportano il concetto;
- ID intervistato, età, genere e tipo di realizzazione del passaggio dove disponibile;
- dati di co-occorrenza tra concetti per la vista network graph.

## Componenti

### 1. Selettore Lexical entry
- Un solo controllo.
- Dropdown con le lexical entries disponibili (es. `femmina`, `criminale`, `infame`).
- Il testo della pagina deve aggiornarsi alla lexical entry selezionata.
- Evitare di ripetere lo stesso selettore in più punti.

### 2. Polarity view
Controllo che determina quali cluster mostrare.
- Deve permettere:
  - tutte e tre le polarità;
  - una sola polarità;
  - due polarità.
- Stati/naming discussi:
  - `Grouped (all polarities)`;
  - `Positive only`;
  - `Negative only`;
  - `Neutral only`;
  - eventuale selezione custom per 2 polarità.
- Il cambio di selezione aggiorna senza cambiare pagina il contenuto principale.

### 3. Sort concepts by
Dropdown di ordinamento.
Opzioni discusse:
- Frequency;
- Alphabetical A–Z;
- Alphabetical Z–A;
- Number of interviewees;
- Number of occurrences.
L'ordinamento si applica ai concetti visibili.

### 4. Pannelli per polarità
Quando sono selezionate tutte le polarità:
- un pannello **Positive concepts**;
- un pannello **Negative concepts**;
- un pannello **Neutral concepts**.

Ogni pannello mostra:
- nome del concetto;
- numero di intervistati distinti;
- numero di occorrenze;
- barra orizzontale come supporto visivo alla frequenza;
- numero totale di concetti nella polarità;
- controllo per mostrare tutti i concetti se la lista è troncata.

Con una sola polarità:
- mostrare solo il pannello corrispondente.
Con due polarità:
- mostrare solo i due pannelli selezionati.

### 5. Overall distribution
Vista sintetica della distribuzione dei concetti tra positive / negative / neutral.
- Pensata come donut chart.
- Mostra conteggio e percentuale dei concetti per polarità.
- È soprattutto utile nella vista `Grouped (all polarities)`.
- Comportamento con 1 o 2 polarità non definito esplicitamente: vedi “Punti aperti”.

### 6. Concept details
Si apre/se aggiorna quando l'utente seleziona un concetto.
Campi concordati:
- Concept name;
- Polarity;
- Interviewees, con eventuale breakdown F/M;
- Occurrences;
- Most represented age group.

Elementi esplicitamente rimossi:
- Attestation status;
- Related realisations / realisation types nel box di dettaglio.

### 7. Corpus passages del concetto selezionato
Tabella collegata al concetto attivo.
Mostra:
- ID;
- Age;
- Gender;
- Passage;
- Realisation type.

Interazioni:
- selezionare un concetto aggiorna la tabella;
- controllo per visualizzare tutti i passaggi;
- export dei risultati, se supportato dai pattern esistenti.

### 8. Explore as network graph
Azione dalla CQ1 che apre la vista network graph della stessa lexical entry e della configurazione corrente, quando applicabile.

## Vista Network graph

### Struttura
- Nodo centrale: lexical entry.
- Cluster separati per:
  - Positive concepts;
  - Negative concepts;
  - Neutral concepts.
- La distinzione visiva tra polarità segue il design system esistente.
- Dimensione del nodo: numero di occorrenze.
- Spessore della linea: forza di co-occorrenza.
- Legenda che spiega polarità, node size/co-occurrence e cluster.
- Controlli base di zoom / fit se previsti dalla libreria grafica esistente.
- Azione **Back to list view**.

### Interazione sui nodi
Click su un concetto:
- seleziona/evidenzia il nodo;
- apre/aggiorna il pannello dettagli.

Il pannello dettagli mostra:
- polarity;
- interviewees;
- occurrences;
- most represented age group;
- age breakdown;
- gender breakdown;
- azione **View corpus passages**;
- azione **Highlight co-occurring concepts**.

Elementi da NON mostrare nel concept detail:
- Attestation status;
- Related realisations.

### Filter network
È stata richiesta la rimozione del box dedicato **Filter network**. La vista graph non deve introdurre un pannello filtri separato rispetto alla configurazione della CQ1, salvo futura decisione.

## Interazioni principali
1. Seleziona lexical entry → ricalcola tutti i concetti.
2. Cambia Polarity view → mostra 1, 2 o 3 gruppi.
3. Cambia Sort concepts by → riordina le liste.
4. Click su concetto → dettagli + passaggi.
5. Explore as network graph → vista grafo.
6. Back to list view → ritorno alla vista CQ1 precedente.

## Stati
- **Nessun concetto per la polarità selezionata**: mostra stato vuoto nel pannello della polarità.
- **Loading/error**: usare i pattern standard della piattaforma.

## Punti aperti
- Comportamento preciso dell'Overall distribution quando l'utente seleziona solo 1 o 2 polarità.
- Modalità UX esatta per selezionare due polarità (multi-select vs opzione custom).
- Click sulle barre/frequenze non definito separatamente dal click sul concetto.
- Ordinamento “Frequency”: chiarire se usa di default intervistati distinti o occorrenze; nella conversazione si è preferito usare gli intervistati distinti come misura primaria.

## Nota UI
Il mockup è illustrativo, non prescrittivo su stile visivo/spaziatura: questi seguono il design system della piattaforma esistente.
