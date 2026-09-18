import { useEffect, type RefObject } from "react";
import { dictionaries, type Lang } from "../strings";
import { basePath } from "../base-path";

export const cqEndpoint = `${basePath}/api/lexo/cq`;
export const lexicalEntriesEndpoint = `${basePath}/api/lexo/lexical-entries`;
export const textsEndpoint = `${basePath}/api/lexo/texts`;
export const attestationsCorpusEndpoint = `${basePath}/api/lexo/attestations/corpus`;
export const conceptsEndpoint = `${basePath}/api/lexo/lexical-concepts`;

export const referringConceptProperty = "https://lexo.ilc.cnr.it#referringConcept";
export const lexicalEntryProperty = "https://lexo.ilc.cnr.it#lexicalEntry";
export const rdfsCommentProperty = "http://www.w3.org/2000/01/rdf-schema#comment";
export const polarityProperty = "http://purl.org/marl/ns#hasPolarity";
export const legacyPolarityProperty = "http://www.gsi.dit.upm.es/ontologies/marl/ns#hasPolarity";

export type CqPolarity = "positive" | "neutral" | "negative";

export const polarityOrder: CqPolarity[] = ["positive", "neutral", "negative"];

export const polarityNames: Record<CqPolarity, (t: (typeof dictionaries)["it"]) => string> = {
  positive: (t) => t.cq1.polarityPositive,
  neutral: (t) => t.cq1.polarityNeutral,
  negative: (t) => t.cq1.polarityNegative,
};

export interface CqEntry {
  entry: string;
  label: string;
  senses: string[];
}

export interface CqInterview {
  id: string;
  name: string;
  metadataId: string;
  description: string;
}

export const searchContextChars = 50;
export const searchPageSize = 20;

export function polarityFromValues(values: string[]): CqPolarity | "" {
  for (const value of values) {
    const lower = value.toLowerCase();
    if (lower.includes("positive")) return "positive";
    if (lower.includes("neutral")) return "neutral";
    if (lower.includes("negative")) return "negative";
  }
  return "";
}

export function readResourceIdentifier(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.value === "string") return record.value.trim();
    if (typeof record["@id"] === "string") return record["@id"].trim();
  }
  return "";
}

export function metadataPropertyValues(metadata: unknown, property: string): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const record = metadata as Record<string, unknown>;
  const raw = record[property];
  if (!Array.isArray(raw)) return typeof raw === "string" ? [raw] : [];
  return raw.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (item && typeof item === "object" && typeof (item as Record<string, unknown>).value === "string") {
      return [(item as Record<string, unknown>).value as string];
    }
    return [];
  });
}

export function parseDemographics(description: string): { age: string; sex: string; residence: string } {
  const sexMatch = description.match(/(?:^|,)\s*Sesso\s*:\s*([^,]+)/i);
  const ageMatch = description.match(/(?:^|,)\s*Et[àa]\s*:\s*([0-9]+)\s*(?:,|$)/i);
  const residenceMatch = description.match(/(?:^|,)\s*Residenza\s*:\s*([^,]+)/i);
  return {
    sex: sexMatch ? sexMatch[1].trim() : "",
    age: ageMatch ? ageMatch[1] : "",
    residence: residenceMatch ? residenceMatch[1].trim() : "",
  };
}

export type AgeBand = "12-16" | "17-21" | "gt21";

export const ageBands: AgeBand[] = ["12-16", "17-21", "gt21"];

export function ageBandOf(age: string): AgeBand | "" {
  const value = Number(age);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value <= 16) return "12-16";
  if (value <= 21) return "17-21";
  return "gt21";
}

export function ageBandLabel(band: AgeBand, lang: Lang): string {
  const t = dictionaries[lang].cq3;
  return band === "12-16" ? t.band12 : band === "17-21" ? t.band17 : t.bandGt21;
}

export function normalizeSex(value: string): string {
  const trimmed = value.trim();
  if (/^m/i.test(trimmed)) return "M";
  if (/^f/i.test(trimmed)) return "F";
  return trimmed;
}

export async function readErrorDetail(response: Response): Promise<string> {
  const body = (await response.text()).trim();
  if (!body) return `HTTP ${response.status}`;
  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    return String(payload.detail ?? payload.error ?? payload.message ?? body);
  } catch {
    return body;
  }
}

export function parseLexicalEntries(payload: unknown): CqEntry[] {
  const container = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const nestedData = container.data && typeof container.data === "object" && !Array.isArray(container.data)
    ? container.data as Record<string, unknown>
    : {};
  const rawItems = Array.isArray(payload)
    ? payload
    : [
      container.entries,
      container.list,
      container.items,
      container.results,
      container.data,
      nestedData.entries,
      nestedData.list,
      nestedData.items,
      nestedData.results,
    ].find(Array.isArray) ?? [];
  return (rawItems as unknown[]).flatMap((rawItem) => {
    if (!rawItem || typeof rawItem !== "object") return [];
    const item = rawItem as Record<string, unknown>;
    const entry = readResourceIdentifier(item.entry).trim();
    const label = readResourceIdentifier(item.label).trim();
    const senses = (Array.isArray(item.senses) ? item.senses : [])
      .map((sense) => readResourceIdentifier(sense).trim())
      .filter(Boolean);
    return entry && label ? [{ entry, label, senses }] : [];
  });
}

export function parseInterviews(payload: unknown): CqInterview[] {
  const container = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const rawItems = Array.isArray(payload)
    ? payload
    : [container.texts, container.items, container.data, container.results].find(Array.isArray) ?? [];
  return (rawItems as unknown[]).flatMap((rawItem, index) => {
    if (!rawItem || typeof rawItem !== "object") return [];
    const item = rawItem as Record<string, unknown>;
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
    const rawMetadataId = metadata.id
      ?? (Array.isArray(metadataValues.id) ? metadataValues.id[0] : metadataValues.id);
    const id = readResourceIdentifier(item.fileId ?? item.id ?? item.textId);
    if (!id) return [];
    return [{
      id,
      name: String(item.fileName ?? item.filename ?? item.name ?? item.title ?? item.label ?? `Intervista ${index + 1}`),
      metadataId: readResourceIdentifier(rawMetadataId),
      description: String(rawDescription),
    }];
  });
}

export function parseConcepts(payload: unknown): Map<string, string> {
  const container = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const rawItems = Array.isArray(payload)
    ? payload
    : [container.list, container.items, container.data, container.results].find(Array.isArray) ?? [];
  const map = new Map<string, string>();
  for (const rawItem of rawItems as unknown[]) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as Record<string, unknown>;
    const concept = readResourceIdentifier(item.lexicalConcept).trim();
    const label = readResourceIdentifier(item.defaultLabel).trim();
    if (concept && label) map.set(concept, label);
  }
  return map;
}

export function kwicContext(text: string, start: number, end: number): [string, string] {
  let leftStart = Math.max(0, start - searchContextChars);
  if (leftStart > 0) {
    while (leftStart < start && !/\s/.test(text[leftStart])) leftStart += 1;
    while (leftStart < start && /\s/.test(text[leftStart])) leftStart += 1;
  }
  let rightEnd = Math.min(text.length, end + searchContextChars);
  if (rightEnd < text.length) {
    while (rightEnd > end && !/\s/.test(text[rightEnd - 1])) rightEnd -= 1;
  }
  return [
    `${leftStart > 0 ? "… " : ""}${text.slice(leftStart, start)}`,
    `${text.slice(end, rightEnd)}${rightEnd < text.length ? " …" : ""}`,
  ];
}

const speakerLinePattern = /^\s*(Intervistato|Intervistatore)\s*:/i;

export interface TextTurn {
  start: number;
  end: number;
}

export function buildRespondentTurns(text: string): TextTurn[] {
  if (!text) return [];
  const turns: TextTurn[] = [];
  let speaker: "respondent" | "interviewer" | "" = "";
  let open = false;
  let offset = 0;
  for (const line of text.split("\n")) {
    const lineStart = offset;
    const lineEnd = lineStart + line.length;
    offset = lineEnd + 1;
    const match = speakerLinePattern.exec(line);
    if (match) speaker = match[1].toLowerCase() === "intervistato" ? "respondent" : "interviewer";
    if (speaker === "respondent") {
      const last = turns[turns.length - 1];
      if (open && last) last.end = lineEnd;
      else turns.push({ start: lineStart, end: lineEnd });
      open = true;
    } else {
      open = false;
    }
  }
  return turns;
}

export function downloadCsv(filename: string, header: string[], rows: string[][]) {
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

export const emptyDemographicsParams = {
  sex: "Tutti",
  ageMode: "qualunque",
  age1: 0,
  age2: 0,
  residence: "",
};


/**
 * Espone l'altezza reale del blocco input agganciato (`.cq-sticky-zone`) come
 * variabile `--cq-sticky-h` sul contenitore `.cq-page`, cosi' la colonna sticky
 * e le intestazioni di tabella si fermano sotto la barra anche quando l'altezza
 * cambia (avvolgimento dei controlli, cambio lingua, etichette lunghe).
 */
export function useStickyHeight(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const zone = ref.current;
    const host = zone?.closest(".cq-page");
    if (!zone || !(host instanceof HTMLElement)) return;
    const update = () => {
      host.style.setProperty("--cq-sticky-h", `${Math.round(zone.getBoundingClientRect().height)}px`);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(zone);
    return () => observer.disconnect();
  }, [ref]);
}
