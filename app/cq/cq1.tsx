"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dictionaries, type Lang } from "../strings";
import {
  type CqEntry,
  type CqInterview,
  type CqPolarity,
  attestationsCorpusEndpoint,
  cqEndpoint,
  downloadCsv,
  emptyDemographicsParams,
  lexicalEntriesEndpoint,
  metadataPropertyValues,
  normalizeSex,
  parseInterviews,
  parseDemographics,
  parseLexicalEntries,
  polarityNames,
  polarityOrder,
  readErrorDetail,
  readResourceIdentifier,
  referringConceptProperty,
  textsEndpoint,
} from "./shared";
import { Cq1NetworkGraph, type Cq1GraphSelection } from "./cq1-graph";


const panelTruncation = 8;
const passagesTruncation = 10;

const polarityPanelTitles: Record<CqPolarity, (t: (typeof dictionaries)["it"]) => string> = {
  positive: (t) => t.cq1.positiveTitle,
  neutral: (t) => t.cq1.neutralTitle,
  negative: (t) => t.cq1.negativeTitle,
};

interface NarrativeConcept {
  concept: string;
  label: string;
  polarity: CqPolarity;
  interviewees: number;
  occurrences: number;
}

interface ParadigmaticConcept {
  concept: string;
  label: string;
  interviewees: number;
  occurrences: number;
}

interface CqPassage {
  id: string;
  age: string;
  sex: string;
  residence: string;
  value: string;
}

interface SelectedConcept {
  concept: string;
  label: string;
  kind: "narrative" | "paradigmatic";
  polarity?: CqPolarity;
}

type SortMode = "interviewees" | "occurrences" | "az" | "za";

function sortConcepts<T extends { label: string; interviewees: number; occurrences: number }>(
  concepts: T[],
  sort: SortMode,
): T[] {
  const sorted = [...concepts];
  if (sort === "az") sorted.sort((a, b) => a.label.localeCompare(b.label, "it"));
  else if (sort === "za") sorted.sort((a, b) => b.label.localeCompare(a.label, "it"));
  else if (sort === "occurrences") sorted.sort((a, b) => b.occurrences - a.occurrences || a.label.localeCompare(b.label, "it"));
  else sorted.sort((a, b) => b.interviewees - a.interviewees || b.occurrences - a.occurrences || a.label.localeCompare(b.label, "it"));
  return sorted;
}

export function Cq1Panel({ lang, onBack }: { lang: Lang; onBack: () => void }) {
  const t = dictionaries[lang];
  const numberLocale = lang === "en" ? "en-US" : "it-IT";

  const [entries, setEntries] = useState<CqEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entriesError, setEntriesError] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<CqEntry | null>(null);

  const [polarities, setPolarities] = useState<Set<CqPolarity>>(new Set(polarityOrder));
  const [sort, setSort] = useState<SortMode>("interviewees");

  const [viewMode, setViewMode] = useState<"list" | "graph">("list");
  const [graphHighlight, setGraphHighlight] = useState<string | null>(null);

  const [narrative, setNarrative] = useState<NarrativeConcept[]>([]);
  const [paradigmatic, setParadigmatic] = useState<ParadigmaticConcept[]>([]);
  const [conceptsLoading, setConceptsLoading] = useState(false);
  const [conceptsError, setConceptsError] = useState("");

  const [selectedConcept, setSelectedConcept] = useState<SelectedConcept | null>(null);
  const [passages, setPassages] = useState<CqPassage[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  const [showAllPanels, setShowAllPanels] = useState<Record<string, boolean>>({});
  const [passagesShowAll, setPassagesShowAll] = useState(false);

  const attestationsCorpusRef = useRef<Map<string, Record<string, unknown>[]> | null>(null);
  const interviewsRef = useRef<CqInterview[] | null>(null);

  const applyEntry = useCallback((entry: CqEntry) => {
    setSelectedConcept(null);
    setPassages([]);
    setDetailsError("");
    setShowAllPanels({});
    setGraphHighlight(null);
    setSelectedEntry(entry);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadEntries = async () => {
      setEntriesLoading(true);
      setEntriesError("");
      try {
        const response = await fetch(lexicalEntriesEndpoint, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) throw new Error(await readErrorDetail(response));
        const parsed = parseLexicalEntries(await response.json());
        if (cancelled) return;
        setEntries(parsed);
        if (parsed.length > 0) applyEntry(parsed[0]);
      } catch (error) {
        if (!cancelled) setEntriesError(error instanceof Error ? error.message : t.cq1.entryEmpty);
      } finally {
        if (!cancelled) setEntriesLoading(false);
      }
    };
    void loadEntries();
    return () => { cancelled = true; };
  }, [t, applyEntry]);

  useEffect(() => {
    if (!selectedEntry) return;
    let cancelled = false;
    const loadConcepts = async () => {
      setConceptsLoading(true);
      setConceptsError("");
      try {
        const [narrativeResponse, paradigmaticResponse] = await Promise.all([
          fetch(`${cqEndpoint}/cq1-narrative-concepts-by-polarity`, {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ term: selectedEntry.label, ...emptyDemographicsParams }),
            cache: "no-store",
          }),
          fetch(`${cqEndpoint}/cq1-paradigmatic-concepts`, {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ term: selectedEntry.label, ...emptyDemographicsParams }),
            cache: "no-store",
          }),
        ]);
        for (const response of [narrativeResponse, paradigmaticResponse]) {
          if (!response.ok) throw new Error(await readErrorDetail(response));
        }
        const narrativePayload = await narrativeResponse.json() as { rows?: Record<string, string>[] };
        const paradigmaticPayload = await paradigmaticResponse.json() as { rows?: Record<string, string>[] };
        if (cancelled) return;
        const narrativeRows = (narrativePayload.rows ?? []).flatMap((row) => {
          const concept = row.concept ?? "";
          const label = row.label ?? "";
          const polarityIri = row.polarity ?? "";
          const polarity = polarityIri.toLowerCase().includes("positive")
            ? "positive" as CqPolarity
            : polarityIri.toLowerCase().includes("neutral")
              ? "neutral" as CqPolarity
              : polarityIri.toLowerCase().includes("negative")
                ? "negative" as CqPolarity
                : "";
          const interviewees = Number(row.numberOfTexts ?? 0);
          const occurrences = Number(row.numberOfAttestations ?? 0);
          if (!concept || !polarity || (interviewees === 0 && occurrences === 0)) return [];
          return [{ concept, label: label || concept, polarity, interviewees, occurrences }];
        });
        const paradigmaticRows = (paradigmaticPayload.rows ?? []).flatMap((row) => {
          const concept = row.concept ?? "";
          const interviewees = Number(row.numberOfTexts ?? 0);
          const occurrences = Number(row.numberOfAttestations ?? 0);
          if (!concept || (interviewees === 0 && occurrences === 0)) return [];
          return [{ concept, label: row.label || concept, interviewees, occurrences }];
        });
        setNarrative(narrativeRows);
        setParadigmatic(paradigmaticRows);
      } catch (error) {
        if (!cancelled) setConceptsError(error instanceof Error ? error.message : t.cq1.loading);
      } finally {
        if (!cancelled) setConceptsLoading(false);
      }
    };
    void loadConcepts();
    return () => { cancelled = true; };
  }, [selectedEntry, t]);

  const ensureCaches = useCallback(async () => {
    if (attestationsCorpusRef.current && interviewsRef.current) {
      return { corpus: attestationsCorpusRef.current, interviews: interviewsRef.current };
    }
    const [corpusResponse, interviewsResponse] = await Promise.all([
      fetch(attestationsCorpusEndpoint, { headers: { Accept: "application/json" }, cache: "no-store" }),
      fetch(textsEndpoint, { headers: { Accept: "application/json" }, cache: "no-store" }),
    ]);
    for (const response of [corpusResponse, interviewsResponse]) {
      if (!response.ok) throw new Error(await readErrorDetail(response));
    }
    const corpusPayload = await corpusResponse.json() as { attestations?: Record<string, unknown> };
    const corpus = new Map<string, Record<string, unknown>[]>();
    for (const [fileId, value] of Object.entries(corpusPayload.attestations ?? {})) {
      if (Array.isArray(value)) corpus.set(fileId, value as Record<string, unknown>[]);
    }
    const interviews = parseInterviews(await interviewsResponse.json());
    attestationsCorpusRef.current = corpus;
    interviewsRef.current = interviews;
    return { corpus, interviews };
  }, []);

  useEffect(() => {
    if (!selectedConcept || !selectedEntry) return;
    let cancelled = false;
    const loadDetails = async () => {
      setDetailsLoading(true);
      setDetailsError("");
      setPassagesShowAll(false);
      try {
        if (selectedConcept.kind === "narrative") {
          const response = await fetch(`${cqEndpoint}/cq1-concept-detail`, {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({
              term: selectedEntry.label,
              concept: selectedConcept.concept,
              polarity: selectedConcept.polarity,
            }),
            cache: "no-store",
          });
          if (!response.ok) throw new Error(await readErrorDetail(response));
          const payload = await response.json() as { rows?: Record<string, string>[] };
          const rows = payload.rows ?? [];
          const { corpus } = await ensureCaches();
          const attestationIndex = new Map<string, Record<string, unknown>>();
          for (const items of corpus.values()) {
            for (const item of items) {
              const iri = readResourceIdentifier(item.attestation);
              if (iri) attestationIndex.set(iri, item);
            }
          }
          if (cancelled) return;
          const detailPassages = rows.flatMap((row) => {
            const item = attestationIndex.get(row.attestation ?? "");
            const value = item && typeof item.value === "string" ? item.value : "";
            return [{
              id: row.id ?? "",
              age: row.age ?? "",
              sex: row.sex ?? "",
              residence: row.residence ?? "",
              value,
            }];
          });
          setPassages(detailPassages);
        } else {
          const { corpus, interviews } = await ensureCaches();
          const senseSet = new Set(selectedEntry.senses);
          const interviewById = new Map(interviews.map((interview) => [interview.id, interview]));
          const detailPassages: CqPassage[] = [];
          const seenAttestations = new Set<string>();
          for (const [fileId, items] of corpus) {
            const interview = interviewById.get(fileId);
            for (const item of items) {
              const observable = readResourceIdentifier(item.observable);
              const concept = metadataPropertyValues(item.metadata, referringConceptProperty)[0] ?? "";
              const iri = readResourceIdentifier(item.attestation);
              if (!senseSet.has(observable) || concept !== selectedConcept.concept) continue;
              if (iri && seenAttestations.has(iri)) continue;
              if (iri) seenAttestations.add(iri);
              const demographics = parseDemographics(interview?.description ?? "");
              detailPassages.push({
                id: interview?.metadataId || interview?.name || fileId,
                age: demographics.age,
                sex: demographics.sex,
                residence: demographics.residence,
                value: typeof item.value === "string" ? item.value : "",
              });
            }
          }
          if (cancelled) return;
          setPassages(detailPassages);
        }
      } catch (error) {
        if (!cancelled) setDetailsError(error instanceof Error ? error.message : t.cq1.loading);
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
    };
    void loadDetails();
    return () => { cancelled = true; };
  }, [selectedConcept, selectedEntry, ensureCaches, t]);

  const narrativeByPolarity = useMemo(() => {
    const map = new Map<CqPolarity, NarrativeConcept[]>();
    for (const polarity of polarityOrder) {
      map.set(polarity, sortConcepts(narrative.filter((item) => item.polarity === polarity), sort));
    }
    return map;
  }, [narrative, sort]);

  const sortedParadigmatic = useMemo(
    () => sortConcepts(paradigmatic, sort),
    [paradigmatic, sort],
  );

  const details = useMemo(() => {
    const intervieweeIds = new Set(passages.map((passage) => passage.id));
    const interviewees = intervieweeIds.size;
    const occurrences = passages.length;
    const sexCounts = new Map<string, number>();
    const ageCounts = new Map<string, number>();
    for (const passage of passages) {
      const sex = normalizeSex(passage.sex);
      if (sex) sexCounts.set(sex, (sexCounts.get(sex) ?? 0) + 1);
    }
    for (const id of intervieweeIds) {
      const age = passages.find((passage) => passage.id === id)?.age ?? "";
      if (age) ageCounts.set(age, (ageCounts.get(age) ?? 0) + 1);
    }
    const topAge = [...ageCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "";
    return { interviewees, occurrences, sexCounts, ageCounts, topAge };
  }, [passages]);

  const visiblePassages = passagesShowAll ? passages : passages.slice(0, passagesTruncation);

  const togglePolarity = (polarity: CqPolarity) => {
    setPolarities((current) => {
      const next = new Set(current);
      if (next.has(polarity)) {
        if (next.size > 1) next.delete(polarity);
      } else {
        next.add(polarity);
      }
      return next;
    });
  };

  const renderConceptRow = (
    key: string,
    concept: { concept: string; label: string; interviewees: number; occurrences: number },
    polarity: CqPolarity | null,
    maxInterviewees: number,
    selected: boolean,
  ) => {
    const width = maxInterviewees > 0
      ? Math.max(4, Math.round((concept.interviewees / maxInterviewees) * 100))
      : 0;
    return (
      <li key={key} className={selected ? "cq-concept-row selected" : "cq-concept-row"}>
        <button
          type="button"
          className="cq-concept-button"
          onClick={() => setSelectedConcept({
            concept: concept.concept,
            label: concept.label,
            kind: key.startsWith("paradigmatic") ? "paradigmatic" : "narrative",
            polarity: polarity ?? undefined,
          })}
          aria-pressed={selected}
        >
          <span className="cq-concept-name">{concept.label}</span>
          <span className="cq-concept-counts">
            <strong>{concept.interviewees.toLocaleString(numberLocale)}</strong> {t.cq1.interviewees}
            {" · "}
            <strong>{concept.occurrences.toLocaleString(numberLocale)}</strong> {t.cq1.occurrences}
          </span>
          <span className="cq-concept-bar" aria-hidden="true">
            <span style={{ width: `${width}%` }} />
          </span>
        </button>
      </li>
    );
  };

  const renderPolarityPanel = (polarity: CqPolarity) => {
    const concepts = narrativeByPolarity.get(polarity) ?? [];
    const maxInterviewees = concepts.reduce((max, item) => Math.max(max, item.interviewees), 0);
    const showAll = showAllPanels[polarity] ?? false;
    const visible = showAll ? concepts : concepts.slice(0, panelTruncation);
    return (
      <article key={polarity} className={`cq-polarity-panel cq-${polarity}`}>
        <header className="cq-polarity-heading">
          <h3>{polarityPanelTitles[polarity](t)}</h3>
          <span>{t.cq1.conceptCount(concepts.length)}</span>
        </header>
        {concepts.length === 0 ? (
          <p className="cq-panel-empty">{t.cq1.panelEmpty}</p>
        ) : (
          <>
            <ul className="cq-concept-list">
              {visible.map((concept) => renderConceptRow(
                concept.concept,
                concept,
                polarity,
                maxInterviewees,
                selectedConcept?.concept === concept.concept
                  && selectedConcept?.polarity === polarity
                  && selectedConcept?.kind === "narrative",
              ))}
            </ul>
            {concepts.length > panelTruncation && (
              <button
                type="button"
                className="cq-show-toggle"
                onClick={() => setShowAllPanels((current) => ({ ...current, [polarity]: !showAll }))}
              >
                {showAll ? t.cq1.showLess : t.cq1.showAll(concepts.length)}
              </button>
            )}
          </>
        )}
      </article>
    );
  };

  const distributionSegments = useMemo(() => {
    const total = polarityOrder
      .filter((polarity) => polarities.has(polarity))
      .reduce((sum, polarity) => sum + (narrativeByPolarity.get(polarity)?.length ?? 0), 0);
    if (total === 0) return [];
    let offset = 0;
    return polarityOrder
      .filter((polarity) => polarities.has(polarity))
      .map((polarity) => {
        const count = narrativeByPolarity.get(polarity)?.length ?? 0;
        const fraction = count / total;
        const segment = { polarity, count, fraction, offset };
        offset += fraction;
        return segment;
      });
  }, [narrativeByPolarity, polarities]);

  const donutRadius = 40;
  const donutCircumference = 2 * Math.PI * donutRadius;

  return (
    <section className={`cq-page cq-analysis${entriesLoading || conceptsLoading || detailsLoading ? " is-loading" : ""}`} aria-labelledby="cq1-title">
      <button type="button" className="cq-back" onClick={onBack}>‹ {t.cq.backToCards}</button>

      <header className="cq-analysis-hero">
        <p className="section-kicker">{t.cq.kicker}</p>
        <h2 id="cq1-title">{t.cq1.panelTitle}</h2>
        {selectedEntry && <p>{t.cq1.subtitle(selectedEntry.label)}</p>}
      </header>

      <div className="cq-analysis-controls">
        <label className="cq-control">
          <span>{t.cq1.entrySelectLabel}</span>
          <select
            value={selectedEntry?.label ?? ""}
            disabled={entriesLoading || entries.length === 0}
            onChange={(event) => {
              const entry = entries.find((candidate) => candidate.label === event.target.value);
              if (entry) applyEntry(entry);
            }}
          >
            {entries.map((entry) => (
              <option key={entry.entry} value={entry.label}>{entry.label}</option>
            ))}
          </select>
        </label>

        <div className="cq-control">
          <span>{t.cq1.polarityViewLabel}</span>
          <div className="cq-polarity-chips">
            {polarityOrder.map((polarity) => (
              <button
                key={polarity}
                type="button"
                className={`cq-chip cq-chip-${polarity} ${polarities.has(polarity) ? "active" : ""}`}
                aria-pressed={polarities.has(polarity)}
                onClick={() => togglePolarity(polarity)}
              >
                {polarityNames[polarity](t)}
              </button>
            ))}
          </div>
        </div>

        <div className="cq-control">
          <span>{t.cq1.viewLabel}</span>
          <div className="cq-view-toggle">
            <button
              type="button"
              className={viewMode === "list" ? "active" : ""}
              aria-pressed={viewMode === "list"}
              onClick={() => setViewMode("list")}
            >
              {t.cq1.viewList}
            </button>
            <button
              type="button"
              className={viewMode === "graph" ? "active" : ""}
              aria-pressed={viewMode === "graph"}
              onClick={() => setViewMode("graph")}
            >
              {t.cq1.viewGraph}
            </button>
          </div>
        </div>

        {viewMode === "list" && (
          <label className="cq-control">
            <span>{t.cq1.sortLabel}</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
              <option value="interviewees">{t.cq1.sortInterviewees}</option>
              <option value="occurrences">{t.cq1.sortOccurrences}</option>
              <option value="az">{t.cq1.sortAZ}</option>
              <option value="za">{t.cq1.sortZA}</option>
            </select>
          </label>
        )}
      </div>

      {entriesLoading && <p className="cq-status">{t.cq1.entryLoading}</p>}
      {entriesError && <p className="cq-status cq-status-error">{t.cq1.errorPrefix}{entriesError}</p>}
      {conceptsLoading && <p className="cq-status">{t.cq1.loading}</p>}
      {conceptsError && <p className="cq-status cq-status-error">{t.cq1.errorPrefix}{conceptsError}</p>}

      {selectedEntry && !conceptsLoading && !conceptsError && (
        <div className="cq-analysis-layout">
          <div className="cq-analysis-main">
            {viewMode === "graph" ? (
              <Cq1NetworkGraph
                entry={selectedEntry}
                narrative={narrative}
                paradigmatic={paradigmatic}
                polarities={polarities}
                lang={lang}
                selectedConcept={selectedConcept}
                highlightConcept={graphHighlight}
                ensureCaches={ensureCaches}
                onSelectConcept={(selection: Cq1GraphSelection) => {
                  setSelectedConcept(selection);
                  setGraphHighlight(null);
                }}
                onClearHighlight={() => setGraphHighlight(null)}
                onBackToList={() => setViewMode("list")}
              />
            ) : (
            <>
            <div
              className="cq-polarity-grid"
              style={{ gridTemplateColumns: `repeat(${polarities.size}, minmax(0, 1fr))` }}
            >
              {polarityOrder.filter((polarity) => polarities.has(polarity)).map(renderPolarityPanel)}
            </div>

            <article className="cq-polarity-panel cq-paradigmatic">
              <header className="cq-polarity-heading">
                <h3>{t.cq1.paradigmaticTitle}</h3>
                <span>{t.cq1.conceptCount(sortedParadigmatic.length)}</span>
              </header>
              {sortedParadigmatic.length === 0 ? (
                <p className="cq-panel-empty">{t.cq1.paradigmaticEmpty}</p>
              ) : (
                <ul className="cq-concept-list">
                  {sortedParadigmatic.map((concept) => renderConceptRow(
                    `paradigmatic-${concept.concept}`,
                    concept,
                    null,
                    sortedParadigmatic.reduce((max, item) => Math.max(max, item.interviewees), 0),
                    selectedConcept?.concept === concept.concept && selectedConcept?.kind === "paradigmatic",
                  ))}
                </ul>
              )}
            </article>
            </>
            )}
          </div>

          <aside className="cq-analysis-side">
            {distributionSegments.length > 0 && polarities.size > 0 && (
              <article className="cq-distribution">
                <h3>{t.cq1.distributionTitle}</h3>
                <div className="cq-distribution-body">
                  <svg viewBox="0 0 110 110" className="cq-donut" aria-hidden="true">
                    {distributionSegments.map((segment) => {
                      const dash = segment.fraction * donutCircumference;
                      return (
                        <circle
                          key={segment.polarity}
                          cx="55" cy="55" r={donutRadius}
                          className={`cq-donut-segment cq-donut-${segment.polarity}`}
                          strokeWidth="16"
                          fill="none"
                          strokeDasharray={`${dash} ${donutCircumference - dash}`}
                          strokeDashoffset={-segment.offset * donutCircumference}
                        />
                      );
                    })}
                  </svg>
                  <ul className="cq-distribution-legend">
                    {distributionSegments.map((segment) => (
                      <li key={segment.polarity}>
                        <span className={`cq-dot cq-dot-${segment.polarity}`} aria-hidden="true" />
                        <span>{polarityNames[segment.polarity](t)}</span>
                        <strong>{segment.count.toLocaleString(numberLocale)}</strong>
                        <span className="cq-percent">
                          {Math.round(segment.fraction * 100).toLocaleString(numberLocale)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            )}
            <article className="cq-detail">
              <h3>{t.cq1.detailTitle}</h3>
              {!selectedConcept && <p className="cq-panel-empty">{t.cq1.detailEmpty}</p>}
              {selectedConcept && (
                <>
                  <h4 className="cq-detail-name">{selectedConcept.label}</h4>
                  <dl className="cq-detail-list">
                    {selectedConcept.polarity && (
                      <div>
                        <dt>{t.cq1.detailPolarity}</dt>
                        <dd>{polarityNames[selectedConcept.polarity](t)}</dd>
                      </div>
                    )}
                    <div>
                      <dt>{t.cq1.detailInterviewees}</dt>
                      <dd>{detailsLoading ? t.cq1.loading : details.interviewees.toLocaleString(numberLocale)}</dd>
                    </div>
                    <div>
                      <dt>{t.cq1.detailOccurrences}</dt>
                      <dd>{detailsLoading ? t.cq1.loading : details.occurrences.toLocaleString(numberLocale)}</dd>
                    </div>
                    <div>
                      <dt>{t.cq1.detailTopAge}</dt>
                      <dd>
                        {detailsLoading
                          ? t.cq1.loading
                          : details.topAge
                            ? `${details.topAge} ${lang === "en" ? "y.o." : "anni"}`
                            : t.cq1.detailNotAvailable}
                      </dd>
                    </div>
                    <div>
                      <dt>{t.cq1.detailSexBreakdown}</dt>
                      <dd>
                        {detailsLoading
                          ? t.cq1.loading
                          : details.sexCounts.size === 0
                            ? t.cq1.detailNotAvailable
                            : [...details.sexCounts.entries()]
                              .sort((left, right) => right[1] - left[1])
                              .map(([sex, count]) => `${sex}: ${count.toLocaleString(numberLocale)}`)
                              .join(" · ")}
                      </dd>
                    </div>
                    <div>
                      <dt>{t.cq1.detailAgeBreakdown}</dt>
                      <dd>
                        {detailsLoading
                          ? t.cq1.loading
                          : details.ageCounts.size === 0
                            ? t.cq1.detailNotAvailable
                            : [...details.ageCounts.entries()]
                              .sort((left, right) => Number(left[0]) - Number(right[0]))
                              .map(([age, count]) => `${age}: ${count.toLocaleString(numberLocale)}`)
                              .join(" · ")}
                      </dd>
                    </div>
                  </dl>
                  {selectedConcept.kind === "paradigmatic" && (
                    <p className="cq-detail-note">{t.cq1.detailParadigmaticNote}</p>
                  )}
                  <button
                    type="button"
                    className="cq-show-toggle"
                    onClick={() => {
                      setViewMode("graph");
                      setGraphHighlight((current) => (current === selectedConcept.concept ? null : selectedConcept.concept));
                    }}
                  >
                    {graphHighlight === selectedConcept.concept ? t.cq1.clearHighlight : t.cq1.highlightCooccurring}
                  </button>
                </>
              )}
            </article>

            <article className="cq-passages">
              <header className="cq-passages-heading">
                <h3>{t.cq1.passagesTitle}</h3>
                {selectedConcept && passages.length > 0 && (
                  <button
                    type="button"
                    className="cq-show-toggle"
                    onClick={() => downloadCsv(
                      `cq1-passages-${selectedEntry.label}.csv`,
                      [t.cq1.passageId, t.cq1.passageAge, t.cq1.passageSex, t.cq1.passageText],
                      passages.map((passage) => [passage.id, passage.age, passage.sex, passage.value]),
                    )}
                  >
                    {t.cq1.exportCsv}
                  </button>
                )}
              </header>
              {!selectedConcept && <p className="cq-panel-empty">{t.cq1.passagesEmpty}</p>}
              {selectedConcept && detailsError && (
                <p className="cq-status cq-status-error">{t.cq1.errorPrefix}{detailsError}</p>
              )}
              {selectedConcept && !detailsLoading && !detailsError && passages.length === 0 && (
                <p className="cq-panel-empty">{t.cq1.passagesEmpty}</p>
              )}
              {selectedConcept && visiblePassages.length > 0 && (
                <>
                  <table className="cq-passages-table">
                    <thead>
                      <tr>
                        <th>{t.cq1.passageId}</th>
                        <th>{t.cq1.passageAge}</th>
                        <th>{t.cq1.passageSex}</th>
                        <th>{t.cq1.passageText}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePassages.map((passage, index) => (
                        <tr key={`${passage.id}-${index}`}>
                          <td>{passage.id}</td>
                          <td>{passage.age || "—"}</td>
                          <td>{passage.sex ? normalizeSex(passage.sex) : "—"}</td>
                          <td>{passage.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {passages.length > passagesTruncation && (
                    <button
                      type="button"
                      className="cq-show-toggle"
                      onClick={() => setPassagesShowAll((current) => !current)}
                    >
                      {passagesShowAll ? t.cq1.showLess : t.cq1.passagesShowAll(passages.length)}
                    </button>
                  )}
                </>
              )}
            </article>
          </aside>
        </div>
      )}
    </section>
  );
}
