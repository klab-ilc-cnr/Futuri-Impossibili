"use client";

import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

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
  contextIri?: string;
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

type LexicalConcept = {
  defaultLabel: string;
  lexicalConcept: string;
  attestation: number;
};

type TextConversionJob = {
  state: string;
  message?: string;
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
const textUploadEndpoint = "/api/lexo/texts/upload";
const conceptsEndpoint = "/api/lexo/lexical-concepts";
const updateLexicalLabelEndpoint = "/api/lexo/update-lexical-label";
const attestationsEndpoint = "/api/lexo/attestations";

function readResourceIdentifier(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";
  const resource = value as Record<string, unknown>;
  return readResourceIdentifier(resource.iri ?? resource["@id"] ?? resource.id ?? resource.value);
}

function parseAttestations(payload: unknown, lexicalConcepts: LexicalConcept[]): Annotation[] {
  function findItems(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") return [];
    const container = value as Record<string, unknown>;
    for (const key of ["attestations", "items", "results", "data", "list"]) {
      if (Array.isArray(container[key])) return container[key] as unknown[];
      if (container[key] && typeof container[key] === "object") {
        const nested = findItems(container[key]);
        if (nested.length) return nested;
      }
    }
    return [];
  }

  function collectLabels(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(collectLabels);
    if (typeof value !== "string") return [];
    const label = value.trim().replace(/^occurrence of\s+/i, "");
    return label ? [label] : [];
  }

  function collectObservableLabels(value: unknown): string[] {
    return collectLabels(value)
      .map((label) => label.replace(/@[a-z]{2,3}(?:-[a-z0-9]+)*$/i, "").trim())
      .filter(Boolean);
  }

  const grouped = new Map<string, { start: number; end: number; labels: Set<string> }>();
  for (const rawAttestation of findItems(payload)) {
    if (!rawAttestation || typeof rawAttestation !== "object") continue;
    const attestation = rawAttestation as Record<string, unknown>;
    const observable = readResourceIdentifier(
      attestation.observable ?? attestation.lexicalConcept ?? attestation.concept ?? attestation.uri,
    );
    const conceptLabel = lexicalConcepts.find((concept) => concept.lexicalConcept === observable)?.defaultLabel;
    const attestationObservableLabels = collectObservableLabels(attestation.observableLabel);
    const attestationFallbackLabels = [
      ...collectLabels(attestation.labels),
      ...collectLabels(attestation.label),
      ...collectLabels(attestation.defaultLabel),
      ...collectLabels(conceptLabel),
    ];
    const occurrences = Array.isArray(attestation.occurrences)
      ? attestation.occurrences
      : attestation.occurrence && typeof attestation.occurrence === "object"
        ? [attestation.occurrence]
        : [attestation];

    for (const rawOccurrence of occurrences) {
      if (!rawOccurrence || typeof rawOccurrence !== "object") continue;
      const occurrence = rawOccurrence as Record<string, unknown>;
      const start = Number(occurrence.start ?? occurrence._start ?? occurrence.begin ?? occurrence.startIndex);
      const end = Number(occurrence.end ?? occurrence._end ?? occurrence.stop ?? occurrence.endIndex);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) continue;

      const key = `${start}:${end}`;
      const current = grouped.get(key) ?? { start, end, labels: new Set<string>() };
      const occurrenceObservableLabels = collectObservableLabels(occurrence.observableLabel);
      const observableLabels = [...attestationObservableLabels, ...occurrenceObservableLabels];
      const labels = observableLabels.length
        ? observableLabels
        : [
            ...attestationFallbackLabels,
            ...collectLabels(occurrence.labels),
            ...collectLabels(occurrence.label),
            ...collectLabels(occurrence.defaultLabel),
          ];
      labels.forEach((label) => current.labels.add(label));
      grouped.set(key, current);
    }
  }

  return [...grouped.values()]
    .map((annotation) => ({
      start: annotation.start,
      end: annotation.end,
      label: [...annotation.labels].join("\n") || "Attestazione",
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

async function fetchAttestations(fileId: string, lexicalConcepts: LexicalConcept[] = []) {
  const response = await fetch(
    `${attestationsEndpoint}/${encodeURIComponent(fileId)}`,
    { headers: { Accept: "application/json" }, cache: "no-store" },
  );
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(detail || `HTTP ${response.status}`);
  }
  return parseAttestations(await response.json() as unknown, lexicalConcepts);
}

function parseLexicalConcepts(payload: unknown) {
  const container = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {};
  const nestedData = container.data && typeof container.data === "object" && !Array.isArray(container.data)
    ? container.data as Record<string, unknown>
    : {};
  const rawItems = Array.isArray(payload)
    ? payload
    : [
        container.lexicalConcepts,
        container.list,
        container.items,
        container.results,
        container.collection,
        container.data,
        nestedData.lexicalConcepts,
        nestedData.list,
        nestedData.items,
        nestedData.results,
      ].find(Array.isArray) ?? [];

  const concepts = (rawItems as Array<unknown>).flatMap((rawItem) => {
    if (!rawItem || typeof rawItem !== "object") return [];
    const item = rawItem as Record<string, unknown>;
    const defaultLabel = typeof item.defaultLabel === "string" ? item.defaultLabel : "";
    const lexicalConcept = typeof item.lexicalConcept === "string" ? item.lexicalConcept : "";
    const parsedAttestation = Number(item.attestations);
    const attestation = Number.isFinite(parsedAttestation) ? parsedAttestation : 0;
    return defaultLabel && lexicalConcept ? [{ defaultLabel, lexicalConcept, attestation }] : [];
  });
  const rawTotalHits = container.totalHits
    ?? container.totalhits
    ?? nestedData.totalHits
    ?? nestedData.totalhits;
  const parsedTotalHits = Number(rawTotalHits);

  return {
    concepts,
    totalHits: Number.isFinite(parsedTotalHits) ? parsedTotalHits : concepts.length,
  };
}

function containsTimestamp(payload: unknown): boolean {
  if (typeof payload === "number") return Number.isFinite(payload);
  if (typeof payload === "string") {
    const value = payload.trim();
    return /^\d{10,}$/.test(value) || (!/^\d+$/.test(value) && !Number.isNaN(Date.parse(value)));
  }
  if (!payload || typeof payload !== "object") return false;
  const container = payload as Record<string, unknown>;
  return [container.timestamp, container.timeStamp, container.lastUpdate, container.date]
    .some(containsTimestamp);
}

function readConversionJob(payload: unknown): TextConversionJob | null {
  const container = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {};
  const jobs = Array.isArray(payload)
    ? payload
    : [container.jobs, container.items, container.data, container.results].find(Array.isArray) ?? [];
  const rawJob = jobs[0] ?? (!Array.isArray(payload) ? payload : null);
  if (!rawJob || typeof rawJob !== "object") return null;
  const job = rawJob as Record<string, unknown>;
  const state = typeof job.state === "string" ? job.state.toUpperCase() : "";
  if (!state) return null;
  return {
    state,
    message: typeof job.message === "string" ? job.message : undefined,
  };
}

async function readErrorDetail(response: Response) {
  const body = (await response.text()).trim();
  if (!body) return `HTTP ${response.status}`;
  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    return String(payload.detail ?? payload.error ?? payload.message ?? body);
  } catch {
    return body;
  }
}

async function waitForTextConversion(fileId: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const response = await fetch(
      `${textsEndpoint}/${encodeURIComponent(fileId)}/status`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    if (!response.ok) throw new Error(await readErrorDetail(response));

    const job = readConversionJob(await response.json() as unknown);
    if (job?.state === "COMPLETED") return;
    if (job && ["FAILED", "CANCELLED"].includes(job.state)) {
      throw new Error(job.message || `Conversione ${job.state.toLocaleLowerCase("it-IT")}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Tempo massimo superato durante la conversione del testo");
}

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
  const [uploadLoading, setUploadLoading] = useState(false);
  const [concepts, setConcepts] = useState<LexicalConcept[]>([]);
  const [conceptTotalHits, setConceptTotalHits] = useState(0);
  const [conceptsLoading, setConceptsLoading] = useState(false);
  const [conceptsError, setConceptsError] = useState("");
  const [conceptSearchQuery, setConceptSearchQuery] = useState("");
  const [editingConceptUrl, setEditingConceptUrl] = useState("");
  const [editedConceptLabel, setEditedConceptLabel] = useState("");
  const [savingConceptUrl, setSavingConceptUrl] = useState("");
  const [growlMessage, setGrowlMessage] = useState("");
  const [attestationSaving, setAttestationSaving] = useState(false);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState("");
  const textRef = useRef<HTMLDivElement>(null);
  const textRequestId = useRef(0);
  const activeInterviewIdRef = useRef("");
  const conceptsRequestId = useRef(0);
  const growlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeInterview = interviews.find((item) => item.id === activeInterviewId) ?? interviews[0];
  const text = activeInterview?.text ?? "";
  const fileName = activeInterview?.name ?? "Nessuna intervista";
  const annotations = activeInterview?.annotations ?? [];
  const description = activeInterview?.description?.trim() ?? "";
  const normalizedInterviewQuery = searchQuery.trim().toLocaleLowerCase("it-IT");
  const filteredInterviews = normalizedInterviewQuery
    ? interviews.filter((interview) =>
        interview.name.toLocaleLowerCase("it-IT").includes(normalizedInterviewQuery),
      )
    : interviews;
  const filteredConcepts = concepts.filter((concept) =>
    concept.defaultLabel.toLocaleLowerCase("it").includes(conceptSearchQuery.trim().toLocaleLowerCase("it")),
  );

  const showError = useCallback((message: string) => {
    setGrowlMessage(message);
    if (growlTimer.current) clearTimeout(growlTimer.current);
    growlTimer.current = setTimeout(() => setGrowlMessage(""), 6000);
  }, []);

  const loadCanonicalText = useCallback(async (interviewId: string) => {
    const requestId = ++textRequestId.current;
    setTextError("");
    setTextLoading(true);
    try {
      const [canonicalResult, attestationsResult] = await Promise.allSettled([
        (async () => {
          const response = await fetch(
            `/api/lexo/texts/${encodeURIComponent(interviewId)}/canonical`,
            { headers: { Accept: "text/plain" }, cache: "no-store" },
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.text();
        })(),
        fetchAttestations(interviewId),
      ]);
      if (canonicalResult.status === "rejected") throw canonicalResult.reason;
      if (requestId !== textRequestId.current) return;
      setInterviews((current) => current.map((item) => item.id === interviewId
        ? {
            ...item,
            text: canonicalResult.value,
            ...(attestationsResult.status === "fulfilled"
              ? {
                  annotations: attestationsResult.value,
                  annotationCount: attestationsResult.value.length,
                }
              : {}),
          }
        : item));
      if (attestationsResult.status === "rejected") {
        showError(`Impossibile caricare le attestazioni: ${attestationsResult.reason instanceof Error
          ? attestationsResult.reason.message
          : "errore sconosciuto"}`);
      }
    } catch (error) {
      if (requestId !== textRequestId.current) return;
      setTextError(`Impossibile caricare il testo (${error instanceof Error ? error.message : "errore sconosciuto"}).`);
    } finally {
      if (requestId === textRequestId.current) setTextLoading(false);
    }
  }, [showError]);

  const loadArchive = useCallback(async (preferredInterviewId?: string) => {
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

        const id = readResourceIdentifier(
          item.fileId ?? item.id ?? item.textId ?? item.iri ?? item["@id"] ?? `server-${index}`,
        );
        const explicitContextIri = readResourceIdentifier(
          item.contextIri ?? item.nifContext ?? item.context,
        );
        const documentUri = readResourceIdentifier(
          item.documentUri ?? item.fileIri ?? item.fileIRI ?? item.iri ?? item["@id"],
        );
        const contextIri = explicitContextIri
          || (documentUri ? `${documentUri.replace(/#.*$/, "")}#context` : "");

        return {
          id,
          contextIri,
          name: String(item.fileName ?? item.filename ?? item.name ?? item.title ?? item.label ?? `Intervista ${index + 1}`),
          text: String(item.text ?? item.content ?? item.body ?? item.value ?? ""),
          description: String(rawDescription),
          annotations: [],
          source: "server" as const,
          sizeBytes: Number(item.sizeBytes ?? 0),
          sentenceCount: Number(item.sentenceCount ?? 0),
          tokenCount: Number(item.tokenCount ?? 0),
          annotationCount: Number(item.annotationCount ?? item.attestationCount ?? 0),
        };
      });

      setInterviews((current) => [
        ...serverInterviews,
        ...current.filter((item) => item.source === "local"),
      ]);
      const requestedInterviewId = preferredInterviewId ?? activeInterviewIdRef.current;
      const interviewToLoad = serverInterviews.find((item) => item.id === requestedInterviewId)
        ?? serverInterviews[0];
      if (interviewToLoad) {
        activeInterviewIdRef.current = interviewToLoad.id;
        setActiveInterviewId(interviewToLoad.id);
        await loadCanonicalText(interviewToLoad.id);
      } else {
        setTextLoading(false);
      }
      return preferredInterviewId ? interviewToLoad?.id === preferredInterviewId : true;
    } catch (error) {
      setArchiveError(`Impossibile caricare l’archivio (${error instanceof Error ? error.message : "errore sconosciuto"}).`);
      setTextLoading(false);
      return false;
    } finally {
      setArchiveLoading(false);
    }
  }, [loadCanonicalText]);

  const loadConcepts = useCallback(async () => {
    const requestId = ++conceptsRequestId.current;
    setConceptsLoading(true);
    setConceptsError("");
    setEditingConceptUrl("");
    try {
      const response = await fetch(conceptsEndpoint, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = parseLexicalConcepts(await response.json() as unknown);
      if (requestId !== conceptsRequestId.current) return;
      setConcepts(parsed.concepts);
      setConceptTotalHits(parsed.totalHits);
    } catch (error) {
      if (requestId !== conceptsRequestId.current) return;
      setConceptsError(`Impossibile caricare i concetti (${error instanceof Error ? error.message : "errore sconosciuto"}).`);
    } finally {
      if (requestId === conceptsRequestId.current) setConceptsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadArchive(), 0);
    return () => clearTimeout(timer);
  }, [loadArchive]);

  useEffect(() => () => {
    if (growlTimer.current) clearTimeout(growlTimer.current);
  }, []);

  function showConceptError() {
    showError("La label non è stata modificata a causa di un errore in LexO-server.");
  }

  function startEditingConcept(concept: LexicalConcept) {
    if (savingConceptUrl) return;
    setEditingConceptUrl(concept.lexicalConcept);
    setEditedConceptLabel(concept.defaultLabel);
  }

  async function saveConceptLabel(concept: LexicalConcept) {
    const target = editedConceptLabel.trim();
    if (!target) {
      setEditingConceptUrl("");
      return;
    }
    if (target === concept.defaultLabel) {
      setEditingConceptUrl("");
      return;
    }

    setSavingConceptUrl(concept.lexicalConcept);
    try {
      const response = await fetch(updateLexicalLabelEndpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          relation: "http://www.w3.org/2004/02/skos/core#prefLabel",
          source: concept.lexicalConcept,
          target,
          oldTarget: concept.defaultLabel,
          targetLanguage: "it",
          oldTargetLanguage: "it",
        }),
      });
      const body = await response.text();
      let payload: unknown = body;
      try {
        payload = JSON.parse(body) as unknown;
      } catch {
        // LexO-server può restituire il timestamp anche come testo semplice.
      }
      if (!response.ok || !containsTimestamp(payload)) throw new Error(`HTTP ${response.status}`);

      setConcepts((current) => current.map((item) => item.lexicalConcept === concept.lexicalConcept
        ? { ...item, defaultLabel: target }
        : item));
      setEditingConceptUrl("");
    } catch {
      setEditedConceptLabel(concept.defaultLabel);
      setEditingConceptUrl("");
      showConceptError();
    } finally {
      setSavingConceptUrl("");
    }
  }

  function handleConceptEditKeyDown(event: KeyboardEvent<HTMLInputElement>, concept: LexicalConcept) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveConceptLabel(concept);
    } else if (event.key === "Escape") {
      setEditingConceptUrl("");
      setEditedConceptLabel(concept.defaultLabel);
    }
  }

  async function selectInterview(interview: Interview) {
    if (attestationSaving || uploadLoading) return;
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

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    textRequestId.current += 1;
    setUploadLoading(true);
    setArchiveLoading(true);
    setArchiveError("");
    setTextLoading(true);
    setTextError("");
    setSelection(null);
    setSelectedConcepts([]);
    setGrowlMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file, file.name);
      formData.append("language", "it");
      const uploadResponse = await fetch(textUploadEndpoint, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData,
      });
      if (!uploadResponse.ok) throw new Error(await readErrorDetail(uploadResponse));
      const uploadPayload = await uploadResponse.json() as Record<string, unknown>;
      const fileId = readResourceIdentifier(uploadPayload.fileId ?? uploadPayload.id);
      if (!fileId) throw new Error("LexO-server non ha restituito l’identificativo del testo");

      const conversionResponse = await fetch(
        `${textsEndpoint}/${encodeURIComponent(fileId)}/convert`,
        { method: "POST", headers: { Accept: "application/json" } },
      );
      if (!conversionResponse.ok) throw new Error(await readErrorDetail(conversionResponse));
      await waitForTextConversion(fileId);

      activeInterviewIdRef.current = fileId;
      setSearchQuery("");
      if (!await loadArchive(fileId)) {
        throw new Error("Il testo convertito non è ancora disponibile nell’archivio");
      }
    } catch (error) {
      setArchiveLoading(false);
      setTextLoading(false);
      showError(`Errore durante l’importazione dell’intervista: ${error instanceof Error ? error.message : "errore sconosciuto"}`);
    } finally {
      setUploadLoading(false);
      input.value = "";
    }
  }

  function captureSelection() {
    if (attestationSaving) {
      setDragging(false);
      return;
    }
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

  async function addAnnotation() {
    if (!selection || selectedConcepts.length === 0 || attestationSaving) return;
    if (!activeInterview || activeInterview.source !== "server" || !activeInterview.contextIri) {
      showError("Non è possibile creare l’attestazione: l’intervista non contiene l’IRI del nif:Context.");
      return;
    }

    const selectedLexicalConcepts = selectedConcepts.flatMap((lexicalConcept) => {
      const concept = concepts.find((item) => item.lexicalConcept === lexicalConcept);
      return concept ? [concept] : [];
    });
    if (selectedLexicalConcepts.length !== selectedConcepts.length) {
      showError("Non è possibile creare l’attestazione: uno dei concetti selezionati non è più disponibile.");
      return;
    }

    setAttestationSaving(true);
    setGrowlMessage("");
    try {
      const parameters = new URLSearchParams({ corpus: activeInterview.contextIri });
      const response = await fetch(
        `${attestationsEndpoint}/by-locus?${parameters.toString()}`,
        {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            value: selection.text,
            start: selection.start,
            end: selection.end,
            observables: selectedLexicalConcepts.map((concept) => concept.lexicalConcept),
          }),
        },
      );
      if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(detail || `HTTP ${response.status}`);
      }

      const loadedAnnotations = await fetchAttestations(activeInterview.id, concepts);
      setInterviews((current) => current.map((interview) => interview.id === activeInterview.id
        ? { ...interview, annotations: loadedAnnotations, annotationCount: loadedAnnotations.length }
        : interview));
      window.getSelection()?.removeAllRanges();
      setSelectedConcepts([]);
      setSelection(null);
    } catch (error) {
      showError(`Errore durante il salvataggio dell’annotazione: ${error instanceof Error ? error.message : "errore sconosciuto"}`);
    } finally {
      setAttestationSaving(false);
    }
  }

  function toggleConcept(lexicalConcept: string) {
    if (!selection || attestationSaving) return;
    setSelectedConcepts((current) => current.includes(lexicalConcept)
      ? current.filter((item) => item !== lexicalConcept)
      : [...current, lexicalConcept]);
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
        <mark key={`${keyPrefix}-annotation-${annotationStart}-${index}`} data-labels={annotation.label}>
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
            onClick={() => {
              setActivePage(index);
              if (index === 3) void loadConcepts();
            }}
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
                    <label
                      className={`archive-upload ${uploadLoading ? "disabled" : ""}`}
                      aria-label="Carica intervista"
                      aria-disabled={uploadLoading}
                    >
                      <span aria-hidden="true">↑</span>
                      <input
                        type="file"
                        accept=".txt,.md,.markdown,text/plain,text/markdown"
                        onChange={(event) => void handleFile(event)}
                        disabled={uploadLoading}
                      />
                    </label>
                    <button
                      className="archive-reload"
                      onClick={() => void loadArchive()}
                      disabled={archiveLoading || uploadLoading}
                      aria-label="Ricarica archivio da LexO-server"
                      title="Ricarica archivio"
                    >
                      ↻
                    </button>
                    <small className="sidebar-count">{interviews.length} {interviews.length === 1 ? "file" : "file"}</small>
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
                    autoComplete="off"
                    spellCheck={false}
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
                  {attestationSaving ? (
                    <div className="annotation-progress" role="status" aria-live="polite" aria-label="Salvataggio annotazione in corso">
                      <span aria-hidden="true" />
                    </div>
                  ) : (
                    <span>Seleziona una porzione di testo con il mouse</span>
                  )}
                  <div className="legend"><span /> {annotations.length} annotazioni</div>
                </div>
              </div>

              <aside className={`concept-sidebar ${selection ? "selection-active" : ""}`} aria-label="Repertorio dei concetti">
                <div className="sidebar-heading concept-heading">
                  <span>REPERTORIO</span>
                  <div className="concept-heading-row">
                    <strong>Concetti</strong>
                    <button
                      className="archive-reload"
                      onClick={() => void loadConcepts()}
                      disabled={conceptsLoading}
                      aria-label="Ricarica concetti da LexO-server"
                      title="Ricarica concetti"
                    >
                      ↻
                    </button>
                    <small className="sidebar-count">{conceptTotalHits} voci</small>
                  </div>
                </div>
                <div className="concept-intro">
                  {selection
                    ? "Seleziona uno o più concetti, poi premi nuovamente la penna."
                    : "Seleziona una parte dell’intervista per associare i concetti."}
                </div>
                <div className="interview-search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    value={conceptSearchQuery}
                    onChange={(event) => setConceptSearchQuery(event.target.value)}
                    placeholder="Cerca concetto…"
                    aria-label="Cerca concetto per label"
                  />
                </div>
                <div className="concept-list">
                  {conceptsLoading && (
                    <div className="archive-loading" role="status" aria-live="polite">
                      <span className="loading-spinner" aria-hidden="true" />
                      <small>Caricamento da LexO-server…</small>
                    </div>
                  )}
                  {!conceptsLoading && conceptsError && (
                    <div className="archive-error">
                      <strong>Repertorio non disponibile</strong>
                      <small>{conceptsError}</small>
                      <code>LexO-server /service/data/lexicalConcepts?id=root</code>
                    </div>
                  )}
                  {!conceptsLoading && !conceptsError && filteredConcepts.map((concept) => {
                    const isSelected = selectedConcepts.includes(concept.lexicalConcept);
                    const isEditing = editingConceptUrl === concept.lexicalConcept;
                    const isSaving = savingConceptUrl === concept.lexicalConcept;
                    return (
                      <div
                        key={concept.lexicalConcept}
                        className={`concept-item ${isSelected ? "selected" : ""} ${!selection ? "selection-disabled" : ""}`}
                      >
                        <span className="concept-check">{isSelected ? "✓" : ""}</span>
                        {isEditing ? (
                          <input
                            className="concept-edit-input"
                            value={editedConceptLabel}
                            onChange={(event) => setEditedConceptLabel(event.target.value)}
                            onKeyDown={(event) => handleConceptEditKeyDown(event, concept)}
                            onBlur={() => {
                              if (!isSaving) {
                                setEditedConceptLabel(concept.defaultLabel);
                                setEditingConceptUrl("");
                              }
                            }}
                            disabled={isSaving}
                            aria-label={`Modifica ${concept.defaultLabel}`}
                            autoFocus
                          />
                        ) : (
                          <button
                            className="concept-label-button"
                            onClick={() => toggleConcept(concept.lexicalConcept)}
                            onDoubleClick={() => startEditingConcept(concept)}
                            aria-pressed={isSelected}
                            aria-disabled={!selection || attestationSaving}
                            title="Doppio clic per modificare la label"
                          >
                            <span className="concept-label-copy">
                              <strong>{concept.defaultLabel}</strong>
                              <small className="concept-attestation">({concept.attestation})</small>
                            </span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {!conceptsLoading && !conceptsError && filteredConcepts.length === 0 && (
                    <p className="empty-search">
                      {concepts.length === 0 ? "Nessun concetto trovato." : "Nessun concetto corrispondente."}
                    </p>
                  )}
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
          disabled={attestationSaving}
          aria-label={selectedConcepts.length ? "Conferma l’annotazione" : "Seleziona uno o più concetti"}
          title={selectedConcepts.length ? "Conferma l’annotazione" : "Seleziona uno o più concetti nel repertorio"}
        >
          ✎
        </button>
      )}
      {growlMessage && (
        <div className="error-growl" role="alert" aria-live="assertive">
          <span aria-hidden="true">!</span>
          <p>{growlMessage}</p>
          <button onClick={() => setGrowlMessage("")} aria-label="Chiudi messaggio">×</button>
        </div>
      )}
    </div>
  );
}
