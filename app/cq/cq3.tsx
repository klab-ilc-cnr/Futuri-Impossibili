"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { dictionaries, type Lang } from "../strings";
import {
  type AgeBand,
  type CqEntry,
  type CqInterview,
  type CqPolarity,
  ageBandLabel,
  ageBandOf,
  ageBands,
  attestationsCorpusEndpoint,
  conceptsEndpoint,
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
  polarityProperty,
  readErrorDetail,
  readResourceIdentifier,
  referringConceptProperty,
  rdfsCommentProperty,
  textsEndpoint,
} from "./shared";

interface Cq3Concept {
  concept: string;
  label: string;
  polarity: CqPolarity | "";
}

interface GroupKey {
  band: AgeBand;
  sex: "F" | "M";
}

interface PassageRow {
  key: string;
  fileId: string;
  id: string;
  value: string;
  start: number;
  end: number;
  age: string;
  band: AgeBand | "";
  sex: string;
  residence: string;
}

interface CqCaches {
  corpus: Map<string, Record<string, unknown>[]>;
  interviews: CqInterview[];
  concepts: Map<string, string>;
  texts: Map<string, string>;
}

const groupOrder: Array<GroupKey> = [
  { band: "12-16", sex: "F" },
  { band: "12-16", sex: "M" },
  { band: "17-21", sex: "F" },
  { band: "17-21", sex: "M" },
  { band: "gt21", sex: "F" },
  { band: "gt21", sex: "M" },
];

const pageSize = 20;

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function sexLabel(sex: "F" | "M", lang: Lang): string {
  return dictionaries[lang].cq3[sex === "F" ? "female" : "male"];
}

function downloadCsvFile(filename: string, header: string[], rows: string[][]) {
  const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [header.map(escapeCell).join(";"), ...rows.map((row) => row.map(escapeCell).join(";"))];
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

interface ViewProps {
  concepts: Cq3Concept[];
  groups: GroupKey[];
  intervieweesPerGroup: Map<string, Map<string, number>>;
  groupPopulation: Map<string, number>;
  lang: Lang;
}

function countAndPct(counts: Map<string, number> | undefined, population: number, key: string): { n: number; pct: number } {
  const n = counts?.get(key) ?? 0;
  return { n, pct: pct(n, population) };
}

function BarsView({ concepts, groups, intervieweesPerGroup, groupPopulation, lang, onGroupClick }: ViewProps & { onGroupClick: (group: GroupKey) => void }) {
  const t = dictionaries[lang];
  const numberLocale = lang === "en" ? "en-US" : "it-IT";
  return (
    <article className="cq3-block">
      <h3>{t.cq3.chartTitle}</h3>
      {concepts.length === 0 && <p className="cq-panel-empty">{t.cq3.chartEmpty}</p>}
      {concepts.map((concept) => {
        const counts = intervieweesPerGroup.get(concept.concept);
        const percents = groups.map((group) =>
          countAndPct(counts, groupPopulation.get(`${group.band}-${group.sex}`) ?? 0, `${group.band}-${group.sex}`));
        const maxPct = Math.max(10, ...percents.map((value) => value.pct));
        return (
          <div key={concept.concept} className="cq3-chart-block">
            <h4 className="cq3-concept-heading">
              {concept.label}
              {concept.polarity && (
                <span className={`cq-polarity-tag cq-polarity-${concept.polarity}`}>{polarityNames[concept.polarity](t)}</span>
              )}
            </h4>
            <div className="cq3-bars">
              {groups.map((group, index) => (
                <button
                  key={`${group.band}-${group.sex}`}
                  type="button"
                  className="cq3-bar-row"
                  onClick={() => onGroupClick(group)}
                >
                  <span className="cq3-bar-label">{ageBandLabel(group.band, lang)} · {sexLabel(group.sex, lang)}</span>
                  <span className="cq3-bar-track">
                    <span
                      className={`cq3-bar-fill ${group.sex === "F" ? "female" : "male"}`}
                      style={{ width: `${Math.round((percents[index].pct / maxPct) * 100)}%` }}
                    />
                  </span>
                  <span className="cq3-bar-value">
                    {t.cq3.percentage(percents[index].pct)}
                    <em>{percents[index].n.toLocaleString(numberLocale)}/{(groupPopulation.get(`${group.band}-${group.sex}`) ?? 0).toLocaleString(numberLocale)}</em>
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </article>
  );
}

function HeatmapView({ concepts, groups, intervieweesPerGroup, groupPopulation, lang, onCellClick }: ViewProps & { onCellClick: (group: GroupKey) => void }) {
  const t = dictionaries[lang];
  const numberLocale = lang === "en" ? "en-US" : "it-IT";
  return (
    <article className="cq3-block">
      <h3>{t.cq3.heatmapTitle}</h3>
      <p className="cq3-hint">{t.cq3.heatmapHint}</p>
      <div className="cq3-scroll">
        <table className="cq3-heatmap">
          <thead>
            <tr>
              <th />
              {groups.map((group) => (
                <th key={`${group.band}-${group.sex}`}>
                  {ageBandLabel(group.band, lang)}
                  <span className={`cq3-sex-tag ${group.sex === "F" ? "female" : "male"}`}>{group.sex}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {concepts.map((concept) => {
              const counts = intervieweesPerGroup.get(concept.concept);
              return (
                <tr key={concept.concept}>
                  <th className="cq3-heatmap-label">{concept.label}</th>
                  {groups.map((group) => {
                    const key = `${group.band}-${group.sex}`;
                    const { n, pct: value } = countAndPct(counts, groupPopulation.get(key) ?? 0, key);
                    const intensity = Math.min(1, value / 60);
                    return (
                      <td key={key}>
                        <button
                          type="button"
                          className={`cq3-heat-cell ${group.sex === "F" ? "female" : "male"}`}
                          style={{ opacity: 0.3 + intensity * 0.7 }}
                          onClick={() => onCellClick(group)}
                        >
                          {t.cq3.percentage(value)}
                          <span>{n.toLocaleString(numberLocale)}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function TableView({ concepts, groups, intervieweesPerGroup, groupPopulation, lang }: ViewProps) {
  const t = dictionaries[lang];
  const numberLocale = lang === "en" ? "en-US" : "it-IT";
  const activeSexes = [...new Set(groups.map((group) => group.sex))];
  const activeBands = ageBands.filter((band) => groups.some((group) => group.band === band));
  return (
    <article className="cq3-block">
      <h3>{t.cq3.tableTitle}</h3>
      <div className="cq3-scroll">
        <table className="cq3-data">
          <thead>
            <tr>
              <th rowSpan={2}>{t.cq3.tableBand}</th>
              {activeSexes.map((sex) => (
                <th key={sex} colSpan={2}>{sexLabel(sex, lang)}</th>
              ))}
              {activeSexes.length > 1 && <th colSpan={2}>{t.cq3.tableTotal}</th>}
            </tr>
            <tr>
              {activeSexes.map((sex) => (
                <Fragment key={sex}>
                  <th>N</th><th>%</th>
                </Fragment>
              ))}
              {activeSexes.length > 1 && (
                <Fragment>
                  <th>N</th><th>%</th>
                </Fragment>
              )}
            </tr>
          </thead>
          <tbody>
            {concepts.flatMap((concept) => {
              const counts = intervieweesPerGroup.get(concept.concept);
              return activeBands.map((band) => {
                const cells = activeSexes.map((sex) =>
                  countAndPct(counts, groupPopulation.get(`${band}-${sex}`) ?? 0, `${band}-${sex}`));
                const totalN = cells.reduce((sum, cell) => sum + cell.n, 0);
                const totalPop = activeSexes.reduce((sum, sex) => sum + (groupPopulation.get(`${band}-${sex}`) ?? 0), 0);
                return (
                  <tr key={`${concept.concept}-${band}`}>
                    {activeBands.indexOf(band) === 0 && (
                      <th rowSpan={activeBands.length} className="cq3-data-label">{concept.label}</th>
                    )}
                    {cells.map((cell, index) => (
                      <Fragment key={activeSexes[index]}>
                        <td>{cell.n.toLocaleString(numberLocale)}</td>
                        <td>{t.cq3.percentage(cell.pct)}</td>
                      </Fragment>
                    ))}
                    {activeSexes.length > 1 && (
                      <Fragment>
                        <td>{totalN.toLocaleString(numberLocale)}</td>
                        <td>{t.cq3.percentage(pct(totalN, totalPop))}</td>
                      </Fragment>
                    )}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function DrillDownTable({
  rows, page, pageCount, setPage, expandedKey, setExpandedKey, texts, lang,
}: {
  rows: PassageRow[];
  page: number;
  pageCount: number;
  setPage: (page: number) => void;
  expandedKey: string;
  setExpandedKey: (updater: (current: string) => string) => void;
  texts: Map<string, string>;
  lang: Lang;
}) {
  const t = dictionaries[lang];
  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);
  if (rows.length === 0) return <p className="cq-panel-empty">{t.cq3.passagesEmpty}</p>;
  return (
    <>
      <table className="cq-passages-table cq2-table cq3-table">
        <thead>
          <tr>
            <th>{t.cq2.passageId}</th>
            <th>{t.cq2.passageText}</th>
            <th>{t.cq2.passageAge}</th>
            <th>{t.cq2.passageSex}</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row) => {
            const text = texts.get(row.fileId);
            const context = text ? kwicContext(text, row.start, row.end) : null;
            return (
              <Fragment key={row.key}>
                <tr
                  className={row.key === expandedKey ? "expanded" : ""}
                  onClick={() => setExpandedKey((current) => (current === row.key ? "" : row.key))}
                >
                  <td>{row.id}</td>
                  <td>{row.value}</td>
                  <td>{row.age || "—"}</td>
                  <td>{row.sex || "—"}</td>
                </tr>
                {row.key === expandedKey && (
                  <tr className="cq2-context-row">
                    <td colSpan={4} className="cq2-context-cell">
                      <p className="cq2-context-label">{t.cq2.expandedContext}</p>
                      {context ? (
                        <p className="cq2-context-text">
                          {context[0]}<strong>{row.value}</strong>{context[1]}
                        </p>
                      ) : (
                        <p className="cq2-context-text"><strong>{row.value}</strong></p>
                      )}
                      <p className="cq2-speaker">
                        {t.cq2.expandedSpeakerAge}: <strong>{row.age || "—"}</strong>
                        {" · "}
                        {t.cq2.expandedSpeakerSex}: <strong>{row.sex || "—"}</strong>
                        {" · "}
                        {t.cq2.expandedSpeakerResidence}: <strong>{row.residence || "—"}</strong>
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="cq2-pager">
        <button type="button" disabled={page === 0} aria-label={t.cq2.prevPage} onClick={() => setPage(page - 1)}>‹</button>
        <span>{t.cq2.passagesRange(page * pageSize + 1, Math.min((page + 1) * pageSize, rows.length), rows.length)}</span>
        <button type="button" disabled={page >= pageCount - 1} aria-label={t.cq2.nextPage} onClick={() => setPage(page + 1)}>›</button>
      </div>
    </>
  );
}

type SortMode = "pctDesc" | "az";
type ViewMode = "bars" | "heatmap" | "table";

export function Cq3Panel({ lang, onBack }: { lang: Lang; onBack: () => void }) {
  const t = dictionaries[lang];
  const numberLocale = lang === "en" ? "en-US" : "it-IT";

  const [entries, setEntries] = useState<CqEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entriesError, setEntriesError] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<CqEntry | null>(null);

  const [caches, setCaches] = useState<CqCaches | null>(null);
  const [cachesLoading, setCachesLoading] = useState(true);
  const [cachesError, setCachesError] = useState("");

  const [selectedConcepts, setSelectedConcepts] = useState<string[]>([]);
  const [conceptQuery, setConceptQuery] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const [comboIndex, setComboIndex] = useState(0);
  const comboRef = useRef<HTMLDivElement | null>(null);
  const [bandFilter, setBandFilter] = useState<AgeBand | "">("");
  const [sexFilter, setSexFilter] = useState<"" | "F" | "M">("");
  const [view, setView] = useState<ViewMode>("bars");
  const [sort, setSort] = useState<SortMode>("pctDesc");
  const [drillDown, setDrillDown] = useState<GroupKey | null>(null);
  const [expandedKey, setExpandedKey] = useState("");
  const [page, setPage] = useState(0);

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
        if (!cancelled) setEntriesError(error instanceof Error ? error.message : t.cq3.loading);
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
        if (!cancelled) setCachesError(error instanceof Error ? error.message : t.cq3.loading);
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

  const conceptList = useMemo(() => {
    if (!selectedEntry || !caches) return [] as Cq3Concept[];
    const label = selectedEntry.label.toLocaleLowerCase("it");
    const senseSet = new Set(selectedEntry.senses);
    const byConcept = new Map<string, Cq3Concept>();
    for (const items of caches.corpus.values()) {
      for (const rawItem of items) {
        if (!rawItem || typeof rawItem !== "object") continue;
        const item = rawItem as Record<string, unknown>;
        const observable = readResourceIdentifier(item.observable);
        const referringConcept = metadataPropertyValues(item.metadata, referringConceptProperty)[0] ?? "";
        const polarity = polarityFromValues([
          ...metadataPropertyValues(item.metadata, polarityProperty),
          ...metadataPropertyValues(item.metadata, legacyPolarityProperty),
        ]);
        let conceptIri = "";
        if (metadataPropertyValues(item.metadata, rdfsCommentProperty).some((comment) => comment.toLocaleLowerCase("it") === label)
          || metadataPropertyValues(item.metadata, lexicalEntryProperty).includes(selectedEntry.entry)) {
          conceptIri = observable;
        } else if (senseSet.has(observable) && referringConcept) {
          conceptIri = referringConcept;
        }
        if (!conceptIri) continue;
        const existing = byConcept.get(conceptIri);
        byConcept.set(conceptIri, {
          concept: conceptIri,
          label: caches.concepts.get(conceptIri) ?? conceptIri,
          polarity: existing?.polarity ?? polarity,
        });
      }
    }
    return [...byConcept.values()];
  }, [selectedEntry, caches]);

  const groupPopulation = useMemo(() => {
    const population = new Map<string, number>();
    if (caches) {
      for (const interview of caches.interviews) {
        const demographics = parseDemographics(interview.description);
        const band = ageBandOf(demographics.age);
        const sex = normalizeSex(demographics.sex);
        if (!band || (sex !== "F" && sex !== "M")) continue;
        const key = `${band}-${sex}`;
        population.set(key, (population.get(key) ?? 0) + 1);
      }
    }
    return population;
  }, [caches]);

  const conceptPassages = useMemo(() => {
    const map = new Map<string, PassageRow[]>();
    if (!selectedEntry || !caches) return map;
    const label = selectedEntry.label.toLocaleLowerCase("it");
    const senseSet = new Set(selectedEntry.senses);
    for (const [fileId, items] of caches.corpus) {
      const interview = interviewById.get(fileId);
      const demographics = parseDemographics(interview?.description ?? "");
      const band = ageBandOf(demographics.age);
      const sex = normalizeSex(demographics.sex);
      for (const rawItem of items) {
        if (!rawItem || typeof rawItem !== "object") continue;
        const item = rawItem as Record<string, unknown>;
        const value = typeof item.value === "string" ? item.value : "";
        const start = Number(item.start);
        const end = Number(item.end);
        if (!value || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) continue;
        const observable = readResourceIdentifier(item.observable);
        const referringConcept = metadataPropertyValues(item.metadata, referringConceptProperty)[0] ?? "";
        let conceptIri = "";
        if (metadataPropertyValues(item.metadata, rdfsCommentProperty).some((comment) => comment.toLocaleLowerCase("it") === label)
          || metadataPropertyValues(item.metadata, lexicalEntryProperty).includes(selectedEntry.entry)) {
          conceptIri = observable;
        } else if (senseSet.has(observable) && referringConcept) {
          conceptIri = referringConcept;
        }
        if (!conceptIri) continue;
        const rows = map.get(conceptIri) ?? [];
        rows.push({
          key: readResourceIdentifier(item.attestation) || `${fileId}-${start}`,
          fileId,
          id: interview?.metadataId || interview?.name || fileId,
          value,
          start,
          end,
          age: demographics.age,
          band,
          sex,
          residence: demographics.residence,
        });
        map.set(conceptIri, rows);
      }
    }
    return map;
  }, [selectedEntry, caches, interviewById]);

  const intervieweesPerGroup = useMemo(() => {
    const result = new Map<string, Map<string, number>>();
    for (const concept of conceptList) {
      const perGroup = new Map<string, Set<string>>();
      for (const group of groupOrder) perGroup.set(`${group.band}-${group.sex}`, new Set());
      for (const passage of conceptPassages.get(concept.concept) ?? []) {
        if (!passage.band || (passage.sex !== "F" && passage.sex !== "M")) continue;
        perGroup.get(`${passage.band}-${passage.sex}`)?.add(passage.id);
      }
      const counts = new Map<string, number>();
      for (const [key, ids] of perGroup) counts.set(key, ids.size);
      result.set(concept.concept, counts);
    }
    return result;
  }, [conceptList, conceptPassages]);

  const activeGroups = useMemo(() => groupOrder.filter((group) =>
    (!bandFilter || group.band === bandFilter) && (!sexFilter || group.sex === sexFilter)), [bandFilter, sexFilter]);

  const visibleConcepts = useMemo(() => {
    const list = selectedConcepts.length > 0
      ? conceptList.filter((concept) => selectedConcepts.includes(concept.concept))
      : [...conceptList];
    if (sort === "pctDesc") {
      const totalShare = (concept: Cq3Concept) => {
        const counts = intervieweesPerGroup.get(concept.concept);
        if (!counts) return 0;
        let sum = 0;
        for (const group of activeGroups) {
          const key = `${group.band}-${group.sex}`;
          const population = groupPopulation.get(key) ?? 0;
          if (population > 0) sum += (counts.get(key) ?? 0) / population;
        }
        return sum;
      };
      list.sort((a, b) => totalShare(b) - totalShare(a) || a.label.localeCompare(b.label, "it"));
    } else {
      list.sort((a, b) => a.label.localeCompare(b.label, "it"));
    }
    return list;
  }, [selectedConcepts, conceptList, intervieweesPerGroup, groupPopulation, sort, activeGroups]);

  const drillDownRows = useMemo(() => {
    if (!drillDown) return [];
    const rows: PassageRow[] = [];
    const concepts = selectedConcepts.length > 0
      ? conceptList.filter((candidate) => selectedConcepts.includes(candidate.concept))
      : conceptList;
    for (const concept of concepts) {
      for (const passage of conceptPassages.get(concept.concept) ?? []) {
        if (passage.band === drillDown.band && passage.sex === drillDown.sex) rows.push(passage);
      }
    }
    return rows;
  }, [drillDown, selectedConcepts, conceptList, conceptPassages]);

  const drillDownConceptLabel = selectedConcepts.length === 1
    ? conceptList.find((concept) => concept.concept === selectedConcepts[0])?.label ?? ""
    : "";

  const availableToAdd = availableConceptsForChips(conceptList, selectedConcepts, conceptQuery);

  useEffect(() => {
    if (!comboOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (comboRef.current && !comboRef.current.contains(event.target as Node)) setComboOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [comboOpen]);

  const addConceptToSelection = (conceptIri: string) => {
    setSelectedConcepts((current) => [...current, conceptIri]);
    setConceptQuery("");
    setComboOpen(false);
    setComboIndex(0);
    setDrillDown(null);
    setPage(0);
  };

  return (
    <section className={`cq-page cq-analysis${entriesLoading || cachesLoading ? " is-loading" : ""}`} aria-labelledby="cq3-title">
      <button type="button" className="cq-back" onClick={onBack}>‹ {t.cq.backToCards}</button>

      <header className="cq-analysis-hero">
        <p className="section-kicker">{t.cq.kicker}</p>
        <h2 id="cq3-title">{t.cq3.panelTitle}</h2>
        {selectedEntry && <p>{t.cq3.subtitle(selectedEntry.label)}</p>}
      </header>

      {entriesError && <p className="cq-status cq-status-error">{t.cq3.errorPrefix}{entriesError}</p>}
      {cachesError && <p className="cq-status cq-status-error">{t.cq3.errorPrefix}{cachesError}</p>}

      <div className="cq-analysis-layout cq-config-left">
          <aside className="cq-analysis-side">
            <article className="cq-detail cq3-config">
              <h3>{t.cq2.configTitle}</h3>

              <label className="cq3-config-label">{t.cq3.entrySelectLabel}</label>
              <select
                className="cq3-config-select"
                value={selectedEntry?.label ?? ""}
                onChange={(event) => {
                  const entry = entries.find((candidate) => candidate.label === event.target.value);
                  if (entry) {
                    setSelectedEntry(entry);
                    setSelectedConcepts([]);
                    setDrillDown(null);
                    setPage(0);
                  }
                }}
              >
                {entries.map((entry) => (
                  <option key={entry.entry} value={entry.label}>{entry.label}</option>
                ))}
              </select>

              <label className="cq3-config-label">{t.cq3.conceptSelectLabel}</label>
              <div className="cq3-combo" ref={comboRef}>
                <input
                  type="search"
                  className="cq3-combo-input"
                  placeholder={t.cq3.addConcept}
                  value={conceptQuery}
                  onFocus={() => setComboOpen(true)}
                  onChange={(event) => { setConceptQuery(event.target.value); setComboOpen(true); setComboIndex(0); }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setComboOpen(true);
                      setComboIndex((current) => Math.min(current + 1, availableToAdd.length - 1));
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setComboIndex((current) => Math.max(current - 1, 0));
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      if (availableToAdd[comboIndex]) addConceptToSelection(availableToAdd[comboIndex].concept);
                    } else if (event.key === "Escape") {
                      setComboOpen(false);
                    }
                  }}
                  aria-label={t.cq3.conceptSelectLabel}
                  autoComplete="off"
                  spellCheck={false}
                />
                {comboOpen && (
                  <div className="cq3-combo-list" role="listbox">
                    {availableToAdd.length === 0 ? (
                      <p className="cq3-combo-empty">{t.cq3.noConceptMatch}</p>
                    ) : (
                      availableToAdd.map((concept, index) => (
                        <button
                          key={concept.concept}
                          type="button"
                          role="option"
                          aria-selected={index === comboIndex}
                          className={`cq3-combo-option${index === comboIndex ? " active" : ""}`}
                          onMouseDown={() => addConceptToSelection(concept.concept)}
                        >
                          {concept.label}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {selectedConcepts.length > 0 && (
                <div className="cq3-chips">
                  {selectedConcepts.map((conceptIri) => {
                    const concept = conceptList.find((candidate) => candidate.concept === conceptIri);
                    return (
                      <span key={conceptIri} className="cq3-chip">
                        {concept?.label ?? conceptIri}
                        <button
                          type="button"
                          aria-label={`${t.cq3.removeConcept} ${concept?.label ?? ""}`}
                          onClick={() => setSelectedConcepts((current) => current.filter((iri) => iri !== conceptIri))}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <label className="cq3-config-label">{t.cq3.filterAge}</label>
              <select
                className="cq3-config-select"
                value={bandFilter}
                onChange={(event) => { setBandFilter(event.target.value as AgeBand | ""); setDrillDown(null); setPage(0); }}
              >
                <option value="">{t.cq3.allAgeGroups}</option>
                {ageBands.map((band) => (
                  <option key={band} value={band}>{ageBandLabel(band, lang)}</option>
                ))}
              </select>

              <label className="cq3-config-label">{t.cq3.filterGender}</label>
              <select
                className="cq3-config-select"
                value={sexFilter}
                onChange={(event) => { setSexFilter(event.target.value as "" | "F" | "M"); setDrillDown(null); setPage(0); }}
              >
                <option value="">{t.cq3.allGenders}</option>
                <option value="F">F</option>
                <option value="M">M</option>
              </select>

              <label className="cq3-config-label">{t.cq3.viewLabel}</label>
              <div className="cq3-config-radios">
                {(["bars", "heatmap", "table"] as ViewMode[]).map((mode) => (
                  <label key={mode} className="cq3-radio">
                    <input
                      type="radio"
                      name="cq3-view"
                      checked={view === mode}
                      onChange={() => { setView(mode); setDrillDown(null); setPage(0); }}
                    />
                    <span>
                      {mode === "bars" ? t.cq3.viewBars : mode === "heatmap" ? t.cq3.viewHeatmap : t.cq3.viewTable}
                    </span>
                  </label>
                ))}
              </div>

              <label className="cq3-config-label">{t.cq3.sortLabel}</label>
              <select
                className="cq3-config-select"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
              >
                <option value="pctDesc">{t.cq3.sortPctDesc}</option>
                <option value="az">{t.cq3.sortAZ}</option>
              </select>

              <p className="cq-detail-note">{t.cq3.heatmapHint}</p>
            </article>
          </aside>

          <div className="cq-analysis-main">
            {(!selectedEntry || cachesLoading || cachesError) ? (
              <article className="cq3-block">
                <p className="cq-status">{cachesError ? `${t.cq3.errorPrefix}${cachesError}` : t.cq3.loading}</p>
              </article>
            ) : drillDown ? (
              <article className="cq-passages cq3-block">
                <header className="cq-passages-heading">
                  <button type="button" className="cq-show-toggle" onClick={() => { setDrillDown(null); setPage(0); setExpandedKey(""); }}>
                    {t.cq3.backToOverview}
                  </button>
                  <h3>
                    {t.cq3.passagesTitle} — {ageBandLabel(drillDown.band, lang)} · {sexLabel(drillDown.sex, lang)}
                    {drillDownConceptLabel ? ` — ${drillDownConceptLabel}` : ""}
                    {` (${drillDownRows.length.toLocaleString(numberLocale)})`}
                  </h3>
                  {drillDownRows.length > 0 && (
                    <button
                      type="button"
                      className="cq-show-toggle"
                      onClick={() => downloadCsvFile(
                        `cq3-${selectedEntry.label}-${drillDown.band}-${drillDown.sex}.csv`,
                        [t.cq2.passageId, t.cq2.passageText, t.cq2.passageAge, t.cq2.passageSex, t.cq2.expandedSpeakerResidence],
                        drillDownRows.map((row) => [row.id, row.value, row.age, row.sex, row.residence]),
                      )}
                    >
                      {t.cq2.exportCsv}
                    </button>
                  )}
                </header>
                <DrillDownTable
                  rows={drillDownRows}
                  page={page}
                  pageCount={Math.max(1, Math.ceil(drillDownRows.length / pageSize))}
                  setPage={setPage}
                  expandedKey={expandedKey}
                  setExpandedKey={setExpandedKey}
                  texts={caches?.texts ?? new Map()}
                  lang={lang}
                />
              </article>
            ) : (
              <>
                {view === "bars" && (
                  <BarsView
                    concepts={visibleConcepts}
                    groups={activeGroups}
                    intervieweesPerGroup={intervieweesPerGroup}
                    groupPopulation={groupPopulation}
                    lang={lang}
                    onGroupClick={(group) => { setDrillDown(group); setPage(0); setExpandedKey(""); }}
                  />
                )}
                {view === "heatmap" && (
                  <HeatmapView
                    concepts={visibleConcepts}
                    groups={activeGroups}
                    intervieweesPerGroup={intervieweesPerGroup}
                    groupPopulation={groupPopulation}
                    lang={lang}
                    onCellClick={(group) => { setDrillDown(group); setPage(0); setExpandedKey(""); }}
                  />
                )}
                {view === "table" && (
                  <TableView
                    concepts={visibleConcepts}
                    groups={activeGroups}
                    intervieweesPerGroup={intervieweesPerGroup}
                    groupPopulation={groupPopulation}
                    lang={lang}
                  />
                )}
              </>
            )}

            <p className="cq3-note">{t.cq3.denominatorNote}</p>
          </div>
        </div>
    </section>
  );
}

function availableConceptsForChips(conceptList: Cq3Concept[], selectedConcepts: string[], query: string): Cq3Concept[] {
  const prefix = query.toLocaleLowerCase("it");
  return conceptList
    .filter((concept) => !selectedConcepts.includes(concept.concept))
    .filter((concept) => !query || concept.label.toLocaleLowerCase("it").startsWith(prefix));
}
