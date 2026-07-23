"use client";

import { ChangeEvent, MouseEvent, useRef, useState } from "react";

type SelectionInfo = {
  start: number;
  end: number;
  text: string;
  x: number;
  y: number;
};

type Annotation = {
  start: number;
  end: number;
  label: string;
};

const menuItems = ["Voce 1", "Voce 2", "Voce 3", "Voce 4", "Voce 5", "Voce 6"];

const demoText = `Intervistatrice: Mi racconti com’è cambiato il suo modo di lavorare negli ultimi anni?

Partecipante: La trasformazione più importante è stata imparare a collaborare a distanza. All’inizio sembrava che mancasse qualcosa, soprattutto nelle conversazioni informali, ma con il tempo abbiamo trovato nuovi rituali e strumenti condivisi.

Intervistatrice: C’è un momento che ricorda in modo particolare?

Partecipante: Sì, ricordo il primo progetto gestito interamente da remoto. Avevamo esperienze e punti di vista molto diversi, eppure siamo riusciti a costruire una forma di fiducia. È stato allora che ho capito quanto contino l’ascolto e la chiarezza.`;

const mockLexoItems = [
  { name: "Persona", detail: "Attori e soggetti citati" },
  { name: "Organizzazione", detail: "Gruppi, enti e strutture" },
  { name: "Luogo", detail: "Spazi fisici o geografici" },
  { name: "Tema emergente", detail: "Concetti rilevanti per l’analisi" },
];

export default function Home() {
  const [activePage, setActivePage] = useState(0);
  const [text, setText] = useState(demoText);
  const [fileName, setFileName] = useState("intervista-demo.txt");
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [dragging, setDragging] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      setFileName(file.name);
      setAnnotations([]);
      setSelection(null);
      setPickerOpen(false);
    };
    reader.readAsText(file);
  }

  function captureSelection(event: MouseEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    const root = textRef.current;
    const browserSelection = window.getSelection();
    if (!root || !browserSelection || browserSelection.isCollapsed || browserSelection.rangeCount === 0) {
      setSelection(null);
      return;
    }

    const selectedRange = browserSelection.getRangeAt(0);
    if (!root.contains(selectedRange.commonAncestorContainer)) return;

    const before = document.createRange();
    before.selectNodeContents(root);
    before.setEnd(selectedRange.startContainer, selectedRange.startOffset);
    const start = before.toString().length;
    const selectedText = selectedRange.toString();
    const rect = selectedRange.getBoundingClientRect();

    if (!selectedText.trim()) return;
    setPickerOpen(false);
    setSelection({
      start,
      end: start + selectedText.length,
      text: selectedText,
      x: Math.min(window.innerWidth - 54, Math.max(12, rect.left + rect.width / 2 - 21)),
      y: Math.max(12, rect.top - 52),
    });
  }

  function addAnnotation(label: string) {
    if (!selection) return;
    setAnnotations((current) => [
      ...current.filter((item) => item.end <= selection.start || item.start >= selection.end),
      { start: selection.start, end: selection.end, label },
    ].sort((a, b) => a.start - b.start));
    window.getSelection()?.removeAllRanges();
    setPickerOpen(false);
    setSelection(null);
  }

  function renderAnnotatedText() {
    if (!annotations.length) return text;
    const chunks: React.ReactNode[] = [];
    let cursor = 0;
    annotations.forEach((annotation, index) => {
      if (annotation.start > cursor) chunks.push(text.slice(cursor, annotation.start));
      chunks.push(
        <mark key={`${annotation.start}-${index}`} title={annotation.label}>
          {text.slice(annotation.start, annotation.end)}
        </mark>,
      );
      cursor = annotation.end;
    });
    if (cursor < text.length) chunks.push(text.slice(cursor));
    return chunks;
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand">
          <div className="brand-image" aria-hidden="true">
            <img src="/globe.svg" alt="" />
          </div>
          <div>
            <p className="eyebrow">LEXO · RESEARCH WORKSPACE</p>
            <h1>Textual Insights</h1>
          </div>
        </div>
        <div className="server-state"><span /> LexO-server pronto</div>
      </header>

      <nav className="main-nav" aria-label="Navigazione principale">
        {menuItems.map((item, index) => (
          <button
            key={item}
            className={activePage === index ? "active" : ""}
            onClick={() => setActivePage(index)}
          >
            <span className="nav-index">0{index + 1}</span>{item}
          </button>
        ))}
      </nav>

      <main>
        {activePage === 0 ? (
          <section className="workspace" aria-labelledby="workspace-title">
            <div className="page-intro">
              <div>
                <p className="section-kicker">ANNOTAZIONE INTERVISTE</p>
                <h2 id="workspace-title">Esplora il testo, trova significati.</h2>
                <p>Carica una trascrizione e seleziona parole o frasi per iniziare l’annotazione.</p>
              </div>
              <label className="upload-button">
                <span className="upload-icon">↑</span>
                <span><strong>Carica intervista</strong><small>File di testo · .txt</small></span>
                <input type="file" accept=".txt,text/plain" onChange={handleFile} />
              </label>
            </div>

            <div className="document-card">
              <div className="document-toolbar">
                <div className="file-info">
                  <span className="file-icon">TXT</span>
                  <div><strong>{fileName}</strong><small>{text.length.toLocaleString("it-IT")} caratteri</small></div>
                </div>
                <div className="legend"><span /> {annotations.length} annotazioni</div>
              </div>
              <div
                ref={textRef}
                className="text-area"
                onMouseDown={() => setDragging(true)}
                onMouseUp={captureSelection}
              >
                {renderAnnotatedText()}
              </div>
              <div className="document-foot">
                <span>Seleziona una porzione di testo con il mouse</span>
                <span className="shortcut"><kbd>↖</kbd> trascina per selezionare</span>
              </div>
            </div>
          </section>
        ) : (
          <section className="placeholder-page">
            <p className="section-kicker">SEZIONE 0{activePage + 1}</p>
            <h2>{menuItems[activePage]}</h2>
            <p>Questa sezione è pronta per ospitare il prossimo servizio di LexO-server.</p>
            <div className="placeholder-grid">
              <div /><div /><div />
            </div>
          </section>
        )}
      </main>

      {selection && (
        <button
          className="annotation-trigger"
          style={{ left: selection.x, top: selection.y }}
          onClick={() => setPickerOpen(true)}
          aria-label="Annota la selezione"
          title="Annota la selezione"
        >
          ✎
        </button>
      )}

      {selection && pickerOpen && (
        <div
          className="annotation-popover"
          style={{ left: Math.max(12, Math.min(selection.x, window.innerWidth - 382)), top: selection.y + 50 }}
        >
          <div className="popover-heading">
            <div><span>LEXO-SERVER</span><strong>Scegli un’annotazione</strong></div>
            <button onClick={() => setPickerOpen(false)} aria-label="Chiudi">×</button>
          </div>
          <p className="selection-preview">“{selection.text.trim()}”</p>
          <div className="annotation-options">
            {mockLexoItems.map((item) => (
              <button key={item.name} onClick={() => addAnnotation(item.name)}>
                <span className="option-dot" />
                <span><strong>{item.name}</strong><small>{item.detail}</small></span>
                <span className="arrow">→</span>
              </button>
            ))}
          </div>
          <p className="mock-note">Dati dimostrativi · la chiamata al servizio sarà collegata in seguito</p>
        </div>
      )}
    </div>
  );
}
