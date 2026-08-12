# Web App per il progetto Futuri (im)possibili

Interfaccia React per caricare, leggere, annotare, consultare e interrogare le trascrizioni testuali delle intervite ai ragazzi di Caivano.
L'accesso alle interviste è basato su un dizionario narrativo creato sulla base delle stesse, in cui sono rappresentati i concetti associati dai ragazzi alle parole di indagine.

## Avvio rapido su macOS

1. Fai doppio clic su `Avvia-LexO.command`.
2. Attendi l’apertura automatica del browser su <http://localhost:3000/futuri-impossibili>.
3. Per arrestare l’applicazione, torna alla finestra Terminale e premi `Ctrl+C`.


## Avvio dal Terminale

Apri il Terminale in questa cartella ed esegui:

```bash
npm install
npm run dev
```

Poi visita <http://localhost:3000/futuri-impossibili> nel browser.

L'app è servita sotto il base path `/futuri-impossibili` (configurabile override con `NEXT_PUBLIC_BASE_PATH` in `.env.local`).

## Requisiti

- [LexO-server](hhttps://github.com/andreabellandi/LexO-server) installato
- Node.js 22 o successivo; lo script utilizza automaticamente il runtime già incluso in Codex quando disponibile.

## Collegamento a LexO-server

Crea un file `.env.local` nella cartella del progetto e inserisci l’indirizzo completo del servizio:

```env
LEXO_SERVER_URL=http://localhost:8080/LexO-server
```

Riavvia poi l’applicazione. L’archivio viene caricato automaticamente all’apertura e può essere aggiornato con il pulsante di ricarica nel box.

## Struttura principale

- `app/page.tsx`: interfaccia e comportamento React
- `app/globals.css`: stile e layout responsive
- `public/`: immagini e risorse statiche
