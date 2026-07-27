"use client";

import { ChangeEvent, MouseEvent, useCallback, useEffect, useRef, useState } from "react";

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

type Interview = {
  id: string;
  name: string;
  text: string;
  description?: string;
  annotations: Annotation[];
  source?: "server" | "local";
  sizeBytes?: number;
  sentenceCount?: number;
  tokenCount?: number;
  annotationCount?: number;
};

const menuItems = [
  "Il Progetto",
  "Esplora Dizionario",
  "Interrogazioni",
  "Costruisci Dizionario",
  "Risultati Scientifici",
  "Contatti",
];

const textsEndpoint = "/api/lexo/texts";

const mockLexoItems = [
  { name: "Collaborazione", detail: "Pratiche di lavoro condiviso" },
  { name: "Fiducia", detail: "Relazioni e affidamento reciproco" },
  { name: "Ascolto", detail: "Attenzione e comprensione" },
  { name: "Cambiamento", detail: "Trasformazioni ed evoluzioni" },
  { name: "Lavoro a distanza", detail: "Esperienze da remoto" },
  { name: "Comunicazione", detail: "Scambio e chiarezza" },
  { name: "Organizzazione", detail: "Processi e strutture" },
  { name: "Esperienza", detail: "Vissuti e conoscenze" },
];

export default function Home() {
  const [activePage, setActivePage] = useState(0);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [activeInterviewId, setActiveInterviewId] = useState("");
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [selectedConcepts, setSelectedConcepts] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [archiveError, setArchiveError] = useState("");
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState("");
  const textRef = useRef<HTMLDivElement>(null);
  const textRequestId = useRef(0);
  const activeInterviewIdRef = useRef("");

  const activeInterview = interviews.find((item) => item.id === activeInterviewId) ?? interviews[0];
  const text = activeInterview?.text ?? "";
  const fileName = activeInterview?.name ?? "Nessuna intervista";
  const annotations = activeInterview?.annotations ?? [];
  const description = activeInterview?.description?.trim() ?? "";
  const filteredInterviews = interviews.filter((interview) =>
    interview.name.toLocaleLowerCase("it").includes(searchQuery.trim().toLocaleLowerCase("it")),
  );

  const loadCanonicalText = useCallback(async (interviewId: string) => {
    const requestId = ++textRequestId.current;
    setTextError("");
    setTextLoading(true);
    try {
      const response = await fetch(
        `/api/lexo/texts/${encodeURIComponent(interviewId)}/canonical`,
        { headers: { Accept: "text/plain" }, cache: "no-store" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const canonicalText = await response.text();
      if (requestId !== textRequestId.current) return;
      setInterviews((current) => current.map((item) => item.id === interviewId
        ? { ...item, text: canonicalText }
        : item));
    } catch (error) {
      if (requestId !== textRequestId.current) return;
      setTextError(`Impossibile caricare il testo (${error instanceof Error ? error.message : "errore sconosciuto"}).`);
    } finally {
      if (requestId === textRequestId.current) setTextLoading(false);
    }
  }, []);

  const loadArchive = useCallback(async () => {
    setArchiveLoading(true);
    setArchiveError("");
    try {
      const response = await fetch(textsEndpoint, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as unknown;
      const container = payload as Record<string, unknown>;
      const rawItems = Array.isArray(payload)
        ? payload
        : [container.texts, container.items, container.data, container.results].find(Array.isArray) ?? [];

      const serverInterviews = (rawItems as Array<Record<string, unknown>>).map((item, index) => {
        const metadata = item.metadata && typeof item.metadata === "object"
          ? item.metadata as Record<string, unknown>
          : {};
        const metadataValues = item.metadataValues && typeof item.metadataValues === "object"
          ? item.metadataValues as Record<string, unknown>
          : {};
        const descriptionValues = metadataValues.description;
        const rawDescription = metadata.description
          ?? (Array.isArray(descriptionValues) ? descriptionValues[0] : descriptionValues)
          ?? item.description
          ?? "";

        return {
          id: String(item.fileId ?? item.id ?? item.textId ?? item.iri ?? item["@id"] ?? `server-${index}`),
          name: String(item.fileName ?? item.filename ?? item.name ?? item.title ?? item.label ?? `Intervista ${index + 1}`),
          text: String(item.text ?? item.content ?? item.body ?? item.value ?? ""),
          description: String(rawDescription),
          annotations: [],
          source: "server" as const,
          sizeBytes: Number(item.sizeBytes ?? 0),
          sentenceCount: Number(item.sentenceCount ?? 0),
          tokenCount: Number(item.tokenCount ?? 0),
          annotationCount: Number(item.annotationCount ?? 0),
        };
      });

      setInterviews((current) => [
        ...serverInterviews,
        ...current.filter((item) => item.source === "local"),
      ]);
      const interviewToLoad = serverInterviews.find((item) => item.id === activeInterviewIdRef.current)
        ?? serverInterviews[0];
      if (interviewToLoad) {
        activeInterviewIdRef.current = interviewToLoad.id;
        setActiveInterviewId(interviewToLoad.id);
        void loadCanonicalText(interviewToLoad.id);
      }
    } catch (error) {
      setArchiveError(`Impossibile caricare l’archivio (${error instanceof Error ? error.message : "errore sconosciuto"}).`);
    } finally {
      setArchiveLoading(false);
    }
  }, [loadCanonicalText]);

  useEffect(() => {
    void loadArchive();
  }, [loadArchive]);

  async function selectInterview(interview: Interview) {
    activeInterviewIdRef.current = interview.id;
    setActiveInterviewId(interview.id);
    setSelection(null);
    setSelectedConcepts([]);
    setTextError("");

    if (interview.source !== "server") {
      textRequestId.current += 1;
      setTextLoading(false);
      return;
    }

    await loadCanonicalText(interview.id);
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const newInterview: Interview = {
        id: `${Date.now()}-${file.name}`,
        name: file.name,
        text: String(reader.result ?? ""),
        annotations: [],
        source: "local",
      };
      setInterviews((current) => [...current, newInterview]);
      activeInterviewIdRef.current = newInterview.id;
      setActiveInterviewId(newInterview.id);
      textRequestId.current += 1;
      setTextLoading(false);
      setTextError("");
      setSelection(null);
      setSelectedConcepts([]);
      event.target.value = "";
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
    setSelectedConcepts([]);
    setSelection({
      start,
      end: start + selectedText.length,
      text: selectedText,
      x: Math.min(window.innerWidth - 54, Math.max(12, rect.left + rect.width / 2 - 21)),
      y: Math.max(12, rect.top - 52),
    });
  }

  function addAnnotation() {
    if (!selection || selectedConcepts.length === 0) return;
    setInterviews((current) => current.map((interview) => interview.id === activeInterviewId
      ? {
          ...interview,
          annotations: [
            ...interview.annotations.filter((item) => item.end <= selection.start || item.start >= selection.end),
            { start: selection.start, end: selection.end, label: selectedConcepts.join(", ") },
          ].sort((a, b) => a.start - b.start),
        }
      : interview));
    window.getSelection()?.removeAllRanges();
    setSelectedConcepts([]);
    setSelection(null);
  }

  function toggleConcept(concept: string) {
    if (!selection) return;
    setSelectedConcepts((current) => current.includes(concept)
      ? current.filter((item) => item !== concept)
      : [...current, concept]);
  }

  function renderAnnotatedRange(rangeStart: number, rangeEnd: number, keyPrefix: string) {
    const chunks: React.ReactNode[] = [];
    let cursor = rangeStart;
    annotations.forEach((annotation, index) => {
      const annotationStart = Math.max(rangeStart, annotation.start);
      const annotationEnd = Math.min(rangeEnd, annotation.end);
      if (annotationStart >= annotationEnd) return;
      if (annotationStart > cursor) {
        chunks.push(
          <span key={`${keyPrefix}-text-${cursor}`}>{text.slice(cursor, annotationStart)}</span>,
        );
      }
      chunks.push(
        <mark key={`${keyPrefix}-annotation-${annotationStart}-${index}`} title={annotation.label}>
          {text.slice(annotationStart, annotationEnd)}
        </mark>,
      );
      cursor = annotationEnd;
    });
    if (cursor < rangeEnd) {
      chunks.push(<span key={`${keyPrefix}-text-${cursor}`}>{text.slice(cursor, rangeEnd)}</span>);
    }
    return chunks;
  }

  function renderAnnotatedText() {
    const headingMatch = /Trascrizione Intervista/i.exec(text);
    if (!headingMatch) return renderAnnotatedRange(0, text.length, "full");

    const headingStart = headingMatch.index;
    const headingEnd = headingStart + headingMatch[0].length;

    // Il prefisso con id e metadati non è visibile, ma resta nel DOM: in questo modo
    // gli indici calcolati dalla selezione continuano a coincidere con gli offset NIF.
    return (
      <>
        {headingStart > 0 && (
          <span className="interview-offset-prefix" aria-hidden="true">
            {renderAnnotatedRange(0, headingStart, "metadata")}
          </span>
        )}
        <span className="transcript-heading">
          {renderAnnotatedRange(headingStart, headingEnd, "heading")}
        </span>
        {renderAnnotatedRange(headingEnd, text.length, "transcript")}
      </>
    );
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand">
          <div className="brand-image" aria-hidden="true">
            <img src="/donCalabria-logo.png" alt="" />
          </div>
          <div>
            <p className="eyebrow">Ricerca Linguistica e Innovazione Sociale</p>
            <h1>Futuri (im)Possibili</h1>
          </div>
        </div>
        <div className="partner-logos" aria-label="Partner del progetto">
          <img
            className="partner-logo foundation-logo"
            src="/logo-fondazione-rut.png"
            alt="Fondazione RUT"
          />
          <span className="partner-divider" aria-hidden="true" />
          <img
            className="partner-logo ilc-logo"
            src="/logo-ilc.png"
            alt="Istituto di Linguistica Computazionale Antonio Zampolli"
          />
        </div>
      </header>

      <nav className="main-nav" aria-label="Navigazione principale">
        {menuItems.map((item, index) => (
          <button
            key={item}
            className={activePage === index ? "active" : ""}
            onClick={() => setActivePage(index)}
            aria-label={index === 3 ? `${item}, area riservata con autenticazione` : item}
            title={index === 3 ? "Area riservata: sarà richiesta l’autenticazione" : undefined}
          >
            {item}
            {index === 3 && <span className="nav-lock" aria-hidden="true">🔒</span>}
          </button>
        ))}
      </nav>

      <main>
        {activePage === 3 ? (
          <section className="workspace" aria-label="Annotazione interviste">
            <div className="workspace-bar">
              <div>
                <p className="section-kicker">INSERISCI E ANNOTA</p>
                <p>Carica un’intervista e seleziona parole o frasi per annotarla.</p>
              </div>
            </div>

            <div className="interview-layout">
              <aside className="interview-sidebar" aria-label="Interviste caricate">
                <div className="sidebar-heading">
                  <span>ARCHIVIO</span>
                  <div className="sidebar-heading-row">
                    <strong>Interviste</strong>
                    <label className="archive-upload" aria-label="Carica intervista">
                      <span aria-hidden="true">↑</span>
                      <input type="file" accept=".txt,text/plain" onChange={handleFile} />
                    </label>
                    <button
                      className="archive-reload"
                      onClick={() => void loadArchive()}
                      disabled={archiveLoading}
                      aria-label="Ricarica archivio da LexO-server"
                      title="Ricarica archivio"
                    >
                      ↻
                    </button>
                    <small>{interviews.length} {interviews.length === 1 ? "file" : "file"}</small>
                  </div>
                </div>
                <div className="interview-search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Cerca intervista…"
                    aria-label="Cerca intervista per nome del file"
                  />
                </div>
                <div className="interview-list">
                  {archiveLoading && (
                    <div className="archive-loading" role="status">
                      <span className="loading-spinner" aria-hidden="true" />
                      <small>Caricamento da LexO-server…</small>
                    </div>
                  )}
                  {!archiveLoading && archiveError && (
                    <div className="archive-error">
                      <strong>Archivio non disponibile</strong>
                      <small>{archiveError}</small>
                      <code>LexO-server /service/texts</code>
                    </div>
                  )}
                  {filteredInterviews.map((interview) => (
                    <button
                      key={interview.id}
                      className={interview.id === activeInterviewId ? "active" : ""}
                      onClick={() => void selectInterview(interview)}
                    >
                      <span className="list-copy">
                        <strong>{interview.name}</strong>
                        <small>
                          {interview.source === "server"
                            ? `${interview.tokenCount?.toLocaleString("it-IT")} token · ${interview.sentenceCount} frasi · ${interview.annotationCount} annotazioni`
                            : `${interview.text.length.toLocaleString("it-IT")} caratteri · ${interview.annotations.length} annotazioni`}
                        </small>
                      </span>
                    </button>
                  ))}
                  {!archiveLoading && !archiveError && filteredInterviews.length === 0 && (
                    <p className="empty-search">Nessuna intervista trovata.</p>
                  )}
                </div>
              </aside>

              <div className="document-card">
                <div className="document-toolbar">
                  <div className="file-info">
                    <span className="file-icon">TXT</span>
                    <div>
                      <strong>{fileName}</strong>
                      <small>{textLoading ? "Caricamento testo…" : `${text.length.toLocaleString("it-IT")} caratteri`}</small>
                    </div>
                  </div>
                  {description && !textLoading && !textError && (
                    <div className="description-tab" title={description} aria-label={`Descrizione: ${description}`}>
                      <strong>{description}</strong>
                    </div>
                  )}
                </div>
                <div className="document-body">
                  <div
                    ref={textRef}
                    className="text-area"
                    onMouseDown={() => setDragging(true)}
                    onMouseUp={captureSelection}
                  >
                    {textLoading ? (
                      <div className="text-loading" role="status" aria-live="polite">
                        <span className="text-loading-spinner" aria-hidden="true" />
                        <small>Caricamento intervista…</small>
                      </div>
                    ) : textError ? (
                      <div className="text-error" role="alert">
                        <strong>Testo non disponibile</strong>
                        <span>{textError}</span>
                        {activeInterview && (
                          <button onClick={() => void selectInterview(activeInterview)}>Riprova</button>
                        )}
                      </div>
                    ) : (
                      renderAnnotatedText()
                    )}
                  </div>
                </div>
                <div className="document-foot">
                  <span>Seleziona una porzione di testo con il mouse</span>
                  <div className="legend"><span /> {annotations.length} annotazioni</div>
                </div>
              </div>

              <aside className={`concept-sidebar ${selection ? "selection-active" : ""}`} aria-label="Repertorio dei concetti">
                <div className="sidebar-heading concept-heading">
                  <span>REPERTORIO</span>
                  <div className="concept-heading-row">
                    <strong>Concetti</strong>
                    <small>{mockLexoItems.length} voci</small>
                  </div>
                </div>
                <div className="concept-intro">
                  {selection
                    ? "Seleziona uno o più concetti, poi premi nuovamente la penna."
                    : "Seleziona una parte dell’intervista per associare i concetti."}
                </div>
                <div className="concept-list">
                  {mockLexoItems.map((concept) => {
                    const isSelected = selectedConcepts.includes(concept.name);
                    return (
                      <button
                        key={concept.name}
                        className={isSelected ? "selected" : ""}
                        disabled={!selection}
                        onClick={() => toggleConcept(concept.name)}
                        aria-pressed={isSelected}
                      >
                        <span className="concept-check">{isSelected ? "✓" : ""}</span>
                        <span><strong>{concept.name}</strong><small>{concept.detail}</small></span>
                      </button>
                    );
                  })}
                </div>
                {selection && (
                  <div className={`concept-status ${selectedConcepts.length ? "ready" : ""}`}>
                    <strong>{selectedConcepts.length}</strong>
                    <span>{selectedConcepts.length === 1 ? "concetto selezionato" : "concetti selezionati"}</span>
                    <small>{selectedConcepts.length ? "Premi la penna per confermare" : "Scegli almeno un concetto"}</small>
                  </div>
                )}
              </aside>
            </div>
          </section>
        ) : activePage === 4 ? (
          <section className="publications-page" aria-labelledby="publications-title">
            <div className="publications-hero">
              <div className="publications-heading">
                <p className="section-kicker">RISULTATI SCIENTIFICI</p>
                <h2 id="publications-title">Pubblicazioni</h2>
                <p>
                  Contributi, ricerche e prospettive nate dal progetto Futuri (im)Possibili.
                </p>
              </div>
              <div className="publications-counter" aria-label="2 pubblicazioni presenti">
                <strong>02</strong>
                <span>pubblicazioni</span>
              </div>
            </div>

            <div className="publications-list">
              <article className="publication-card">
                <div className="publication-accent" aria-hidden="true">
                  <span>2026</span>
                </div>
                <div className="publication-content">
                  <div className="publication-meta">
                    <span className="publication-type">Atti di convegno</span>
                    <span className="publication-pages">pp. 420–425</span>
                  </div>
                  <p className="publication-authors">
                    M. Bandini <span>·</span> S. Piccini <span>·</span> A. Bellandi <span>·</span> E. Giovannetti
                  </p>
                  <h3>
                    Verso un dizionario narrativo computazionale degli usi linguistici in aree ad alta
                    vulnerabilità sociale
                  </h3>
                  <div className="publication-venue">
                    <span className="publication-mark" aria-hidden="true">AIUCD</span>
                    <p>
                      Proceedings of the XV Convegno annuale dell’
                      <strong>Associazione per l’Informatica Umanistica e la Cultura Digitale</strong>
                    </p>
                  </div>
                </div>
              </article>

              <article className="publication-card">
                <div className="publication-accent" aria-hidden="true">
                  <span>2026</span>
                </div>
                <div className="publication-content">
                  <div className="publication-meta">
                    <span className="publication-type">Abstract di convegno</span>
                    <span className="publication-edition">XXII edizione</span>
                  </div>
                  <p className="publication-authors">
                    M. Bandini <span>·</span> S. Piccini <span>·</span> A. Bellandi <span>·</span> E. Giovannetti
                  </p>
                  <h3>
                    <strong className="publication-title-lead">Toward a Narrative-Oriented Dictionary</strong>{" "}
                    <strong className="publication-title-subtitle">
                      Computational Modelling of Youth Language in Socially Vulnerable Contexts
                    </strong>
                  </h3>
                  <div className="publication-venue">
                    <span className="publication-mark" aria-hidden="true">EURALEX</span>
                    <p>
                      Book of Abstract of the <strong>XXII EURALEX International Congress</strong> —
                      Lexicography in the Age of AI
                    </p>
                  </div>
                </div>
              </article>
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

      {selection && activePage === 3 && (
        <button
          className="annotation-trigger"
          data-ready={selectedConcepts.length > 0}
          style={{ left: selection.x, top: selection.y }}
          onClick={addAnnotation}
          aria-label={selectedConcepts.length ? "Conferma l’annotazione" : "Seleziona uno o più concetti"}
          title={selectedConcepts.length ? "Conferma l’annotazione" : "Seleziona uno o più concetti nel repertorio"}
        >
          ✎
        </button>
      )}
    </div>
  );
}
