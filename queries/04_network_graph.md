# NARRALEX — Specifiche del Network Graph

## 1. Scopo

Il Network Graph è una vista alternativa alla vista Lista della **CQ1 — Concepts by polarity**:

> **Which concepts are associated with the narrative senses of a given lexical entry, by polarity?**

Il grafo serve a esplorare visivamente le relazioni tra la lexical entry, i narrative concepts associati e le loro co-occorrenze. Riusa la stessa configurazione della CQ1 e non introduce un nuovo sistema di filtri o un nuovo routing.

## 2. Posizionamento

- Vive **all'interno della CQ1**.
- Lista e Grafo sono due viste della stessa area risultati: `List | Graph`.
- Condividono la configurazione superiore della CQ1: lexical entry e polarità selezionate.
- Il passaggio Lista ↔ Grafo non crea un nuovo route.
- **Back to list view** riporta alla lista mantenendo la configurazione.
- Non esiste un pannello separato **Filter network**.

## 3. Co-occorrenza

### Default: stessa frase/paragrafo (B)

Due concetti co-occorrono quando compaiono nella **stessa frase/paragrafo** di un passaggio.

Questa è la definizione predefinita perché rappresenta una relazione tematica più forte della semplice presenza nella stessa intervista e produce un grafo più leggibile.

### Fallback

Se il testo necessario per determinare frase/paragrafo non è disponibile:
- usare il **documento/intervista** come fallback;
- il fallback non va considerato semanticamente equivalente alla co-occorrenza nello stesso paragrafo.

### Alternative non adottate

- **Stessa intervista (A):** non default; rischia un grafo eccessivamente denso, in cui quasi tutto co-occorre con tutto.
- **Finestra di N caratteri dagli offset (C):** non default; potrà essere un'evoluzione futura.

## 4. Topologia

### Modello ibrido (C)

- La **lexical entry** è l'ancora centrale.
- I concept nodes sono organizzati in tre settori/cluster:
  - Positive;
  - Negative;
  - Neutral.
- Gli archi rappresentano **concept ↔ concept co-occurrence**.
- Possono esistere archi sia all'interno della stessa polarità sia tra polarità diverse.

La lexical entry è un'ancora visiva, non un normale nodo di co-occorrenza.

### Alternative non adottate

- **Ego/star:** entry al centro con archi entry ↔ concept; non rappresenta direttamente la co-occorrenza tra concetti.
- **Concept ↔ concept con entry solo in legenda:** più semplice, ma meno esplicito nel collegare il network alla lexical entry.

## 5. Nodi

### Lexical entry
Nodo centrale distinto dai concept nodes:
- label della lexical entry;
- dimensione visivamente distinta;
- non rappresenta una misura di co-occorrenza.

### Concept
Ogni nodo rappresenta un narrative concept associato alla lexical entry.

Dati:
- concept label;
- polarità;
- numero di occorrenze.

### Dimensione
La dimensione del nodo è proporzionale alle **occorrenze**, usando una scala non lineare √ oppure log per evitare che i concetti molto frequenti dominino il grafo.

## 6. Polarità

La polarità usa la **stessa palette della CQ1**:
- Positive;
- Negative;
- Neutral.

La selezione delle polarità nella CQ1 determina quali cluster sono visibili:
- una;
- due;
- tutte e tre.

Non aggiungere un ulteriore filtro specifico del grafo.

## 7. Archi

### Significato
Un arco tra due concept nodes indica una co-occorrenza secondo la definizione della sezione 3.

### Peso
La forza dell'arco è il **conteggio grezzo delle coppie di co-occorrenza**.

Il valore deve essere disponibile nel tooltip.

### Encoding
Lo **spessore dell'arco** è proporzionale alla forza.

Non usare in questa versione:
- Jaccard;
- PMI.

Sono possibili evoluzioni future.

## 8. Soglia e Top-K

Per evitare un grafo illeggibile:

- applicare una **soglia minima** alla forza degli archi;
- applicare un **Top-K dei co-occorrenti più forti per nodo**, se necessario.

I valori vanno tarati sui dati reali.

Soglia e Top-K sono meccanismi di leggibilità implementativi e **non devono diventare un pannello Filter network**.

## 9. Layout

### Tecnologia
**SVG hand-rolled, senza dipendenze grafiche aggiuntive.**

### Struttura
Layout radiale:
- lexical entry al centro;
- tre settori di polarità;
- concept nodes distribuiti nei rispettivi settori;
- archi concept ↔ concept.

### Determinismo
Il layout deve essere **deterministico**, senza force layout randomico.

A parità di dati/configurazione:
- le posizioni devono essere stabili;
- il grafo non deve saltare tra render;
- gli screenshot devono essere riproducibili.

L'algoritmo concreto di posizionamento è lasciato al coding agent purché sia deterministico.

## 10. Interazioni

### Hover su nodo
Tooltip con:
- concept label;
- polarità;
- occorrenze;
- top co-occurring concepts.

### Click su nodo
1. seleziona il concept;
2. aggiorna il **Concept details panel** della CQ1;
3. aggiorna la **tabella dei corpus passages** del concept.

Non creare una seconda implementazione indipendente del concept detail.

### Highlight co-occurring concepts
L'azione:
- mantiene evidenziato il concept selezionato;
- evidenzia i nodi vicini;
- evidenzia gli archi corrispondenti;
- attenua gli altri nodi/archi;
- non modifica permanentemente il result set.

Deve essere possibile tornare alla visualizzazione normale.

### Hover su arco
Tooltip con:
- concetti collegati;
- forza della co-occorrenza;
- unità usata per il calcolo (frase/paragrafo oppure fallback a documento).

### Zoom / pan
Supportare zoom e pan tramite `viewBox` SVG.

### Fit
Pulsante **Fit**:
- mostra nuovamente l'intero grafo;
- resetta zoom/pan.

### Back to list view
Torna alla lista CQ1 mantenendo lexical entry e polarità.

## 11. Controlli e filtri

### Ereditati dalla CQ1
- lexical entry;
- selezione delle polarità.

### Sort concepts by
In modalità grafo:
- nascondere oppure ignorare `Sort concepts by`.

Il sort della lista non deve diventare una dimensione del grafo.

### Filter network
**Non implementare.**

## 12. Concept details

Al click su un concept, riusare il pannello CQ1.

Mostrare:
- Concept name;
- Polarity;
- Interviewees;
- eventuale breakdown per genere;
- Occurrences;
- Most represented age group;
- Age breakdown;
- Gender breakdown;
- **View corpus passages**;
- **Highlight co-occurring concepts**.

Non mostrare:
- **Attestation status**;
- **Related realisations**.

## 13. Collegamento alla corpus evidence

**View corpus passages** deve riusare il modello di evidenza della CQ2.

Il contesto dovrebbe mantenere, quando possibile:
- lexical entry;
- concept;
- polarity.

La modalità concreta di apertura (stessa vista, drawer, nuova vista interna, ecc.) non è stata fissata nella conversazione e va allineata ai pattern già presenti nella piattaforma.

## 14. Dati necessari

Il coding agent deve recuperare dai servizi backend esistenti:

### Concept nodes
- lexical entry;
- narrative senses;
- concept;
- polarità;
- occorrenze.

### Co-occorrenze
- passaggi in cui i concetti sono attestati;
- testo e/o offset necessari a determinare frase/paragrafo;
- identificativo del documento/intervista per il fallback;
- associazione concept ↔ passaggio.

### Dettaglio
- intervistati associati;
- età;
- genere;
- occorrenze;
- passaggi del corpus.

Non sono richiesti nuovi endpoint: il mapping preciso sui servizi esistenti è responsabilità del coding agent.

## 15. Stati

### Loading
Usare il pattern standard della piattaforma.

### Empty
Se non ci sono concetti:
- mostrare uno stato vuoto informativo;
- mantenere i controlli CQ1.

Se ci sono concetti ma nessun arco supera la soglia:
- mostrare i nodi;
- indicare che non sono disponibili relazioni visualizzabili.

### Error
Usare il pattern standard della piattaforma.

## 16. Accessibilità

Il grafo è una vista complementare: la **List view** deve restare disponibile.

Le informazioni fondamentali non devono dipendere solo dal colore:
- la polarità deve essere identificabile anche tramite testo/label;
- tooltip e Concept details devono fornire i valori numerici.

## 17. Regole implementative

1. Network Graph = vista dentro CQ1.
2. Lexical entry al centro come ancora.
3. Concept nodes organizzati per polarità.
4. Archi concept ↔ concept = co-occorrenza.
5. Default = stessa frase/paragrafo.
6. Fallback = stesso documento/intervista.
7. Peso = conteggio grezzo.
8. Spessore arco = peso.
9. Dimensione nodo = occorrenze con scala √/log.
10. Colore = polarità, palette CQ1.
11. Soglia minima + Top-K per controllare la densità.
12. Layout radiale deterministico.
13. SVG hand-rolled, zero dipendenze.
14. Hover = tooltip.
15. Click nodo = Concept details + corpus passages.
16. Highlight = vicini evidenziati, resto attenuato.
17. Zoom/pan + Fit.
18. Back to list view.
19. Nessun Filter network.
20. Sort concepts by nascosto/ignorato nel grafo.
21. Concept details senza Attestation status e Related realisations.
22. Nessun nuovo routing o servizio backend.

## 18. Parametri da tarare

- soglia minima;
- Top-K;
- algoritmo deterministico di disposizione;
- √ vs log per la dimensione;
- comportamento del fallback a documento;
- comportamento con una/due polarità;
- modalità di passaggio a corpus evidence.

Questi parametri non devono diventare automaticamente nuovi controlli UI.
