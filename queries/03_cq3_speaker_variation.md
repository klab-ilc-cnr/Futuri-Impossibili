# CQ3 – Speaker variation

## Competency question
**How does the distribution of one or more narrative concepts associated with a given lexical entry vary across speakers' age and gender?**

## Scopo
Confrontare la diffusione di uno o più narrative concepts tra gruppi di parlanti, mantenendo età e genere come dimensioni di confronto e permettendo restrizioni opzionali.

## Dati necessari
Per la lexical entry e i concetti selezionati:
- lexical entry;
- concetti associati ai narrative senses;
- intervistati distinti associati a ciascun concetto;
- età;
- genere;
- numero di intervistati per gruppo;
- percentuale di intervistati del gruppo che associa il concetto;
- eventuale numero di occorrenze come dato secondario;
- passaggi del corpus che supportano ogni combinazione concept × age × gender.

## Componenti

### 1. Lexical entry
- Dropdown singolo.
- Seleziona la voce da analizzare.

### 2. Concept(s)
- Multi-select.
- Deve permettere di scegliere uno o più concetti associati alla lexical entry.
- Con un solo concetto: confronto semplice.
- Con più concetti: confronto multi-serie / heatmap.

### 3. Age groups
- Filtro opzionale.
- Default: tutti i gruppi.
- Serve a restringere il confronto.
- Se viene selezionata una sola fascia e Gender resta `All`, il confronto resta tra generi nella fascia selezionata.

### 4. Gender
- Filtro opzionale.
- Default: tutti.
- Se viene selezionato un solo genere e Age groups resta `All`, il confronto resta tra fasce d'età per quel genere.

### 5. Compare by / logica di confronto
Nella conversazione è stata discussa la possibilità di confrontare:
- Age × Gender;
- Age;
- Gender.

La vista senza restrizioni deve permettere di vedere l'intera variazione, non obbligare l'utente a scegliere subito un singolo gruppo.

### 6. Results view
Viste discusse:
- **Bar chart** – vista primaria/default per un singolo concetto;
- **Heatmap** – particolarmente utile quando si confrontano più concetti;
- **Table** – dati esatti.

La selezione della vista non cambia i filtri, solo la rappresentazione.

### 7. Bar chart
Per un singolo concetto:
- categorie = age groups;
- serie = Female / Male;
- misura principale = **percentuale di intervistati nel gruppo**;
- etichette con percentuali;
- il numero assoluto N resta disponibile nella tabella.

Non usare pie chart per questa CQ: i gruppi confrontati non sono parti dello stesso totale.

### 8. Heatmap
Per overview di più concetti:
- righe = concepts;
- colonne = gruppi age × gender, oppure la dimensione scelta in Compare by;
- cella = percentuale di intervistati del gruppo;
- click su una cella → drill-down verso intervistati/passaggi di supporto.

### 9. Data table
Vista numerica complementare.
Per il confronto age × gender mostra almeno:
- age group;
- Female: N e %;
- Male: N e %;
- Total: N e %.

Con più concetti deve essere possibile distinguere chiaramente il concetto a cui ogni riga/blocco si riferisce.

### 10. Sort by
È stato proposto un ordinamento, es. frequency descending.
- Applicabile soprattutto alle viste con più concetti.
- Opzioni complete non definite.

### 11. Drill-down / corpus evidence
Click su barra, cella o riga:
- mostra gli intervistati corrispondenti;
- permette di aprire i passaggi del corpus che supportano quel dato.
Questo collegamento deve riusare il pattern di corpus evidence della CQ2, senza duplicare logica.

## Logica di utilizzo

### Overview
- Lexical entry selezionata;
- Age = All;
- Gender = All;
- mostra la variazione complessiva.

### Focus per età
- Age = una fascia;
- Gender = All;
- confronta Female vs Male nella fascia selezionata.

### Focus per genere
- Gender = Female o Male;
- Age = All;
- confronta le fasce d'età per quel genere.

### Multi-concept
- selezione di più concetti;
- heatmap consigliata per leggibilità;
- tabella disponibile per i valori esatti.

## Metriche
- Misura primaria: **distinct interviewees**, non numero di righe/passaggi.
- Percentuale: calcolata sul denominatore del gruppo pertinente.
- Occurrences: dato secondario, se mostrato.
- Il denominatore deve essere coerente e documentato nell'implementazione; nella conversazione è stata preferita la popolazione di intervistati pertinenti alla lexical entry/gruppo.

## Stati
- **Nessun concetto selezionato**: richiedere almeno un concetto prima di mostrare il confronto.
- **Zero dati per un gruppo**: mostrare 0 / 0% senza nascondere il gruppo se è parte del confronto selezionato.
- **Loading/error**: usare pattern standard della piattaforma.

## Punti aperti
- Se `Compare by` debba essere un controllo esplicito o derivato automaticamente da Age/Gender.
- Se con più concetti la UI debba passare automaticamente a Heatmap oppure limitarsi a suggerirla.
- Layout esatto della tabella in modalità multi-concept.
- Opzioni complete di `Sort by`.
- Forma esatta del pannello di drill-down verso corpus passages.

## Nota UI
Il mockup è illustrativo, non prescrittivo su stile visivo/spaziatura: questi seguono il design system della piattaforma esistente.
