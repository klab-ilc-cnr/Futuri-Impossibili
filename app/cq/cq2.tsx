"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { dictionaries, type Lang } from "../strings";
import {
  type CqEntry,
  type CqInterview,
  type CqPolarity,
  attestationsCorpusEndpoint,
  conceptsEndpoint,
  downloadCsv,
  kwicContext,
  legacyPolarityProperty,
  lexicalEntriesEndpoint,
  lexicalEntryProperty,
  metadataPropertyValues,
  normalizeSex,
  parseConcepts,
  parseDemographics,
  parseInterviews,
  parseLexicalEntries,
  polarityFromValues,
  polarityNames,
  polarityOrder,
  polarityProperty,
  readErrorDetail,
  readResourceIdentifier,
  rdfsCommentProperty,
  searchPageSize,
  textsEndpoint,
} from "./shared";

type SortMode = "ageAsc" | "ageDesc" | "idAZ";

interface PassageRow {
  key: string;
  fileId: string;
  id: string;
  value: string;
  start: number;
  end: number;
  concept: string;
  age: string;
  sex: string;
  residence: string;
}

interface CqCaches {
  corpus: Map<string, Record<string, unknown>[]>;
  interviews: CqInterview[];
  concepts: Map<string, string>;
  texts: Map<string, string>;
}

function sortPassages(rows: PassageRow[], sort: SortMode): PassageRow[] {
  const sorted = [...rows];
  const ageOf = (row: PassageRow) => (row.age ? Number(row.age) : Number.POSITIVE_INFINITY);
  if (sort === "ageAsc") {
    sorted.sort((a, b) => ageOf(a) - ageOf(b) || a.id.localeCompare(b.id, "it") || a.start - b.start);
  } else if (sort === "ageDesc") {
    sorted.sort((a, b) => ageOf(b) - ageOf(a) || a.id.localeCompare(b.id, "it") || a.start - b.start);
  } else {
    sorted.sort((a, b) => a.id.localeCompare(b.id, "it") || a.start - b.start);
  }
  return sorted;
}

export function Cq2Panel({ lang, onBack }: { lang: Lang; onBack: () => void }) {
  const t = dictionaries[lang];
  const numberLocale = lang === "en" ? "en-US" : "it-IT";

  const [entries, setEntries] = useState<CqEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entriesError, setEntriesError] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<CqEntry | null>(null);

  const [selectedPolarity, setSelectedPolarity] = useState<CqPolarity>("positive");
  const [ageFilter, setAgeFilter] = useState("");
  const [sexFilter, setSexFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState({ id: "", value: "", concept: "", age: "", sex: "" });
  const [sort, setSort] = useState<SortMode>("ageAsc");
  const [page, setPage] = useState(0);
  const [expandedKey, setExpandedKey] = useState("");

  const [caches, setCaches] = useState<CqCaches | null>(null);
  const [cachesLoading, setCachesLoading] = useState(true);
  const [cachesError, setCachesError] = useState("");

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
        if (parsed.length > 0) setSelectedEntry(parsed[0]);
      } catch (error) {
        if (!cancelled) setEntriesError(error instanceof Error ? error.message : t.cq2.loading);
      } finally {
        if (!cancelled) setEntriesLoading(false);
      }
    };
    void loadEntries();
    return () => { cancelled = true; };
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    const loadCaches = async () => {
      setCachesLoading(true);
      setCachesError("");
      try {
        const responses = await Promise.all([
          fetch(attestationsCorpusEndpoint, { headers: { Accept: "application/json" }, cache: "no-store" }),
          fetch(textsEndpoint, { headers: { Accept: "application/json" }, cache: "no-store" }),
          fetch(conceptsEndpoint, { headers: { Accept: "application/json" }, cache: "no-store" }),
          fetch(`${textsEndpoint}/corpus`, { headers: { Accept: "application/json" }, cache: "no-store" }),
        ]);
        for (const response of responses) {
          if (!response.ok) throw new Error(await readErrorDetail(response));
        }
        const [corpusPayload, interviewsPayload, conceptsPayload, textsPayload] = await Promise.all(
          responses.map((response) => response.json() as Promise<unknown>),
        );
        if (cancelled) return;
        const corpus = new Map<string, Record<string, unknown>[]>();
        const corpusMap = (corpusPayload as { attestations?: Record<string, unknown> }).attestations ?? {};
        for (const [fileId, value] of Object.entries(corpusMap)) {
          if (Array.isArray(value)) corpus.set(fileId, value as Record<string, unknown>[]);
        }
        const texts = new Map<string, string>();
        const textsMap = (textsPayload as { texts?: Record<string, unknown> }).texts ?? {};
        for (const [fileId, value] of Object.entries(textsMap)) {
          if (typeof value === "string") texts.set(fileId, value);
        }
        setCaches({
          corpus,
          interviews: parseInterviews(interviewsPayload),
          concepts: parseConcepts(conceptsPayload),
          texts,
        });
      } catch (error) {
        if (!cancelled) setCachesError(error instanceof Error ? error.message : t.cq2.loading);
      } finally {
        if (!cancelled) setCachesLoading(false);
      }
    };
    void loadCaches();
    return () => { cancelled = true; };
  }, [t]);

  const interviewById = useMemo(() => {
    const map = new Map<string, CqInterview>();
    if (caches) for (const interview of caches.interviews) map.set(interview.id, interview);
    return map;
  }, [caches]);

  const allRows = useMemo(() => {
    if (!selectedEntry || !caches) return [];
    const label = selectedEntry.label.toLocaleLowerCase("it");
    const rows: PassageRow[] = [];
    for (const [fileId, items] of caches.corpus) {
      const interview = interviewById.get(fileId);
      const demographics = parseDemographics(interview?.description ?? "");
      for (const rawItem of items) {
        if (!rawItem || typeof rawItem !== "object") continue;
        const item = rawItem as Record<string, unknown>;
        const value = typeof item.value === "string" ? item.value : "";
        const start = Number(item.start);
        const end = Number(item.end);
        if (!value || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) continue;
        const comments = metadataPropertyValues(item.metadata, rdfsCommentProperty);
        const entryMatches = comments.some((comment) => comment.toLocaleLowerCase("it") === label)
          || metadataPropertyValues(item.metadata, lexicalEntryProperty).includes(selectedEntry.entry);
        if (!entryMatches) continue;
        const polarity = polarityFromValues([
          ...metadataPropertyValues(item.metadata, polarityProperty),
          ...metadataPropertyValues(item.metadata, legacyPolarityProperty),
        ]);
        if (polarity !== selectedPolarity) continue;
        const conceptIri = readResourceIdentifier(item.observable);
        rows.push({
          key: readResourceIdentifier(item.attestation) || `${fileId}-${start}`,
          fileId,
          id: interview?.metadataId || interview?.name || fileId,
          value,
          start,
          end,
          concept: conceptIri ? caches.concepts.get(conceptIri) ?? "—" : "—",
          age: demographics.age,
          sex: normalizeSex(demographics.sex),
          residence: demographics.residence,
        });
      }
    }
    return rows;
  }, [selectedEntry, selectedPolarity, caches, interviewById]);

  const availableAges = useMemo(() => {
    const ages = new Set<string>();
    for (const row of allRows) if (row.age) ages.add(row.age);
    return [...ages].sort((left, right) => Number(left) - Number(right));
  }, [allRows]);

  const filteredRows = useMemo(() => {
    const contains = (value: string, query: string) =>
      !query || value.toLocaleLowerCase("it").includes(query.toLocaleLowerCase("it"));
    return sortPassages(
      allRows.filter((row) =>
        (!ageFilter || row.age === ageFilter)
        && (!sexFilter || row.sex === sexFilter)
        && contains(row.id, columnFilters.id)
        && contains(row.value, columnFilters.value)
        && contains(row.concept, columnFilters.concept)
        && contains(row.age, columnFilters.age)
        && contains(row.sex, columnFilters.sex)),
      sort,
    );
  }, [allRows, ageFilter, sexFilter, columnFilters, sort]);

  const conceptsInResults = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of filteredRows) {
      counts.set(row.concept, (counts.get(row.concept) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "it"))
      .map(([concept, count]) => ({ concept, count }));
  }, [filteredRows]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / searchPageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => filteredRows.slice(safePage * searchPageSize, (safePage + 1) * searchPageSize),
    [filteredRows, safePage],
  );

  const resetView = () => {
    setPage(0);
    setExpandedKey("");
  };

  const setColumnFilter = (key: keyof typeof columnFilters, value: string) => {
    setColumnFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
    setExpandedKey("");
  };

  const expandedRow = useMemo(
    () => pageRows.find((row) => row.key === expandedKey) ?? null,
    [pageRows, expandedKey],
  );
  const expandedContext = useMemo(() => {
    if (!expandedRow || !caches) return null;
    const text = caches.texts.get(expandedRow.fileId);
    if (!text) return null;
    return kwicContext(text, expandedRow.start, expandedRow.end);
  }, [expandedRow, caches]);

  const panelLoading = entriesLoading || cachesLoading;

  return (
    <section className={`cq-page cq-analysis${panelLoading ? " is-loading" : ""}`} aria-labelledby="cq2-title">
      <button type="button" className="cq-back" onClick={onBack}>‹ {t.cq.backToCards}</button>

      <header className="cq-analysis-hero">
        <p className="section-kicker">{t.cq.kicker}</p>
        <h2 id="cq2-title">{t.cq2.panelTitle}</h2>
        <p className="cq2-hint">{t.cq2.expandHint}</p>
      </header>

      <div className="cq2-phrase-card">
        <p className="cq2-phrase">
          {t.cq2.phraseBefore}
          {" "}
          <select
            value={selectedEntry?.label ?? ""}
            disabled={entriesLoading || entries.length === 0}
            onChange={(event) => {
              const entry = entries.find((candidate) => candidate.label === event.target.value);
              if (entry) setSelectedEntry(entry);
              resetView();
            }}
          >
            {entries.map((entry) => (
              <option key={entry.entry} value={entry.label}>{entry.label}</option>
            ))}
          </select>
          {" "}
          {t.cq2.phraseMiddle}
          {" "}
          <select
            className="cq2-polarity-select"
            value={selectedPolarity}
            onChange={(event) => {
              setSelectedPolarity(event.target.value as CqPolarity);
              resetView();
            }}
          >
            {polarityOrder.map((polarity) => (
              <option key={polarity} value={polarity}>{polarityNames[polarity](t)}</option>
            ))}
          </select>
          {" "}
          {t.cq2.phraseAfter}
        </p>
      </div>

      <div className="cq-analysis-controls">
        <label className="cq-control">
          <span>{t.cq2.filterAge}</span>
          <select value={ageFilter} onChange={(event) => { setAgeFilter(event.target.value); resetView(); }}>
            <option value="">{t.cq2.filterAllAges}</option>
            {availableAges.map((age) => (
              <option key={age} value={age}>{age}</option>
            ))}
          </select>
        </label>
        <label className="cq-control">
          <span>{t.cq2.filterGender}</span>
          <select value={sexFilter} onChange={(event) => { setSexFilter(event.target.value); resetView(); }}>
            <option value="">{t.cq2.filterAllGenders}</option>
            <option value="F">F</option>
            <option value="M">M</option>
          </select>
        </label>
        <label className="cq-control">
          <span>{t.cq2.sortLabel}</span>
          <select value={sort} onChange={(event) => { setSort(event.target.value as SortMode); resetView(); }}>
            <option value="ageAsc">{t.cq2.sortAgeAsc}</option>
            <option value="ageDesc">{t.cq2.sortAgeDesc}</option>
            <option value="idAZ">{t.cq2.sortIdAZ}</option>
          </select>
        </label>
      </div>

      {entriesLoading && <p className="cq-status">{t.cq2.loading}</p>}
      {entriesError && <p className="cq-status cq-status-error">{t.cq2.errorPrefix}{entriesError}</p>}
      {cachesLoading && <p className="cq-status">{t.cq2.loading}</p>}
      {cachesError && <p className="cq-status cq-status-error">{t.cq2.errorPrefix}{cachesError}</p>}

      {selectedEntry && !cachesLoading && !cachesError && (
        <div className="cq-analysis-layout">
          <div className="cq-analysis-main">
            <article className="cq-passages cq2-passages">
              <header className="cq-passages-heading">
                <h3>{t.cq2.passagesTitle} ({filteredRows.length.toLocaleString(numberLocale)})</h3>
                {filteredRows.length > 0 && (
                  <button
                    type="button"
                    className="cq-show-toggle"
                    onClick={() => downloadCsv(
                      `cq2-passages-${selectedEntry.label}.csv`,
                      [t.cq2.passageId, t.cq2.passageText, t.cq2.passageConcept, t.cq2.passagePolarity, t.cq2.passageAge, t.cq2.passageSex],
                      filteredRows.map((row) => [
                        row.id,
                        row.value,
                        row.concept,
                        polarityNames[selectedPolarity](t),
                        row.age,
                        row.sex,
                      ]),
                    )}
                  >
                    {t.cq2.exportCsv}
                  </button>
                )}
              </header>

              {filteredRows.length === 0 ? (
                <div className="cq2-empty">
                  <p className="cq-panel-empty">{t.cq2.emptyResults}</p>
                  <p className="cq2-empty-hint">{t.cq2.emptyHint}</p>
                </div>
              ) : (
                <>
                  <table className="cq-passages-table cq2-table">
                    <thead>
                      <tr>
                        <th>{t.cq2.passageId}<input
                          type="search" className="cq2-th-filter" value={columnFilters.id}
                          onChange={(event) => setColumnFilter("id", event.target.value)}
                          aria-label={t.cq2.passageId} autoComplete="off" spellCheck={false}
                        /></th>
                        <th>{t.cq2.passageText}<input
                          type="search" className="cq2-th-filter" value={columnFilters.value}
                          onChange={(event) => setColumnFilter("value", event.target.value)}
                          aria-label={t.cq2.passageText} autoComplete="off" spellCheck={false}
                        /></th>
                        <th>{t.cq2.passageConcept}<input
                          type="search" className="cq2-th-filter" value={columnFilters.concept}
                          onChange={(event) => setColumnFilter("concept", event.target.value)}
                          aria-label={t.cq2.passageConcept} autoComplete="off" spellCheck={false}
                        /></th>
                        <th>{t.cq2.passagePolarity}</th>
                        <th>{t.cq2.passageAge}<input
                          type="search" className="cq2-th-filter" value={columnFilters.age}
                          onChange={(event) => setColumnFilter("age", event.target.value)}
                          aria-label={t.cq2.passageAge} autoComplete="off" spellCheck={false}
                        /></th>
                        <th>{t.cq2.passageSex}<input
                          type="search" className="cq2-th-filter" value={columnFilters.sex}
                          onChange={(event) => setColumnFilter("sex", event.target.value)}
                          aria-label={t.cq2.passageSex} autoComplete="off" spellCheck={false}
                        /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row) => (
                        <Fragment key={row.key}>
                          <tr
                            className={row.key === expandedKey ? "expanded" : ""}
                            onClick={() => setExpandedKey((current) => (current === row.key ? "" : row.key))}
                          >
                            <td>{row.id}</td>
                            <td>{row.value}</td>
                            <td>{row.concept}</td>
                            <td>{polarityNames[selectedPolarity](t)}</td>
                            <td>{row.age || "—"}</td>
                            <td>{row.sex || "—"}</td>
                          </tr>
                          {row.key === expandedKey && (
                            <tr className="cq2-context-row">
                              <td colSpan={6}>
                                <p className="cq2-context-label">{t.cq2.expandedContext}</p>
                                {expandedContext ? (
                                  <p className="cq2-context-text">
                                    {expandedContext[0]}<strong>{row.value}</strong>{expandedContext[1]}
                                  </p>
                                ) : (
                                  <p className="cq2-context-text"><strong>{row.value}</strong></p>
                                )}
                                <p className="cq2-speaker">
                                  {t.cq2.expandedSpeakerSex}: <strong>{row.sex || "—"}</strong>
                                  {" · "}
                                  {t.cq2.expandedSpeakerAge}: <strong>{row.age || "—"}</strong>
                                  {" · "}
                                  {t.cq2.expandedSpeakerResidence}: <strong>{row.residence || "—"}</strong>
                                </p>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                  <div className="cq2-pager">
                    <button
                      type="button"
                      disabled={safePage === 0}
                      aria-label={t.cq2.prevPage}
                      onClick={() => { setPage(safePage - 1); setExpandedKey(""); }}
                    >
                      ‹
                    </button>
                    <span>
                      {t.cq2.passagesRange(
                        safePage * searchPageSize + 1,
                        Math.min((safePage + 1) * searchPageSize, filteredRows.length),
                        filteredRows.length,
                      )}
                    </span>
                    <button
                      type="button"
                      disabled={safePage >= pageCount - 1}
                      aria-label={t.cq2.nextPage}
                      onClick={() => { setPage(safePage + 1); setExpandedKey(""); }}
                    >
                      ›
                    </button>
                  </div>
                </>
              )}
            </article>
          </div>

          <aside className="cq-analysis-side">
            <article className="cq2-config">
              <h3>{t.cq2.configTitle}</h3>
              <dl className="cq-detail-list">
                <div>
                  <dt>{t.cq2.configEntry}</dt>
                  <dd>{selectedEntry.label}</dd>
                </div>
                <div>
                  <dt>{t.cq2.configPolarity}</dt>
                  <dd>{polarityNames[selectedPolarity](t)}</dd>
                </div>
                <div>
                  <dt>{t.cq2.configResults}</dt>
                  <dd>{filteredRows.length.toLocaleString(numberLocale)}</dd>
                </div>
                <div>
                  <dt>{t.cq2.configAge}</dt>
                  <dd>{ageFilter || t.cq2.configAll}</dd>
                </div>
                <div>
                  <dt>{t.cq2.configGender}</dt>
                  <dd>{sexFilter || t.cq2.configAll}</dd>
                </div>
              </dl>
            </article>

            <article className="cq2-concepts">
              <h3>{t.cq2.conceptsTitle(polarityNames[selectedPolarity](t))}</h3>
              {conceptsInResults.length === 0 ? (
                <p className="cq-panel-empty">{t.cq2.emptyResults}</p>
              ) : (
                <ul className="cq2-concept-list">
                  {conceptsInResults.map((concept) => (
                    <li key={concept.concept}>
                      <span className="cq-concept-name">{concept.concept}</span>
                      <span className="cq-concept-counts">{t.cq2.conceptsCount(concept.count)}</span>
                      <span className={`cq-concept-bar cq-bar-${selectedPolarity}`} aria-hidden="true">
                        <span style={{
                          width: `${Math.max(4, Math.round((concept.count / conceptsInResults[0].count) * 100))}%`,
                        }} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </aside>
        </div>
      )}
    </section>
  );
}
