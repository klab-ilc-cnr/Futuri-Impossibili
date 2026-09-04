"use client";

import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { dictionaries, type Lang } from "./strings";

type SelectionInfo = {
  start: number;
  end: number;
  text: string;
  x: number;
  y: number;
  actionX?: number;
  mode: "create" | "edit";
  sourceStart?: number;
  sourceEnd?: number;
  locusIri?: string;
};

type AnnotationConcept = {
  attestationIri: string;
  observableIri: string;
  lexicalConcept: string;
  label: string;
  term: string;
  options: ConceptAnnotationOptions;
};

type UpdatedAttestationSelection = {
  attestationIri: string;
  lexicalConcept: string;
  options: ConceptAnnotationOptions;
};

type Annotation = {
  start: number;
  end: number;
  locusIri: string;
  attestationIris: string[];
  label: string;
  concepts: AnnotationConcept[];
};

type Interview = {
  id: string;
  contextIri?: string;
  name: string;
  metadataId?: string;
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

type ConceptPolarity = "positive" | "neutral" | "negative";
type DefinitionType = "sinonimo" | "parafrasi" | "esempio-prototipo" | "associazione-concettuale";
type ConceptRelationType = "paradigmatico" | "narrativo";
type EvidenceStatus = "nessuno" | "attestato" | "inferito";

type LexicalEntryOption = {
  label: string;
  entry: string;
  senses: string[];
};

type LexicalSenseType = {
  sense: string;
  type: string;
};

type ConceptAnnotationOptions = {
  relationType: ConceptRelationType | "";
  polarity: ConceptPolarity | "";
  definitionType: DefinitionType | "";
  evidenceStatus: EvidenceStatus;
  pragmaticUsage: string;
  note: string;
  lexicalEntry: string;
};

type ConceptSelection = ConceptAnnotationOptions & {
  lexicalConcept: string;
  lexicalEntry: string;
  narrativeSense: string;
  paradigmaticSense: string;
  sensesLoading: boolean;
  sensesReady: boolean;
  sensesError: string;
};

type UnsavedAttestation = {
  id?: string;
  observable?: string;
  type?: string;
  code?: string;
  cause?: string;
};

type BulkTextJobItem = {
  fileId: string;
  originalFileName?: string;
  state: string;
  message?: string;
  resultId?: string;
  attestationState?: string;
  attestationTotal?: number;
  savedAttestations?: number;
  unsavedAttestations?: UnsavedAttestation[];
};

type BulkTextJob = {
  bulkId: string;
  state: string;
  completed: number;
  failed: number;
  cancelled: number;
  items: BulkTextJobItem[];
};

type BulkDeletionJobItem = {
  fileId: string;
  state: string;
  message?: string;
};

type BulkDeletionJob = {
  bulkId: string;
  state: string;
  total: number;
  deleted: number;
  notFound: number;
  failed: number;
  items: BulkDeletionJobItem[];
};

type ImportReport = {
  running: boolean;
  total: number;
  completed: number;
  problems: string[];
};

type SearchType = "forma" | "concetto" | "termine";

type SearchRow = {
  fileId: string;
  docLabel: string;
  docTitle: string;
  left: string;
  keyword: string;
  right: string;
  start: number;
  end: number;
};

type SearchState = {
  type: SearchType;
  query: string;
  rows: SearchRow[];
};

const menuItemIds = [
  "progetto",
  "statistiche",
  "dizionario",
  "interrogazioni",
  "annotazione",
  "risultati",
  "contatti",
];

const workspacePasswordHash = "e2b3e011fbaf01d90acec9c3f3e3b23509b52f5d4500f9500f2770449bda4b91";
const workspaceUnlockedKey = "fi-workspace-unlocked";

const reservedMenuItemIndex = 4;

const langSubscribers = new Set<() => void>();

function subscribeLang(listener: () => void) {
  langSubscribers.add(listener);
  return () => {
    langSubscribers.delete(listener);
  };
}

function getLangSnapshot(): Lang {
  try {
    const stored = window.localStorage.getItem("fi-lang");
    if (stored === "it" || stored === "en") return stored;
  } catch {
  }
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "it";
}

function getServerLangSnapshot(): Lang {
  return "it";
}

const appVersion = "0.14.15";

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "/futuri-impossibili").replace(/\/$/, "");

const textsEndpoint = `${basePath}/api/lexo/texts`;
const textBulkUploadEndpoint = `${basePath}/api/lexo/texts/bulk`;
const conceptsEndpoint = `${basePath}/api/lexo/lexical-concepts`;
const lexicalEntriesEndpoint = `${basePath}/api/lexo/lexical-entries`;
const metadataEndpoint = `${basePath}/api/lexo/metadata`;
const lexicalConceptEndpoint = `${basePath}/api/lexo/lexical-concept`;
const attestationsEndpoint = `${basePath}/api/lexo/attestations`;
const attestationsByObservableEndpoint = `${basePath}/api/lexo/attestations/by-observable`;
const dctTypeProperty = "http://purl.org/dc/terms/type";
const legacyDctTypeProperty = "http://purl.org/dc/terms/";
const conceptLabelProperty = "https://lexo.ilc.cnr.it#conceptLabel";
const referringConceptProperty = "https://lexo.ilc.cnr.it#referringConcept";
const polarityProperty = "http://purl.org/marl/ns#hasPolarity";
const legacyPolarityProperty = "http://www.gsi.dit.upm.es/ontologies/marl/ns#hasPolarity";
const definitionTypeProperty = "https://lexo.ilc.cnr.it#definitionType";
const evidenceStatusProperty = "https://lexo.ilc.cnr.it#evidenceStatus";
const pragmaticUsageProperty = "https://lexo.ilc.cnr.it#pragmaticUsage";
const skosNoteProperty = "http://www.w3.org/2004/02/skos/core#note";
const rdfsCommentProperty = "http://www.w3.org/2000/01/rdf-schema#comment";
const lexicalEntryProperty = "https://lexo.ilc.cnr.it#lexicalEntry";

const polarityOptions: Array<{ value: ConceptPolarity }> = [
  { value: "negative" },
  { value: "neutral" },
  { value: "positive" },
];

const definitionTypeOptions: Array<{ value: DefinitionType }> = [
  { value: "sinonimo" },
  { value: "parafrasi" },
  { value: "esempio-prototipo" },
  { value: "associazione-concettuale" },
];

const conceptRelationOptions: Array<{ value: ConceptRelationType }> = [
  { value: "paradigmatico" },
  { value: "narrativo" },
];

const evidenceStatusOptions: Array<{ value: EvidenceStatus }> = [
  { value: "nessuno" },
  { value: "attestato" },
  { value: "inferito" },
];

const definitionTypeValues: Record<DefinitionType, string> = {
  sinonimo: "sinonimo",
  parafrasi: "parafrasi",
  "esempio-prototipo": "esempio prototipico",
  "associazione-concettuale": "associazione concettuale",
};

function narrativeMetadata(options: ConceptAnnotationOptions, includeEmptyOptional = false) {
  const polarityName = options.polarity.charAt(0).toUpperCase() + options.polarity.slice(1);
  return [
    {
      property: polarityProperty,
      values: options.polarity ? [{
        value: `http://purl.org/marl/ns#${polarityName}`,
        type: "iri",
      }] : [],
    },
    {
      property: definitionTypeProperty,
      values: options.definitionType ? [{
        value: definitionTypeValues[options.definitionType as DefinitionType],
        type: "literal",
        language: "it",
      }] : [],
    },
    ...(includeEmptyOptional || options.lexicalEntry ? [{
      property: lexicalEntryProperty,
      values: options.lexicalEntry ? [{ value: options.lexicalEntry, type: "iri" }] : [],
    }] : []),
    ...(includeEmptyOptional ? [{ property: legacyPolarityProperty, values: [] }] : []),
    ...(includeEmptyOptional || options.evidenceStatus !== "nessuno" ? [{
      property: evidenceStatusProperty,
      values: options.evidenceStatus !== "nessuno"
        ? [{ value: options.evidenceStatus, type: "literal", language: "it" }]
        : [],
    }] : []),
    ...(includeEmptyOptional || (options.pragmaticUsage.trim() && options.pragmaticUsage !== "nessuno") ? [{
      property: pragmaticUsageProperty,
      values: options.pragmaticUsage.trim() && options.pragmaticUsage !== "nessuno"
        ? [{ value: options.pragmaticUsage.trim(), type: "literal", language: "it" }]
        : [],
    }] : []),
    ...(includeEmptyOptional || options.note.trim() ? [{
      property: skosNoteProperty,
      values: options.note.trim()
        ? [{ value: options.note.trim(), type: "literal", language: "it" }]
        : [],
    }] : []),
  ];
}

function emptyConceptSelection(lexicalConcept: string): ConceptSelection {
  return {
    lexicalConcept,
    lexicalEntry: "",
    narrativeSense: "",
    paradigmaticSense: "",
    relationType: "",
    polarity: "",
    definitionType: "",
    evidenceStatus: "nessuno",
    pragmaticUsage: "nessuno",
    note: "",
    sensesLoading: false,
    sensesReady: false,
    sensesError: "",
  };
}

function normalizedSenseType(type: string) {
  return (type.trim().toLocaleLowerCase("it-IT").split(/[/#]/).pop() ?? "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/@[a-z]{2,3}(?:-[a-z0-9]+)*$/i, "")
    .replace(/[^a-z]/g, "");
}

function editableOptionsEqual(left: ConceptAnnotationOptions, right: ConceptAnnotationOptions) {
  return left.polarity === right.polarity
    && left.definitionType === right.definitionType
    && left.evidenceStatus === right.evidenceStatus
    && left.pragmaticUsage.trim() === right.pragmaticUsage.trim()
    && left.note.trim() === right.note.trim();
}

function resolveLexicalEntryLabel(
  lexicalEntry: string,
  observableIri: string,
  lexicalEntries: LexicalEntryOption[],
): string {
  if (lexicalEntry) {
    const direct = lexicalEntries.find((item) => item.entry === lexicalEntry);
    if (direct) return direct.label;
  }
  if (observableIri) {
    const match = lexicalEntries.find((item) =>
      item.entry === observableIri || item.senses.includes(observableIri),
    );
    if (match) return match.label;
  }
  return "";
}

function DefinitionTypeIcon({ type }: { type: DefinitionType }) {
  const commonProps = {
    viewBox: "0 0 32 32",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (type === "sinonimo") {
    return (
      <svg {...commonProps}>
        <path d="M12.2 10.2 9.8 7.8a5 5 0 0 0-7.1 7.1l3.8 3.8a5 5 0 0 0 7.1 0l1.5-1.5" />
        <path d="m19.8 21.8 2.4 2.4a5 5 0 0 0 7.1-7.1l-3.8-3.8a5 5 0 0 0-7.1 0l-1.5 1.5" />
        <path d="m10.8 21.2 10.4-10.4" />
      </svg>
    );
  }
  if (type === "parafrasi") {
    return (
      <svg {...commonProps}>
        <path d="M4 6.5h15a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H10l-5 4v-4H4a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3Z" />
        <path d="M10 23.5h12l5 4v-4h1a3 3 0 0 0 3-3v-5a3 3 0 0 0-3-3h-2" />
        <path d="M7 11h9M7 14h6" />
      </svg>
    );
  }
  if (type === "esempio-prototipo") {
    return (
      <svg {...commonProps}>
        <path d="M11 23h10M12.5 27h7" />
        <path d="M9.2 18.5A9 9 0 1 1 22.8 18.5c-1.2 1-1.8 2-1.8 4.5H11c0-2.5-.6-3.5-1.8-4.5Z" />
        <path d="m16 7.5 1.2 2.5 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4L16 7.5Z" />
      </svg>
    );
  }
  return (
    <svg {...commonProps}>
      <circle cx="16" cy="7" r="3.5" />
      <circle cx="7" cy="24" r="3.5" />
      <circle cx="25" cy="24" r="3.5" />
      <circle cx="16" cy="20" r="2.5" />
      <path d="m14.3 10.1-5.6 10.8M17.7 10.1l5.6 10.8M16 10.5v7M10.5 24h11" />
    </svg>
  );
}

function readResourceIdentifier(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";
  const resource = value as Record<string, unknown>;
  return readResourceIdentifier(resource.iri ?? resource["@id"] ?? resource.id ?? resource.value);
}

function readItalianPreferredLabel(payload: unknown): string {
  function localizedValue(value: unknown, inheritedLanguage = ""): string {
    if (Array.isArray(value)) {
      for (const item of value) {
        const label = localizedValue(item, inheritedLanguage);
        if (label) return label;
      }
      return "";
    }
    if (typeof value === "string") {
      const label = value.trim();
      if (!/@it$/i.test(label)) {
        return inheritedLanguage === "it" || inheritedLanguage.startsWith("it-") ? label : "";
      }
      return label.replace(/^"|"@it$/gi, "").replace(/@it$/i, "").trim();
    }
    if (!value || typeof value !== "object") return "";
    const labelValue = value as Record<string, unknown>;
    const language = String(
      labelValue.language ?? labelValue.lang ?? labelValue["@language"] ?? labelValue["xml:lang"] ?? "",
    ).toLocaleLowerCase("it-IT");
    const text = labelValue.value ?? labelValue.label ?? labelValue["@value"];
    if ((language === "it" || language.startsWith("it-")) && typeof text === "string") {
      return text.trim();
    }
    if (labelValue.it !== undefined) return localizedValue(`${readResourceIdentifier(labelValue.it)}@it`);
    return "";
  }

  function findPreferredLabel(value: unknown): string {
    if (Array.isArray(value)) {
      for (const item of value) {
        const label = findPreferredLabel(item);
        if (label) return label;
      }
      return "";
    }
    if (!value || typeof value !== "object") return "";
    const container = value as Record<string, unknown>;
    const property = readResourceIdentifier(container.property).trim();
    if (property === "http://www.w3.org/2004/02/skos/core#prefLabel") {
      const label = localizedValue(container);
      if (label) return label;
    }
    for (const [key, candidate] of Object.entries(container)) {
      const normalizedKey = key.toLocaleLowerCase("it-IT").replace(/[^a-z]/g, "");
      if (normalizedKey.endsWith("preferredlabel") || normalizedKey.endsWith("preflabel")) {
        const language = String(
          container.language ?? container.lang ?? container["@language"] ?? container["xml:lang"] ?? "",
        ).toLocaleLowerCase("it-IT");
        const label = localizedValue(candidate, language);
        if (label) return label;
      }
    }
    for (const candidate of Object.values(container)) {
      const label = findPreferredLabel(candidate);
      if (label) return label;
    }
    return "";
  }

  return findPreferredLabel(payload);
}

async function parseAttestations(payload: unknown, lexicalConcepts: LexicalConcept[]): Promise<Annotation[]> {
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

  function collectMetadataValues(value: unknown, property: string): string[] {
    if (Array.isArray(value)) {
      return value.flatMap((rawProperty) => {
        if (!rawProperty || typeof rawProperty !== "object") return [];
        const metadataProperty = rawProperty as Record<string, unknown>;
        return readResourceIdentifier(metadataProperty.property) === property
          ? (Array.isArray(metadataProperty.values) ? metadataProperty.values : [metadataProperty.values])
              .map((item) => readResourceIdentifier(item).trim())
              .filter(Boolean)
          : [];
      });
    }
    if (!value || typeof value !== "object") return [];
    const metadata = value as Record<string, unknown>;
    const rawValues = metadata[property];
    const values = Array.isArray(rawValues) ? rawValues : rawValues ? [rawValues] : [];
    return values
      .map((item) => readResourceIdentifier(item).trim())
      .filter(Boolean);
  }

  function hasLexicalSenseObservableType(...values: unknown[]) {
    return includesObservableType(values, "http://www.w3.org/ns/lemon/ontolex#LexicalSense");
  }

  function includesObservableType(values: unknown[], observableType: string) {
    function collectTypes(value: unknown): string[] {
      if (Array.isArray(value)) return value.flatMap(collectTypes);
      if (typeof value === "string") return [value.trim()];
      if (!value || typeof value !== "object") return [];
      const container = value as Record<string, unknown>;
      return collectTypes(container.value ?? container.iri ?? container["@id"] ?? container.id);
    }
    return values.flatMap(collectTypes).includes(observableType);
  }

  function hasLexicalConceptObservableType(...values: unknown[]) {
    return includesObservableType(values, "http://www.w3.org/ns/lemon/ontolex#LexicalConcept");
  }

  function parsePolarity(values: unknown[]): ConceptPolarity | "" {
    for (const value of values.flatMap((item) => Array.isArray(item) ? item : [item])) {
      const identifier = readResourceIdentifier(value).toLocaleLowerCase("it");
      const localName = identifier.split(/[/#]/).pop();
      if (localName === "positive") return "positive";
      if (localName === "neutral") return "neutral";
      if (localName === "negative") return "negative";
    }
    return "";
  }

  function parseDefinitionType(values: unknown[]): DefinitionType | "" {
    for (const value of values.flatMap((item) => Array.isArray(item) ? item : [item])) {
      const identifier = readResourceIdentifier(value).toLocaleLowerCase("it");
      const localName = (identifier.split(/[/#]/).pop() ?? "").replace(/[_\s]/g, "-");
      if (["sinonimo", "synonym"].includes(localName)) return "sinonimo";
      if (["parafrasi", "paraphrase"].includes(localName)) return "parafrasi";
      if (["esempio-prototipo", "esempio-prototipico", "esempioprototipo", "esempioprototipico", "prototype-example"].includes(localName)) {
        return "esempio-prototipo";
      }
      if (["associazione-concettuale", "associazioneconcettuale", "conceptual-association"].includes(localName)) {
        return "associazione-concettuale";
      }
    }
    return "";
  }

  function parseEvidenceStatus(values: unknown[]): EvidenceStatus {
    for (const value of values.flatMap((item) => Array.isArray(item) ? item : [item])) {
      const normalizedValue = readResourceIdentifier(value).trim().toLocaleLowerCase("it-IT");
      if (normalizedValue === "attestato" || normalizedValue === "inferito") return normalizedValue;
    }
    return "nessuno";
  }

  const attestationItems = findItems(payload);
  const preferredLabelsByAttestation = new Map<object, string>();
  await Promise.all(attestationItems.map(async (rawAttestation) => {
    if (!rawAttestation || typeof rawAttestation !== "object") return;
    const attestation = rawAttestation as Record<string, unknown>;
    const occurrences = Array.isArray(attestation.occurrences)
      ? attestation.occurrences
      : attestation.occurrence && typeof attestation.occurrence === "object"
        ? [attestation.occurrence]
        : [attestation];
    const hasLexicalSense = occurrences.some((rawOccurrence) => {
      const occurrence = rawOccurrence && typeof rawOccurrence === "object"
        ? rawOccurrence as Record<string, unknown>
        : {};
      return hasLexicalSenseObservableType(
        attestation.observableTypes,
        attestation.observableType,
        occurrence.observableTypes,
        occurrence.observableType,
      );
    });
    if (!hasLexicalSense) return;

    const occurrenceMetadata = occurrences.flatMap((rawOccurrence) => {
      if (!rawOccurrence || typeof rawOccurrence !== "object") return [];
      return collectMetadataValues(
        (rawOccurrence as Record<string, unknown>).metadata,
        referringConceptProperty,
      );
    });
    const lexicalConcept = [
      ...collectMetadataValues(attestation.metadata, referringConceptProperty),
      ...occurrenceMetadata,
    ][0];
    if (!lexicalConcept) return;

    try {
      const parameters = new URLSearchParams({ lexicalConcept });
      const response = await fetch(`${lexicalConceptEndpoint}?${parameters.toString()}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) return;
      const preferredLabel = readItalianPreferredLabel(await response.json() as unknown);
      if (preferredLabel) preferredLabelsByAttestation.set(rawAttestation, preferredLabel);
    } catch {
      // Se la label non è disponibile resta valido il fallback corrente.
    }
  }));

  const grouped = new Map<string, {
    start: number;
    end: number;
    locusIri: string;
    attestationIris: Set<string>;
    labels: Set<string>;
    concepts: Map<string, AnnotationConcept>;
  }>();
  for (const rawAttestation of attestationItems) {
    if (!rawAttestation || typeof rawAttestation !== "object") continue;
    const attestation = rawAttestation as Record<string, unknown>;
    const storedPreferredLabel = preferredLabelsByAttestation.get(rawAttestation);
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
      const current = grouped.get(key) ?? {
        start,
        end,
        locusIri: readResourceIdentifier(
          occurrence.locus
          ?? occurrence.locusIri
          ?? occurrence.locusIRI
          ?? occurrence.iri
          ?? occurrence["@id"]
          ?? occurrence.id
          ?? attestation.locus
          ?? attestation.locusIri
          ?? attestation.locusIRI,
        ).trim(),
        attestationIris: new Set<string>(),
        labels: new Set<string>(),
        concepts: new Map<string, AnnotationConcept>(),
      };
      if (!current.locusIri) {
        current.locusIri = readResourceIdentifier(
          occurrence.locus
          ?? occurrence.locusIri
          ?? occurrence.locusIRI
          ?? occurrence.iri
          ?? occurrence["@id"]
          ?? occurrence.id
          ?? attestation.locus
          ?? attestation.locusIri
          ?? attestation.locusIRI,
        ).trim();
      }
      const attestationIri = readResourceIdentifier(
        occurrence.attestation ?? attestation.attestation ?? occurrence.attestationIri ?? attestation.attestationIri,
      ).trim();
      if (attestationIri) current.attestationIris.add(attestationIri);
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
      const metadataLabel = [
        ...collectMetadataValues(occurrence.metadata, "http://www.w3.org/2000/01/rdf-schema#label"),
        ...collectMetadataValues(attestation.metadata, "http://www.w3.org/2000/01/rdf-schema#label"),
      ][0];
      const lexicalSenseReferringConceptIri = [
        ...collectMetadataValues(occurrence.metadata, referringConceptProperty),
        ...collectMetadataValues(attestation.metadata, referringConceptProperty),
      ][0];
      const referringConceptIri = lexicalSenseReferringConceptIri || [
        ...collectMetadataValues(occurrence.metadata, conceptLabelProperty),
        ...collectMetadataValues(attestation.metadata, conceptLabelProperty),
      ][0];
      const effectiveConceptIri = referringConceptIri || observable;
      const effectiveConceptLabel = storedPreferredLabel ?? lexicalConcepts.find(
        (concept) => concept.lexicalConcept === effectiveConceptIri,
      )?.defaultLabel;
      const displayLabels = labels.map((label) => metadataLabel ? `${metadataLabel} - ${label}` : label);
      if (effectiveConceptLabel && referringConceptIri) {
        displayLabels.splice(0, displayLabels.length, metadataLabel
          ? `${metadataLabel} - ${effectiveConceptLabel}`
          : effectiveConceptLabel);
      }
      displayLabels.forEach((label) => current.labels.add(label));
      const observableTypeSources = [
        attestation.observableTypes,
        attestation.observableType,
        occurrence.observableTypes,
        occurrence.observableType,
      ];
      const conceptFlow = hasLexicalSenseObservableType(...observableTypeSources)
        || hasLexicalConceptObservableType(...observableTypeSources);
      if (effectiveConceptIri && conceptFlow) {
        const polarity = parsePolarity([
          ...collectMetadataValues(occurrence.metadata, polarityProperty),
          ...collectMetadataValues(attestation.metadata, polarityProperty),
          ...collectMetadataValues(occurrence.metadata, legacyPolarityProperty),
          ...collectMetadataValues(attestation.metadata, legacyPolarityProperty),
          occurrence.polarity,
          attestation.polarity,
        ]);
        const definitionType = parseDefinitionType([
          ...collectMetadataValues(occurrence.metadata, "https://lexo.ilc.cnr.it#definitionType"),
          ...collectMetadataValues(attestation.metadata, "https://lexo.ilc.cnr.it#definitionType"),
          occurrence.definitionType,
          occurrence.definition_type,
          attestation.definitionType,
          attestation.definition_type,
        ]);
        const evidenceStatus = parseEvidenceStatus([
          ...collectMetadataValues(occurrence.metadata, evidenceStatusProperty),
          ...collectMetadataValues(attestation.metadata, evidenceStatusProperty),
          occurrence.evidenceStatus,
          attestation.evidenceStatus,
        ]);
        const pragmaticUsage = [
          ...collectMetadataValues(occurrence.metadata, pragmaticUsageProperty),
          ...collectMetadataValues(attestation.metadata, pragmaticUsageProperty),
        ][0] ?? "nessuno";
        const note = [
          ...collectMetadataValues(occurrence.metadata, skosNoteProperty),
          ...collectMetadataValues(attestation.metadata, skosNoteProperty),
        ][0] ?? "";
        const annotationLexicalEntry = [
          ...collectMetadataValues(occurrence.metadata, lexicalEntryProperty),
          ...collectMetadataValues(attestation.metadata, lexicalEntryProperty),
        ][0] ?? "";
        const term = [
          ...collectMetadataValues(occurrence.metadata, rdfsCommentProperty),
          ...collectMetadataValues(attestation.metadata, rdfsCommentProperty),
        ][0] ?? "";
        current.concepts.set(effectiveConceptIri, {
          attestationIri,
          observableIri: observable,
          lexicalConcept: effectiveConceptIri,
          label: displayLabels[0] ?? effectiveConceptLabel ?? conceptLabel ?? effectiveConceptIri,
          term,
          options: {
            relationType: referringConceptIri ? "paradigmatico" : polarity || definitionType ? "narrativo" : "",
            polarity,
            definitionType,
            evidenceStatus,
            pragmaticUsage,
            note,
            lexicalEntry: annotationLexicalEntry,
          },
        });
      }
      grouped.set(key, current);
    }
  }

  return [...grouped.values()]
    .map((annotation) => ({
      start: annotation.start,
      end: annotation.end,
      locusIri: annotation.locusIri,
      attestationIris: [...annotation.attestationIris],
      label: [...annotation.labels].join("\n") || "Attestazione",
      concepts: [...annotation.concepts.values()],
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

function parseLexicalEntries(payload: unknown): LexicalEntryOption[] {
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

  const entries = (rawItems as unknown[]).flatMap((rawItem) => {
    if (!rawItem || typeof rawItem !== "object") return [];
    const item = rawItem as Record<string, unknown>;
    const entry = readResourceIdentifier(item.entry).trim();
    const label = readResourceIdentifier(item.label).trim();
    const senses = (Array.isArray(item.senses) ? item.senses : [])
      .map((sense) => readResourceIdentifier(sense).trim())
      .filter(Boolean);
    return entry && label ? [{ entry, label, senses }] : [];
  });

  return [...new Map(entries.map((item) => [item.entry, item])).values()];
}

function parseSenseTypes(payload: unknown, sense: string): LexicalSenseType[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const container = payload as Record<string, unknown>;
  const nestedData = container.data && typeof container.data === "object" && !Array.isArray(container.data)
    ? container.data as Record<string, unknown>
    : {};
  const rawMetadata = container.metadata ?? nestedData.metadata;
  const metadata = Array.isArray(rawMetadata)
    ? rawMetadata
    : rawMetadata && typeof rawMetadata === "object"
      ? Object.entries(rawMetadata as Record<string, unknown>).map(([property, values]) => ({ property, values }))
      : [];
  return metadata.flatMap((rawProperty) => {
    if (!rawProperty || typeof rawProperty !== "object") return [];
    const property = rawProperty as Record<string, unknown>;
    const propertyIri = readResourceIdentifier(property.property).trim();
    if (
      propertyIri !== dctTypeProperty
      && propertyIri !== legacyDctTypeProperty
      && propertyIri.toLocaleLowerCase("it-IT") !== "dct:type"
    ) return [];
    const values = Array.isArray(property.values)
      ? property.values
      : property.values === undefined || property.values === null
        ? []
        : [property.values];
    return values.flatMap((rawValue) => {
      const type = readResourceIdentifier(rawValue).trim();
      return type ? [{ sense, type }] : [];
    });
  });
}

function containsTimestamp(payload: unknown): boolean {
  if (typeof payload === "number") return Number.isFinite(payload);
  if (typeof payload === "string") {
    const value = payload.trim();
    return /^\d{10,}$/.test(value) || (!/^\d+$/.test(value) && !Number.isNaN(Date.parse(value)));
  }
  if (!payload || typeof payload !== "object") return false;
  const container = payload as Record<string, unknown>;
  return [container.timestamp, container.timeStamp, container.lastUpdate, container.modified, container.date]
    .some(containsTimestamp);
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

function readBulkTextJob(payload: unknown): BulkTextJob | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const job = payload as Record<string, unknown>;
  const bulkId = readResourceIdentifier(job.bulkId ?? job.id);
  const state = typeof job.state === "string" ? job.state.toUpperCase() : "";
  if (!bulkId || !state) return null;
  const rawItems = Array.isArray(job.items) ? job.items : [];
  const items = rawItems.flatMap((rawItem) => {
    if (!rawItem || typeof rawItem !== "object") return [];
    const item = rawItem as Record<string, unknown>;
    const fileId = readResourceIdentifier(item.fileId ?? item.id);
    const itemState = typeof item.state === "string" ? item.state.toUpperCase() : "";
    if (!fileId || !itemState) return [];
    return [{
      fileId,
      state: itemState,
      originalFileName: typeof item.originalFileName === "string" ? item.originalFileName : undefined,
      message: typeof item.message === "string" ? item.message : undefined,
      resultId: readResourceIdentifier(item.resultId) || undefined,
      attestationState: typeof item.attestationState === "string"
        ? item.attestationState.toUpperCase()
        : undefined,
      attestationTotal: Number.isFinite(Number(item.attestationTotal))
        ? Number(item.attestationTotal)
        : undefined,
      savedAttestations: Number.isFinite(Number(item.savedAttestations))
        ? Number(item.savedAttestations)
        : undefined,
      unsavedAttestations: Array.isArray(item.unsavedAttestations)
        ? item.unsavedAttestations.flatMap((rawUnsaved) => {
            if (!rawUnsaved || typeof rawUnsaved !== "object") return [];
            const unsaved = rawUnsaved as Record<string, unknown>;
            return [{
              id: typeof unsaved.id === "string" ? unsaved.id : undefined,
              observable: typeof unsaved.observable === "string" ? unsaved.observable : undefined,
              type: typeof unsaved.type === "string" ? unsaved.type : undefined,
              code: typeof unsaved.code === "string" ? unsaved.code : undefined,
              cause: typeof unsaved.cause === "string" ? unsaved.cause : undefined,
            }];
          })
        : undefined,
    }];
  });
  return {
    bulkId,
    state,
    completed: Number(job.completed ?? 0),
    failed: Number(job.failed ?? 0),
    cancelled: Number(job.cancelled ?? 0),
    items,
  };
}

const BULK_DELETION_TIMEOUT = "bulk-deletion-timeout";

function readBulkDeletionJob(payload: unknown): BulkDeletionJob | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const job = payload as Record<string, unknown>;
  const bulkId = readResourceIdentifier(job.bulkId ?? job.id);
  const state = typeof job.state === "string" ? job.state.toUpperCase() : "";
  if (!bulkId || !state) return null;
  const rawItems = Array.isArray(job.items) ? job.items : [];
  const items = rawItems.flatMap((rawItem) => {
    if (!rawItem || typeof rawItem !== "object") return [];
    const item = rawItem as Record<string, unknown>;
    const fileId = readResourceIdentifier(item.fileId ?? item.id);
    const itemState = typeof item.state === "string" ? item.state.toUpperCase() : "";
    if (!fileId || !itemState) return [];
    return [{
      fileId,
      state: itemState,
      message: typeof item.message === "string" ? item.message : undefined,
    }];
  });
  return {
    bulkId,
    state,
    total: Number(job.total ?? 0),
    deleted: Number(job.deleted ?? 0),
    notFound: Number(job.notFound ?? 0),
    failed: Number(job.failed ?? 0),
    items,
  };
}

async function waitForBulkDeletion(
  bulkId: string,
  onProgress?: (job: BulkDeletionJob) => void,
) {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const response = await fetch(
      `${basePath}/api/lexo/texts/deletions/${encodeURIComponent(bulkId)}/status`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    if (!response.ok) throw new Error(await readErrorDetail(response));

    const job = readBulkDeletionJob(await response.json() as unknown);
    if (job) {
      onProgress?.(job);
      if (["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"].includes(job.state)) {
        return job;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(BULK_DELETION_TIMEOUT);
}

function describeBulkDeletionFailures(job: BulkDeletionJob) {
  const details = job.items
    .filter((item) => item.state !== "DELETED")
    .slice(0, 3)
    .map((item) => `${item.fileId}: ${item.message ?? item.state.toLocaleLowerCase("it-IT")}`);
  return details.join(" · ");
}

async function waitForBulkTextConversion(
  bulkId: string,
  onProgress?: (job: BulkTextJob) => void,
) {  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const response = await fetch(
      `${textBulkUploadEndpoint}/${encodeURIComponent(bulkId)}/status`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    if (!response.ok) throw new Error(await readErrorDetail(response));

    const job = readBulkTextJob(await response.json() as unknown);
    if (job) {
      onProgress?.(job);
      if (["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"].includes(job.state)) {
        return job;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Tempo massimo superato durante l’importazione bulk");
}

function locusBarY(relTop: number, annotationHeight: number, wrapHeight: number | undefined) {
  const barSize = 48;
  const barGap = 8;
  return relTop >= barSize + barGap
    ? relTop - barSize - barGap
    : Math.max(0, Math.min(
        relTop + annotationHeight + barGap,
        (wrapHeight ?? Number.POSITIVE_INFINITY) - barSize,
      ));
}

function wildcardToRegex(pattern: string) {
  const escaped = pattern
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\*/g, "[^\\s\\p{P}\\p{S}]*")
    .replace(/\\\?/g, "[^\\s\\p{P}\\p{S}]");
  return new RegExp(escaped, "giu");
}

const SEARCH_CONTEXT_CHARS = 40;
const SEARCH_KEYWORD_CONTEXT_MIN = 40;
const SEARCH_PAGE_SIZE = 20;

function kwicContext(text: string, start: number, end: number) {
  let leftStart = Math.max(0, start - SEARCH_CONTEXT_CHARS);
  if (leftStart > 0) {
    while (leftStart < start && !/\s/.test(text[leftStart])) leftStart += 1;
    while (leftStart < start && /\s/.test(text[leftStart])) leftStart += 1;
  }
  let rightEnd = Math.min(text.length, end + SEARCH_CONTEXT_CHARS);
  if (rightEnd < text.length) {
    while (rightEnd > end && !/\s/.test(text[rightEnd - 1])) rightEnd -= 1;
  }
  return [
    `${leftStart > 0 ? "… " : ""}${text.slice(leftStart, start)}`,
    `${text.slice(end, rightEnd)}${rightEnd < text.length ? " …" : ""}`,
  ];
}

function getTextNodeEntries(root: HTMLElement) {
  const entries: Array<{ node: Text; start: number; end: number }> = [];
  let offset = 0;
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(n) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          const el = n as HTMLElement;
          if (
            el.classList.contains("interview-offset-prefix")
            || el.classList.contains("annotation-layer")
          ) {
            if (el.classList.contains("interview-offset-prefix")) {
              offset += el.textContent?.length ?? 0;
            }
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  let curr = walker.nextNode();
  while (curr) {
    if (curr.nodeType === Node.TEXT_NODE) {
      const textNode = curr as Text;
      const len = textNode.textContent?.length ?? 0;
      if (len > 0) {
        entries.push({
          node: textNode,
          start: offset,
          end: offset + len,
        });
        offset += len;
      }
    }
    curr = walker.nextNode();
  }
  return entries;
}

function createRangeForOffsets(
  entries: Array<{ node: Text; start: number; end: number }>,
  start: number,
  end: number,
) {
  const range = document.createRange();
  if (entries.length === 0) return range;

  let startEntry = entries[0];
  for (const entry of entries) {
    if (entry.start <= start && start <= entry.end) {
      startEntry = entry;
      break;
    }
    if (entry.end < start) startEntry = entry;
  }

  let endEntry = entries[entries.length - 1];
  for (const entry of entries) {
    if (entry.start <= end && end <= entry.end) {
      endEntry = entry;
      break;
    }
    if (entry.start > end) break;
    endEntry = entry;
  }

  const startOffset = Math.max(0, Math.min(start - startEntry.start, startEntry.node.textContent?.length ?? 0));
  const endOffset = Math.max(0, Math.min(end - endEntry.start, endEntry.node.textContent?.length ?? 0));

  range.setStart(startEntry.node, startOffset);
  range.setEnd(endEntry.node, endOffset);
  return range;
}

function getHandlePoint(
  entries: Array<{ node: Text; start: number; end: number }>,
  offset: number,
  kind: "start" | "end",
) {
  const range = document.createRange();
  if (entries.length === 0) return { x: 0, y: 0, height: 24 };

  if (kind === "start") {
    let targetEntry = entries[0];
    for (const entry of entries) {
      if (entry.start <= offset && offset <= entry.end) {
        targetEntry = entry;
        break;
      }
      if (entry.end < offset) targetEntry = entry;
    }
    const local = Math.max(0, Math.min(offset - targetEntry.start, targetEntry.node.textContent?.length ?? 0));
    const localEnd = Math.min(local + 1, targetEntry.node.textContent?.length ?? 0);
    range.setStart(targetEntry.node, local);
    range.setEnd(targetEntry.node, local === localEnd ? local : localEnd);
    const rect = range.getBoundingClientRect();
    return { x: rect.left, y: rect.top, height: rect.height || 24 };
  } else {
    if (offset <= 0) {
      const firstEntry = entries[0];
      range.setStart(firstEntry.node, 0);
      range.setEnd(firstEntry.node, Math.min(1, firstEntry.node.textContent?.length ?? 0));
      const rect = range.getBoundingClientRect();
      return { x: rect.left, y: rect.top, height: rect.height || 24 };
    }
    const targetOffset = offset - 1;
    let targetEntry = entries[entries.length - 1];
    for (const entry of entries) {
      if (entry.start <= targetOffset && targetOffset <= entry.end) {
        targetEntry = entry;
        break;
      }
      if (entry.start > targetOffset) break;
      targetEntry = entry;
    }
    const local = Math.max(0, Math.min(targetOffset - targetEntry.start, (targetEntry.node.textContent?.length ?? 0) - 1));
    range.setStart(targetEntry.node, local);
    range.setEnd(targetEntry.node, local + 1);
    const prevRects = range.getClientRects();
    const prevRect = prevRects.length > 0 ? prevRects[prevRects.length - 1] : range.getBoundingClientRect();
    return { x: prevRect.right, y: prevRect.top, height: prevRect.height || 24 };
  }
}

function findOffsetInNode(
  range: Range,
  entry: { node: Text; start: number; end: number },
  targetRect: DOMRect,
  clientX: number,
): number {
  const node = entry.node;
  const len = node.textContent?.length ?? 0;
  if (len === 0) return entry.start;

  let lineStartChar = 0;
  let lineEndChar = len;

  range.selectNodeContents(node);
  const allRects = range.getClientRects();
  if (allRects.length > 1) {
    let low = 0;
    let high = len;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      range.setStart(node, mid);
      range.setEnd(node, Math.min(mid + 1, len));
      const r = range.getBoundingClientRect();
      if (r.bottom < targetRect.top - 2) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    lineStartChar = low;

    low = lineStartChar;
    high = len;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      range.setStart(node, mid);
      range.setEnd(node, Math.min(mid + 1, len));
      const r = range.getBoundingClientRect();
      if (r.top > targetRect.bottom + 2) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    lineEndChar = low;
  }

  if (lineStartChar >= lineEndChar) {
    return entry.start + lineStartChar;
  }

  // Check left boundary using the first character on this line
  range.setStart(node, lineStartChar);
  range.setEnd(node, Math.min(len, lineStartChar + 1));
  const firstCharRects = range.getClientRects();
  const firstCharRect = firstCharRects.length > 0 ? firstCharRects[0] : range.getBoundingClientRect();
  if (clientX <= firstCharRect.left) {
    return entry.start + lineStartChar;
  }

  // Check right boundary using the last character on this line
  const lastCharIndex = Math.max(lineStartChar, lineEndChar - 1);
  range.setStart(node, lastCharIndex);
  range.setEnd(node, lastCharIndex + 1);
  const lastCharRects = range.getClientRects();
  const lastCharRect = lastCharRects.length > 0 ? lastCharRects[lastCharRects.length - 1] : range.getBoundingClientRect();
  if (clientX >= lastCharRect.right) {
    return entry.start + lineEndChar;
  }

  let low = lineStartChar;
  let high = lineEndChar;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    range.setStart(node, mid);
    range.setEnd(node, Math.min(len, mid + 1));
    const charRects = range.getClientRects();
    const charRect = charRects.length > 0 ? charRects[0] : range.getBoundingClientRect();
    const midX = charRect.left + charRect.width / 2;
    if (clientX < midX) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return entry.start + low;
}

function textOffsetAtPoint(root: HTMLElement | null, clientX: number, clientY: number): number | null {
  if (!root) return null;

  const entries = getTextNodeEntries(root);
  if (entries.length === 0) return 0;

  const range = document.createRange();

  interface Fragment {
    entry: { node: Text; start: number; end: number };
    rect: DOMRect;
    distY: number;
    distX: number;
  }

  const fragments: Fragment[] = [];
  let minDistY = Infinity;

  for (const entry of entries) {
    range.selectNodeContents(entry.node);
    const rects = range.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      if (rect.width <= 0 && rect.height <= 0) continue;
      const distY = clientY < rect.top
        ? rect.top - clientY
        : clientY > rect.bottom
          ? clientY - rect.bottom
          : 0;
      const distX = clientX < rect.left
        ? rect.left - clientX
        : clientX > rect.right
          ? clientX - rect.right
          : 0;

      if (distY < minDistY) {
        minDistY = distY;
      }
      fragments.push({ entry, rect, distY, distX });
    }
  }

  if (fragments.length === 0) return 0;

  const lineCandidates = fragments.filter((f) => f.distY <= minDistY + 3);

  let best = lineCandidates[0];
  let minX = best.distX;
  for (let i = 1; i < lineCandidates.length; i++) {
    const c = lineCandidates[i];
    if (c.distX < minX) {
      minX = c.distX;
      best = c;
    }
  }

  return findOffsetInNode(range, best.entry, best.rect, clientX);
}

function getAnnotationTextSegments(
  rawText: string,
  start: number,
  end: number,
): Array<{ start: number; end: number }> {
  if (start >= end) return [];
  const segments: Array<{ start: number; end: number }> = [];
  const span = rawText.slice(start, end);
  const regex = /\n{2,}/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(span)) !== null) {
    if (match.index > last) {
      segments.push({
        start: start + last,
        end: start + match.index,
      });
    }
    last = match.index + match[0].length;
  }

  if (last < span.length) {
    segments.push({
      start: start + last,
      end: end,
    });
  }

  return segments;
}

export default function Home() {
  const [activePage, setActivePage] = useState(0);
  const lang = useSyncExternalStore(subscribeLang, getLangSnapshot, getServerLangSnapshot);
  const setLang = (next: Lang) => {
    try {
      window.localStorage.setItem("fi-lang", next);
    } catch {
    }
    langSubscribers.forEach((listener) => listener());
    document.documentElement.lang = next;
  };
  const t = dictionaries[lang];
  const numberLocale = lang === "en" ? "en-US" : "it-IT";
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [activeInterviewId, setActiveInterviewId] = useState("");
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [lexicalEntries, setLexicalEntries] = useState<LexicalEntryOption[]>([]);
  const [lexicalEntriesLoading, setLexicalEntriesLoading] = useState(false);
  const [lexicalEntriesError, setLexicalEntriesError] = useState("");
  const [selectedConcepts, setSelectedConcepts] = useState<string[]>([]);
  const [conceptSelections, setConceptSelections] = useState<Record<string, ConceptSelection>>({});
  const [originalEditingConcepts, setOriginalEditingConcepts] = useState<Record<string, AnnotationConcept>>({});
  const [removedList, setRemovedList] = useState<string[]>([]);
  const [addedList, setAddedList] = useState<string[]>([]);
  const [updatedList, setUpdatedList] = useState<Record<string, UpdatedAttestationSelection>>({});
  const [locusEditing, setLocusEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [archiveError, setArchiveError] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [searchView, setSearchView] = useState<SearchType | null>(null);
  const [lastSearch, setLastSearch] = useState<SearchState | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchFilters, setSearchFilters] = useState({ doc: "", left: "", keyword: "", right: "" });
  const [searchPage, setSearchPage] = useState(0);
  const [pendingScroll, setPendingScroll] = useState<{ start: number; end: number } | null>(null);
  const [conceptQuery, setConceptQuery] = useState("");
  const [conceptSelected, setConceptSelected] = useState<LexicalConcept | null>(null);
  const [conceptListOpen, setConceptListOpen] = useState(false);
  const [entryQuery, setEntryQuery] = useState("");
  const [entrySelected, setEntrySelected] = useState<LexicalEntryOption | null>(null);
  const [entryListOpen, setEntryListOpen] = useState(false);
  const [concepts, setConcepts] = useState<LexicalConcept[]>([]);
  const [conceptTotalHits, setConceptTotalHits] = useState(0);
  const [conceptsLoading, setConceptsLoading] = useState(false);
  const [conceptsError, setConceptsError] = useState("");
  const [conceptSearchQuery, setConceptSearchQuery] = useState("");
  const [creatingConcept, setCreatingConcept] = useState(false);
  const [newConceptLabel, setNewConceptLabel] = useState("");
  const [conceptCreating, setConceptCreating] = useState(false);
  const [editingConceptUrl, setEditingConceptUrl] = useState("");
  const [editedConceptLabel, setEditedConceptLabel] = useState("");
  const [savingConceptUrl, setSavingConceptUrl] = useState("");
  const [growlMessage, setGrowlMessage] = useState("");
  const [growlTone, setGrowlTone] = useState<"error" | "notice">("error");
  const [attestationSaving, setAttestationSaving] = useState(false);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [dirtySwitchOpen, setDirtySwitchOpen] = useState(false);
  const [workspaceUnlocked, setWorkspaceUnlocked] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);
  const [locusDragging, setLocusDragging] = useState(false);
  const [hoveredTooltip, setHoveredTooltip] = useState<{ annotation: Annotation; x: number; y: number } | null>(null);
  const [conceptFilter, setConceptFilter] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; concept: LexicalConcept } | null>(null);
  const [conceptToDelete, setConceptToDelete] = useState<LexicalConcept | null>(null);
  const [conceptDeleting, setConceptDeleting] = useState(false);
  const [interviewToDelete, setInterviewToDelete] = useState<Interview | null>(null);
  const [textDeleting, setTextDeleting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedInterviewIds, setSelectedInterviewIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeletionProgress, setBulkDeletionProgress] = useState<{ deleted: number; total: number } | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const conceptFilterClickTimer = useRef<number | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const annotatedWrapRef = useRef<HTMLDivElement>(null);
  const annotationLayerRef = useRef<HTMLDivElement>(null);
  const conceptSidebarRef = useRef<HTMLElement>(null);
  const conceptListRef = useRef<HTMLDivElement>(null);
  const annotationActionsRef = useRef<HTMLDivElement>(null);
  const confirmDeleteRef = useRef<HTMLDivElement>(null);
  const conceptConfirmRef = useRef<HTMLDivElement>(null);
  const textConfirmRef = useRef<HTMLDivElement>(null);
  const bulkDeleteRef = useRef<HTMLDivElement>(null);
  const dirtySwitchRef = useRef<HTMLDivElement>(null);
  const dirtySwitchTargetRef = useRef<Annotation | null>(null);
  const passwordModalRef = useRef<HTMLDivElement>(null);
  const textRequestId = useRef(0);
  const activeInterviewIdRef = useRef("");
  const conceptsRequestId = useRef(0);
  const lexicalSenseTypesRequestIds = useRef<Record<string, number>>({});
  const growlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const corpusTextsRef = useRef<Map<string, string> | null>(null);
  const searchFlashRef = useRef<HTMLDivElement[]>([]);
  const conceptComboRef = useRef<HTMLDivElement>(null);
  const entryComboRef = useRef<HTMLDivElement>(null);
  const locusDragEndpoint = useRef<"start" | "end" | null>(null);
  const dragBoundsRef = useRef<{ start: number; end: number } | null>(null);
  const locusOutsidePointerStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (sessionStorage.getItem(workspaceUnlockedKey) === "1") setWorkspaceUnlocked(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const activeInterview = interviews.find((item) => item.id === activeInterviewId) ?? interviews[0];
  const text = activeInterview?.text ?? "";
  const fileName = activeInterview?.name ?? t.document.noInterview;
  const annotations = useMemo(
    () => activeInterview?.annotations ?? [],
    [activeInterview],
  );
  const filteredAnnotations = useMemo(
    () => conceptFilter
      ? annotations.filter((annotation) =>
          annotation.concepts.some((c) => c.lexicalConcept === conceptFilter),
        )
      : annotations,
    [annotations, conceptFilter],
  );
  const filteredConceptLabel = conceptFilter
    ? concepts.find((c) => c.lexicalConcept === conceptFilter)?.defaultLabel ?? ""
    : "";
  const description = activeInterview?.description?.trim() ?? "";
  const normalizedInterviewQuery = searchQuery.trim().toLocaleLowerCase("it-IT");
  const filteredInterviews = normalizedInterviewQuery
    ? interviews.filter((interview) =>
        interview.name.toLocaleLowerCase("it-IT").includes(normalizedInterviewQuery)
        || (interview.metadataId ?? "").toLocaleLowerCase("it-IT").includes(normalizedInterviewQuery),
      )
    : interviews;
  const filteredConcepts = concepts.filter((concept) =>
    concept.defaultLabel.toLocaleLowerCase("it").includes(conceptSearchQuery.trim().toLocaleLowerCase("it")),
  );
  const filteredSearchRows = useMemo(() => {
    if (!lastSearch) return [];
    const normalize = (value: string) => value.trim().toLocaleLowerCase("it-IT");
    const doc = normalize(searchFilters.doc);
    const left = normalize(searchFilters.left);
    const keyword = normalize(searchFilters.keyword);
    const right = normalize(searchFilters.right);
    return lastSearch.rows.filter((row) =>
      (!doc || row.docLabel.toLocaleLowerCase("it-IT").includes(doc))
      && (!left || row.left.toLocaleLowerCase("it-IT").includes(left))
      && (!keyword || (lastSearch.type === "forma"
        ? row.keyword.toLocaleLowerCase("it-IT").includes(keyword)
        : `${row.left} ${row.keyword} ${row.right}`.toLocaleLowerCase("it-IT").includes(keyword)))
      && (!right || row.right.toLocaleLowerCase("it-IT").includes(right)));
  }, [lastSearch, searchFilters]);
  const searchPages = Math.max(1, Math.ceil(filteredSearchRows.length / SEARCH_PAGE_SIZE));
  const safeSearchPage = Math.min(searchPage, searchPages - 1);
  const matchingConcepts = useMemo(() => {
    const query = conceptQuery.trim().toLocaleLowerCase("it");
    return query
      ? concepts.filter((concept) => concept.defaultLabel.toLocaleLowerCase("it").includes(query))
      : concepts;
  }, [conceptQuery, concepts]);
  const matchingEntries = useMemo(() => {
    const query = entryQuery.trim().toLocaleLowerCase("it");
    return query
      ? lexicalEntries.filter((entry) => entry.label.toLocaleLowerCase("it").includes(query))
      : lexicalEntries;
  }, [entryQuery, lexicalEntries]);
  const selectedConceptsConfigured = selectedConcepts.length > 0 && selectedConcepts.every((lexicalConcept) => {
    const conceptSelection = conceptSelections[lexicalConcept];
    return Boolean(conceptSelection?.lexicalEntry && conceptSelection.sensesReady && (
      (conceptSelection.relationType === "paradigmatico" && conceptSelection.paradigmaticSense)
      || (conceptSelection.relationType === "narrativo"
        && conceptSelection.narrativeSense
        && conceptSelection.polarity
        && conceptSelection.definitionType)
    ));
  });
  const editingAttestation = selection?.mode === "edit";
  const workspaceVisible = activePage === 4;
  const editingAnnotationIndex = useMemo(() => {
    if (selection?.mode !== "edit") return -1;
    const sourceStart = selection.sourceStart ?? selection.start;
    const sourceEnd = selection.sourceEnd ?? selection.end;
    return annotations.findIndex((annotation) =>
      annotation.start === sourceStart && annotation.end === sourceEnd,
    );
  }, [annotations, selection]);
  const editDirty = removedList.length > 0 || addedList.length > 0 || Object.keys(updatedList).length > 0;
  const locusDirty = locusEditing && selection?.mode === "edit"
    && (selection.start !== (selection.sourceStart ?? selection.start)
      || selection.end !== (selection.sourceEnd ?? selection.end));
  const addedConceptsConfigured = addedList.every((lexicalConcept) => {
    const conceptSelection = conceptSelections[lexicalConcept];
    return Boolean(conceptSelection?.lexicalEntry && conceptSelection.sensesReady && (
      (conceptSelection.relationType === "paradigmatico" && conceptSelection.paradigmaticSense)
      || (conceptSelection.relationType === "narrativo"
        && conceptSelection.narrativeSense
        && conceptSelection.polarity
        && conceptSelection.definitionType)
    ));
  });
  const conceptSelectionActive = Boolean(selection);
  const creationPayloadReady = selectedConceptsConfigured;
  const annotationActionReady = editingAttestation ? editDirty && addedConceptsConfigured : creationPayloadReady;

  const showError = useCallback((message: string) => {
    setGrowlTone("error");
    setGrowlMessage(message);
    if (growlTimer.current) clearTimeout(growlTimer.current);
    growlTimer.current = setTimeout(() => setGrowlMessage(""), 6000);
  }, []);

  const showNotice = useCallback((message: string) => {
    setGrowlTone("notice");
    setGrowlMessage(message);
    if (growlTimer.current) clearTimeout(growlTimer.current);
    growlTimer.current = setTimeout(() => setGrowlMessage(""), 6000);
  }, []);

  const resetSelectionFlow = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setConfirmDeleteOpen(false);
    setLexicalEntries([]);
    setLexicalEntriesError("");
    lexicalSenseTypesRequestIds.current = {};
    setSelectedConcepts([]);
    setConceptSelections({});
    setOriginalEditingConcepts({});
    setRemovedList([]);
    setAddedList([]);
    setUpdatedList({});
    setLocusEditing(false);
    setLocusDragging(false);
  }, []);

  const loadCanonicalText = useCallback(async (interviewId: string) => {
    const t = dictionaries[getLangSnapshot()];
    const requestId = ++textRequestId.current;
    setTextError("");
    setTextLoading(true);
    try {
      const [canonicalResult, attestationsResult] = await Promise.allSettled([
        (async () => {
          const response = await fetch(
            `${basePath}/api/lexo/texts/${encodeURIComponent(interviewId)}/canonical`,
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
        showError(t.messages.attestationsLoadError(attestationsResult.reason instanceof Error
          ? attestationsResult.reason.message
          : t.concepts.unknownError));
      }
    } catch (error) {
      if (requestId !== textRequestId.current) return;
      setTextError(t.document.textLoadError(error instanceof Error ? error.message : t.concepts.unknownError));
    } finally {
      if (requestId === textRequestId.current) setTextLoading(false);
    }
  }, [showError]);

  const loadArchive = useCallback(async (preferredInterviewId?: string) => {
    const t = dictionaries[getLangSnapshot()];
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
        const rawMetadataId = metadata.id
          ?? (Array.isArray(metadataValues.id) ? metadataValues.id[0] : metadataValues.id);
        const metadataId = readResourceIdentifier(rawMetadataId);

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
          metadataId: metadataId || undefined,
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
      setArchiveError(t.archive.loadError(error instanceof Error ? error.message : t.concepts.unknownError));
      setTextLoading(false);
      return false;
    } finally {
      setArchiveLoading(false);
    }
  }, [loadCanonicalText]);

  const loadConcepts = useCallback(async () => {
    const t = dictionaries[getLangSnapshot()];
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
      setConceptsError(t.concepts.loadError(error instanceof Error ? error.message : t.concepts.unknownError));
    } finally {
      if (requestId === conceptsRequestId.current) setConceptsLoading(false);
    }
  }, []);

  const loadLexicalEntries = useCallback(async () => {
    const t = dictionaries[getLangSnapshot()];
    setLexicalEntries([]);
    setLexicalEntriesError("");
    setLexicalEntriesLoading(true);
    try {
      const response = await fetch(lexicalEntriesEndpoint, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(detail || `HTTP ${response.status}`);
      }
      setLexicalEntries(parseLexicalEntries(await response.json() as unknown));
    } catch (error) {
      setLexicalEntriesError(error instanceof Error ? error.message : t.concepts.unknownError);
    } finally {
      setLexicalEntriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hoveredTooltip) return;
    if (lexicalEntries.length > 0 || lexicalEntriesLoading || lexicalEntriesError) return;
    const timer = setTimeout(() => void loadLexicalEntries(), 0);
    return () => clearTimeout(timer);
  }, [hoveredTooltip, lexicalEntries, lexicalEntriesError, lexicalEntriesLoading, loadLexicalEntries]);

  async function selectLexicalEntryOption(lexicalConcept: string, lexicalEntryIri: string) {
    const lexicalEntry = lexicalEntries.find((entry) => entry.entry === lexicalEntryIri);
    const requestId = (lexicalSenseTypesRequestIds.current[lexicalConcept] ?? 0) + 1;
    lexicalSenseTypesRequestIds.current[lexicalConcept] = requestId;
    setConceptSelections((current) => ({
      ...current,
      [lexicalConcept]: lexicalEntry
        ? {
            ...emptyConceptSelection(lexicalConcept),
            lexicalEntry: lexicalEntry.entry,
            sensesLoading: true,
          }
        : emptyConceptSelection(lexicalConcept),
    }));
    if (!lexicalEntry) return;
    try {
      const senseTypes = await Promise.all(lexicalEntry.senses.map(async (sense) => {
        const parameters = new URLSearchParams({ resource: sense });
        const response = await fetch(`${metadataEndpoint}?${parameters.toString()}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) {
          const detail = (await response.text()).trim();
          throw new Error(detail || `HTTP ${response.status}`);
        }
        return parseSenseTypes(await response.json() as unknown, sense);
      }));
      if (requestId !== lexicalSenseTypesRequestIds.current[lexicalConcept]) return;
      const flattenedSenseTypes = senseTypes.flat();
      const narrativeSense = flattenedSenseTypes.find(({ type }) => {
        const normalizedType = normalizedSenseType(type);
        return normalizedType === "narrativo" || normalizedType === "narrative";
      })?.sense ?? "";
      const paradigmaticSense = flattenedSenseTypes.find(({ type }) => {
        const normalizedType = normalizedSenseType(type);
        return normalizedType === "paradigmatico" || normalizedType === "paradigmatic";
      })?.sense ?? "";
      setConceptSelections((current) => ({
        ...current,
        [lexicalConcept]: {
          ...(current[lexicalConcept] ?? emptyConceptSelection(lexicalConcept)),
          lexicalEntry: lexicalEntry.entry,
          narrativeSense,
          paradigmaticSense,
          sensesLoading: false,
          sensesReady: true,
          sensesError: "",
        },
      }));
    } catch (error) {
      if (requestId !== lexicalSenseTypesRequestIds.current[lexicalConcept]) return;
      const message = error instanceof Error ? error.message : t.concepts.unknownError;
      setConceptSelections((current) => ({
        ...current,
        [lexicalConcept]: {
          ...(current[lexicalConcept] ?? emptyConceptSelection(lexicalConcept)),
          lexicalEntry: lexicalEntry.entry,
          sensesLoading: false,
          sensesReady: false,
          sensesError: message,
        },
      }));
      showError(t.messages.senseMetadataError(message));
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void loadArchive(), 0);
    return () => clearTimeout(timer);
  }, [loadArchive]);

  useEffect(() => {
    if (!confirmDeleteOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    confirmDeleteRef.current
      ?.querySelector<HTMLButtonElement>("[data-confirm-cancel]")
      ?.focus();
    return () => previousFocus?.focus();
  }, [confirmDeleteOpen]);

  useEffect(() => {
    if (!confirmDeleteOpen) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setConfirmDeleteOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDeleteOpen]);

  useEffect(() => {
    if (!dirtySwitchOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    dirtySwitchRef.current
      ?.querySelector<HTMLButtonElement>("[data-dirty-cancel]")
      ?.focus();
    return () => previousFocus?.focus();
  }, [dirtySwitchOpen]);

  useEffect(() => {
    if (!dirtySwitchOpen) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      dirtySwitchTargetRef.current = null;
      setDirtySwitchOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dirtySwitchOpen]);

  useEffect(() => {
    if (!passwordOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    passwordModalRef.current
      ?.querySelector<HTMLInputElement>("input[type=password]")
      ?.focus();
    return () => previousFocus?.focus();
  }, [passwordOpen]);

  useEffect(() => {
    if (!passwordOpen) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPasswordOpen(false);
      setPasswordValue("");
      setPasswordError("");
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [passwordOpen]);

  async function verifyWorkspacePassword(event: React.FormEvent) {
    event.preventDefault();
    if (passwordPending || !passwordValue) return;
    setPasswordPending(true);
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(passwordValue));
      const hex = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      if (hex === workspacePasswordHash) {
        sessionStorage.setItem(workspaceUnlockedKey, "1");
        setWorkspaceUnlocked(true);
        setPasswordOpen(false);
        setPasswordValue("");
        setPasswordError("");
        setActivePage(4);
        void loadConcepts();
      } else {
        setPasswordError(dictionaries[getLangSnapshot()].modals.passwordError);
        setPasswordValue("");
        passwordModalRef.current?.querySelector<HTMLInputElement>("input[type=password]")?.focus();
      }
    } finally {
      setPasswordPending(false);
    }
  }

  useEffect(() => {
    if (!conceptToDelete) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    conceptConfirmRef.current
      ?.querySelector<HTMLButtonElement>("[data-concept-confirm-cancel]")
      ?.focus();
    return () => previousFocus?.focus();
  }, [conceptToDelete]);

  useEffect(() => {
    if (!conceptToDelete) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setConceptToDelete(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [conceptToDelete]);

  useEffect(() => {
    if (!interviewToDelete) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    textConfirmRef.current
      ?.querySelector<HTMLButtonElement>("[data-text-confirm-cancel]")
      ?.focus();
    return () => previousFocus?.focus();
  }, [interviewToDelete]);

  useEffect(() => {
    if (!interviewToDelete) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setInterviewToDelete(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [interviewToDelete]);

  useEffect(() => {
    if (!bulkDeleteOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    bulkDeleteRef.current
      ?.querySelector<HTMLButtonElement>("[data-bulk-confirm-cancel]")
      ?.focus();
    return () => previousFocus?.focus();
  }, [bulkDeleteOpen]);

  useEffect(() => {
    if (!bulkDeleteOpen) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !bulkDeleting) setBulkDeleteOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [bulkDeleteOpen, bulkDeleting]);

  useEffect(() => () => {
    if (growlTimer.current) clearTimeout(growlTimer.current);
  }, []);

  const [layerTick, setLayerTick] = useState(0);

  const scrollConceptIntoView = useCallback((conceptIri: string) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = conceptListRef.current;
        if (!container || !conceptIri) return;
        const item = Array.from(container.querySelectorAll<HTMLElement>("[data-concept-iri]"))
          .find((element) => element.dataset.conceptIri === conceptIri);
        if (!item) return;
        const containerRect = container.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        const margin = 10;
        const deltaTop = itemRect.top - containerRect.top - margin;
        const deltaBottom = itemRect.bottom - containerRect.bottom + margin;
        const delta = deltaTop < 0
          ? deltaTop
          : deltaBottom > 0
            ? Math.min(deltaBottom, deltaTop)
            : 0;
        if (delta !== 0) {
          container.scrollBy({ top: delta, behavior: "smooth" });
        }
      });
    });
  }, []);

  const openAnnotationEditor = useCallback((annotation: Annotation, target?: HTMLElement) => {
    const wrap = annotatedWrapRef.current;
    let targetRect: DOMRect | null = null;
    if (wrap) {
      const entries = getTextNodeEntries(wrap);
      if (entries.length > 0) {
        const segs = getAnnotationTextSegments(text, annotation.start, annotation.end);
        const firstSeg = segs.length > 0 ? segs[0] : { start: annotation.start, end: annotation.end };
        const range = createRangeForOffsets(entries, firstSeg.start, firstSeg.end);
        const rects = Array.from(range.getClientRects());
        if (rects.length > 0) {
          targetRect = rects[0];
        }
      }
    }
    if (!targetRect && target) {
      targetRect = target.getBoundingClientRect();
    }
    const rect = targetRect ?? {
      left: window.innerWidth / 2 - 70,
      top: 160,
      width: 140,
      height: 24,
    };

    const knownConcepts = annotation.concepts.filter((annotationConcept) =>
      concepts.some((concept) => concept.lexicalConcept === annotationConcept.lexicalConcept),
    );
    setDragging(false);
    window.getSelection()?.removeAllRanges();
    lexicalSenseTypesRequestIds.current = {};
    setConceptSearchQuery("");
    setSelectedConcepts(knownConcepts.map((concept) => concept.lexicalConcept));
    setConceptSelections(Object.fromEntries(
      knownConcepts.map((concept) => [concept.lexicalConcept, {
        ...emptyConceptSelection(concept.lexicalConcept),
        ...concept.options,
        sensesReady: true,
      }]),
    ));
    setOriginalEditingConcepts(Object.fromEntries(
      knownConcepts.map((concept) => [concept.lexicalConcept, concept]),
    ));
    setRemovedList([]);
    setAddedList([]);
    setUpdatedList({});
    setLocusEditing(true);
    setLocusDragging(false);
    const wrapRect = wrap?.getBoundingClientRect();
    const relLeft = wrapRect && targetRect ? targetRect.left - wrapRect.left : rect.left;
    const relTop = wrapRect && targetRect ? targetRect.top - wrapRect.top : rect.top;
    const posX = Math.max(12, relLeft + rect.width / 2 - 45);
    const posY = locusBarY(relTop, rect.height, wrapRect?.height);

    setSelection({
      start: annotation.start,
      end: annotation.end,
      text: text.slice(annotation.start, annotation.end),
      x: posX,
      y: posY,
      actionX: posX,
      mode: "edit",
      sourceStart: annotation.start,
      sourceEnd: annotation.end,
      locusIri: annotation.locusIri,
    });
    const firstSelectedConcept = concepts.find((concept) =>
      knownConcepts.some((known) => known.lexicalConcept === concept.lexicalConcept),
    )?.lexicalConcept;
    if (firstSelectedConcept) scrollConceptIntoView(firstSelectedConcept);
    void loadLexicalEntries();
  }, [concepts, loadLexicalEntries, scrollConceptIntoView, text]);

  const editAnnotation = useCallback((annotation: Annotation, target?: HTMLElement) => {
    if (attestationSaving) return;
    if (locusEditing && editDirty) {
      dirtySwitchTargetRef.current = annotation;
      setDirtySwitchOpen(true);
      return;
    }
    openAnnotationEditor(annotation, target);
  }, [attestationSaving, editDirty, locusEditing, openAnnotationEditor]);

  function confirmDirtySwitch() {
    const target = dirtySwitchTargetRef.current;
    dirtySwitchTargetRef.current = null;
    setDirtySwitchOpen(false);
    resetSelectionFlow();
    if (target) openAnnotationEditor(target);
  }

  function cancelDirtySwitch() {
    dirtySwitchTargetRef.current = null;
    setDirtySwitchOpen(false);
  }

  const nudgeLocusEndpoint = useCallback((endpoint: "start" | "end", delta: number) => {
    setSelection((current) => {
      if (!current || current.mode !== "edit") return current;
      const nextStart = endpoint === "start"
        ? Math.min(Math.max(0, current.start + delta), current.end - 1)
        : current.start;
      const nextEnd = endpoint === "end"
        ? Math.max(Math.min(text.length, current.end + delta), current.start + 1)
        : current.end;
      return {
        ...current,
        start: nextStart,
        end: nextEnd,
        text: text.slice(nextStart, nextEnd),
      };
    });
  }, [text]);

  const drawAnnotationsLayer = useCallback(() => {
    const t = dictionaries[getLangSnapshot()];
    const wrap = annotatedWrapRef.current;
    const layer = annotationLayerRef.current;
    if (!wrap || !layer) return;
    if (textLoading || textError) {
      layer.replaceChildren();
      return;
    }

    const entries = getTextNodeEntries(wrap);
    if (entries.length === 0) {
      layer.replaceChildren();
      return;
    }

    const wrapRect = wrap.getBoundingClientRect();
    const barHeight = 4;
    const barGap = 2;

    layer.replaceChildren();

    interface AnnotationJob {
      annotation: Annotation;
      index: number;
      start: number;
      end: number;
    }

    const jobs: AnnotationJob[] = [];
    annotations.forEach((annotation, index) => {
      if (conceptFilter && !annotation.concepts.some((c) => c.lexicalConcept === conceptFilter)) return;
      const isEditingThis = locusEditing && selection?.mode === "edit" && index === editingAnnotationIndex;
      if (!isEditingThis) {
        const textSegs = getAnnotationTextSegments(text, annotation.start, annotation.end);
        for (const seg of textSegs) {
          jobs.push({
            annotation,
            index,
            start: seg.start,
            end: seg.end,
          });
        }
      }
    });

    // 1. Build non-overlapping highlight segments so overlapping yellow highlights NEVER double-multiply or darken
    const bounds = Array.from(new Set(jobs.flatMap((j) => [j.start, j.end]))).sort((a, b) => a - b);
    for (let i = 0; i < bounds.length - 1; i++) {
      const segStart = bounds[i];
      const segEnd = bounds[i + 1];
      if (segStart >= segEnd) continue;
      const active = jobs.filter((j) => j.start <= segStart && j.end >= segEnd);
      if (active.length === 0) continue;

      const range = createRangeForOffsets(entries, segStart, segEnd);
      const rects = Array.from(range.getClientRects());
      if (rects.length === 0) continue;

      const isSingle = active.length === 1;
      const primaryJob = active[0];

      rects.forEach((rect) => {
        if (rect.width <= 0 || rect.height <= 0) return;
        const highlightEl = document.createElement("div");
        highlightEl.className = `annotation-highlight${isSingle ? "" : " overlap"}${isSingle && primaryJob.index === editingAnnotationIndex ? " editing" : ""}`;
        if (isSingle) {
          highlightEl.setAttribute("data-annotation-index", String(primaryJob.index));
          highlightEl.setAttribute("role", "button");
          highlightEl.setAttribute("tabindex", "0");
          highlightEl.setAttribute("aria-label", t.document.editAria(primaryJob.annotation.label.replace(/\n/g, ", ")));
          highlightEl.title = t.document.editTitle;
        }
        highlightEl.style.left = `${rect.left - wrapRect.left}px`;
        highlightEl.style.top = `${rect.top - wrapRect.top}px`;
        highlightEl.style.width = `${rect.width}px`;
        highlightEl.style.height = `${rect.height}px`;

        highlightEl.onmousedown = (event) => {
          event.stopPropagation();
        };

        if (isSingle) {
          highlightEl.onclick = (event) => {
            event.stopPropagation();
            editAnnotation(primaryJob.annotation, highlightEl);
          };
          highlightEl.onkeydown = (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              editAnnotation(primaryJob.annotation, highlightEl);
            }
          };
        } else {
          highlightEl.onclick = (event) => {
            event.stopPropagation();
          };
        }

        layer.appendChild(highlightEl);
      });
    }

    // 2. Render stacked bars for each annotation
    const pending = new Map<string, { left: number; right: number; top: number }[]>();
    annotations.forEach((annotation, index) => {
      if (conceptFilter && !annotation.concepts.some((c) => c.lexicalConcept === conceptFilter)) return;
      const textSegs = getAnnotationTextSegments(text, annotation.start, annotation.end);
      for (const seg of textSegs) {
        const range = createRangeForOffsets(entries, seg.start, seg.end);
        const rects = Array.from(range.getClientRects());
        for (const rect of rects) {
          if (!rect || rect.width <= 0 || rect.height <= 0) continue;
          const band = Math.round((rect.bottom - wrapRect.top) / 4);
          const key = `${band}:${index}`;
          const list = pending.get(key) ?? [];
          list.push({
            left: rect.left - wrapRect.left,
            right: rect.right - wrapRect.left,
            top: rect.bottom - wrapRect.top,
          });
          pending.set(key, list);
        }
      }
    });

    const byBand = new Map<number, Map<number, { left: number; right: number; top: number }>>();
    for (const [key, list] of pending) {
      const separator = key.indexOf(":");
      const band = Number(key.slice(0, separator));
      const index = Number(key.slice(separator + 1));
      const merged = list.reduce<{ left: number; right: number; top: number }>((acc, rect) => ({
        left: Math.min(acc.left, rect.left),
        right: Math.max(acc.right, rect.right),
        top: acc.top,
      }), { left: Infinity, right: -Infinity, top: list[0].top });
      let indexMap = byBand.get(band);
      if (!indexMap) {
        indexMap = new Map();
        byBand.set(band, indexMap);
      }
      indexMap.set(index, merged);
    }

    for (const [band, indexMap] of byBand) {
      const existing = Array.from(layer.children).filter((el) => el.getAttribute("data-band") === String(band));
      const placed = existing.map((el) => ({
        left: Number(el.getAttribute("data-left") ?? 0),
        right: Number(el.getAttribute("data-right") ?? 0),
        level: Number(el.getAttribute("data-level") ?? 0),
      }));
      const entriesList = Array.from(indexMap.entries()).sort((a, b) => a[1].left - b[1].left);
      for (const [index, bar] of entriesList) {
        let level = 0;
        while (placed.some((p) => p.level === level && p.left < bar.right && bar.left < p.right)) level++;
        const barEl = document.createElement("div");
        barEl.className = `bar${index === editingAnnotationIndex ? " selected" : ""}`;
        barEl.setAttribute("data-annotation", String(index));
        barEl.setAttribute("data-band", String(band));
        barEl.setAttribute("data-level", String(level));
        barEl.setAttribute("data-left", String(bar.left));
        barEl.setAttribute("data-right", String(bar.right));
        barEl.setAttribute("role", "button");
        barEl.setAttribute("tabindex", "0");
        const label = annotations[index]?.label ?? "";
        barEl.setAttribute("aria-label", label ? t.document.editAria(label) : t.document.editTitle);
        barEl.title = label || t.document.editTitle;
        barEl.style.left = `${bar.left}px`;
        barEl.style.top = `${bar.top + level * (barHeight + barGap)}px`;
        barEl.style.width = `${bar.right - bar.left}px`;
        barEl.onmousedown = (event) => {
          event.stopPropagation();
        };
        barEl.onmouseenter = () => {
          const annotation = annotations[index];
          if (!annotation || dragging || locusDragging) return;
          if (locusEditing && index === editingAnnotationIndex) return;
          setHoveredTooltip({
            annotation,
            x: bar.left + (bar.right - bar.left) / 2,
            y: bar.top - 2,
          });
        };
        barEl.onmouseleave = () => {
          setHoveredTooltip(null);
        };
        barEl.onclick = (event) => {
          event.stopPropagation();
          const annotation = annotations[index];
          if (!annotation) return;
          editAnnotation(annotation, barEl);
        };
        barEl.onkeydown = (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          const annotation = annotations[index];
          if (!annotation) return;
          editAnnotation(annotation, barEl);
        };
        layer.appendChild(barEl);
        placed.push({ left: bar.left, right: bar.right, level });
      }
    }

    if (locusEditing && selection?.mode === "edit") {
      const activeStart = locusDragging && dragBoundsRef.current ? dragBoundsRef.current.start : selection.start;
      const activeEnd = locusDragging && dragBoundsRef.current ? dragBoundsRef.current.end : selection.end;

      const activeSegs = getAnnotationTextSegments(text, activeStart, activeEnd);
      for (const seg of activeSegs) {
        const locusRange = createRangeForOffsets(entries, seg.start, seg.end);
        const locusRects = Array.from(locusRange.getClientRects());

        for (const r of locusRects) {
          if (r.width <= 0 || r.height <= 0) continue;
          const box = document.createElement("div");
          box.className = "locus-editing-highlight";
          box.style.left = `${r.left - wrapRect.left}px`;
          box.style.top = `${r.top - wrapRect.top}px`;
          box.style.width = `${r.width}px`;
          box.style.height = `${r.height}px`;
          layer.appendChild(box);
        }
      }

      const startPt = getHandlePoint(entries, activeStart, "start");
      const startHandle = document.createElement("span");
      startHandle.className = "locus-handle locus-handle-start";
      startHandle.setAttribute("role", "slider");
      startHandle.setAttribute("tabindex", "0");
      startHandle.setAttribute("aria-label", "Sposta l’inizio dell’evidenziazione");
      startHandle.style.left = `${startPt.x - wrapRect.left}px`;
      startHandle.style.top = `${startPt.y - wrapRect.top}px`;
      startHandle.style.height = `${startPt.height || 24}px`;
      startHandle.onpointerdown = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setLocusDragging(true);
        locusDragEndpoint.current = "start";
        dragBoundsRef.current = { start: activeStart, end: activeEnd };
      };
      startHandle.onkeydown = (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        event.stopPropagation();
        nudgeLocusEndpoint("start", event.key === "ArrowLeft" ? -1 : 1);
      };
      layer.appendChild(startHandle);

      const endPt = getHandlePoint(entries, activeEnd, "end");
      const endHandle = document.createElement("span");
      endHandle.className = "locus-handle locus-handle-end";
      endHandle.setAttribute("role", "slider");
      endHandle.setAttribute("tabindex", "0");
      endHandle.setAttribute("aria-label", "Sposta la fine dell’evidenziazione");
      endHandle.style.left = `${endPt.x - wrapRect.left}px`;
      endHandle.style.top = `${endPt.y - wrapRect.top}px`;
      endHandle.style.height = `${endPt.height || 24}px`;
      endHandle.onpointerdown = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setLocusDragging(true);
        locusDragEndpoint.current = "end";
        dragBoundsRef.current = { start: activeStart, end: activeEnd };
      };
      endHandle.onkeydown = (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        event.stopPropagation();
        nudgeLocusEndpoint("end", event.key === "ArrowLeft" ? -1 : 1);
      };
      layer.appendChild(endHandle);
    }
  }, [annotations, conceptFilter, dragging, editAnnotation, editingAnnotationIndex, locusDragging, locusEditing, nudgeLocusEndpoint, selection, text, textError, textLoading]);

  useLayoutEffect(() => {
    drawAnnotationsLayer();
    if (!textLoading) {
      const frame = requestAnimationFrame(() => drawAnnotationsLayer());
      return () => cancelAnimationFrame(frame);
    }
  }, [drawAnnotationsLayer, layerTick, searchView, text, textError, textLoading, workspaceVisible]);

  useEffect(() => {
    if (!pendingScroll || searchView || textLoading || textError) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled || !pendingScroll) return;
      const wrap = annotatedWrapRef.current;
      const area = textRef.current;
      if (!wrap || !area) return;
      const entries = getTextNodeEntries(wrap);
      if (entries.length === 0) return;
      const range = createRangeForOffsets(entries, pendingScroll.start, pendingScroll.end);
      const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0);
      if (rects.length === 0) return;
      const areaRect = area.getBoundingClientRect();
      const targetTop = rects[0].top - areaRect.top + area.scrollTop - 90;
      area.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
      const layer = annotationLayerRef.current;
      if (layer) {
        const wrapRect = wrap.getBoundingClientRect();
        const flashes: HTMLDivElement[] = [];
        for (const rect of rects.slice(0, 12)) {
          const flash = document.createElement("div");
          flash.className = "search-flash";
          flash.style.left = `${rect.left - wrapRect.left}px`;
          flash.style.top = `${rect.top - wrapRect.top}px`;
          flash.style.width = `${rect.width}px`;
          flash.style.height = `${rect.height}px`;
          layer.appendChild(flash);
          flashes.push(flash);
        }
        clearSearchFlashes();
        searchFlashRef.current = flashes;
        document.addEventListener("pointerdown", clearSearchFlashes, { once: true });
      }
      setPendingScroll(null);
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [pendingScroll, searchView, text, textLoading, textError]);

  useEffect(() => {
    if (!conceptListOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && conceptComboRef.current?.contains(target)) return;
      setConceptListOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [conceptListOpen]);

  useEffect(() => {
    if (!entryListOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && entryComboRef.current?.contains(target)) return;
      setEntryListOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [entryListOpen]);

  useEffect(() => {
    const wrap = annotatedWrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => setLayerTick((tick) => tick + 1));
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [textLoading, textError]);

  useEffect(() => {
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) setLayerTick((tick) => tick + 1);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    function moveLocusEndpoint(event: PointerEvent) {
      const endpoint = locusDragEndpoint.current;
      if (!endpoint || !locusEditing || !selection) return;
      const offset = textOffsetAtPoint(annotatedWrapRef.current ?? textRef.current, event.clientX, event.clientY);
      if (offset === null) return;
      event.preventDefault();

      const baseStart = selection.start;
      const baseEnd = selection.end;
      const nextStart = endpoint === "start"
        ? Math.min(Math.max(0, offset), baseEnd - 1)
        : baseStart;
      const nextEnd = endpoint === "end"
        ? Math.max(Math.min(text.length, offset), baseStart + 1)
        : baseEnd;

      const current = dragBoundsRef.current ?? { start: baseStart, end: baseEnd };
      if (nextStart !== current.start || nextEnd !== current.end) {
        dragBoundsRef.current = { start: nextStart, end: nextEnd };
        drawAnnotationsLayer();
      }
    }

    function stopLocusDrag() {
      const endpoint = locusDragEndpoint.current;
      if (!endpoint || !locusEditing) {
        locusDragEndpoint.current = null;
        setLocusDragging(false);
        return;
      }

      const finalBounds = dragBoundsRef.current;
      locusDragEndpoint.current = null;
      setLocusDragging(false);

      if (finalBounds && selection) {
        setSelection((current) => {
          if (!current || current.mode !== "edit") return current;
          return {
            ...current,
            start: finalBounds.start,
            end: finalBounds.end,
            text: text.slice(finalBounds.start, finalBounds.end),
          };
        });
      }
    }

    document.addEventListener("pointermove", moveLocusEndpoint);
    document.addEventListener("pointerup", stopLocusDrag);
    document.addEventListener("pointercancel", stopLocusDrag);
    return () => {
      document.removeEventListener("pointermove", moveLocusEndpoint);
      document.removeEventListener("pointerup", stopLocusDrag);
      document.removeEventListener("pointercancel", stopLocusDrag);
    };
  }, [drawAnnotationsLayer, locusEditing, selection, text]);

  useEffect(() => {
    function leaveSelectionFlow(event: PointerEvent) {
      if (!selection || attestationSaving) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (locusEditing) {
        if (dirtySwitchOpen) return;
        const targetElement = target instanceof Element ? target : target.parentElement;
        if (targetElement?.closest(".bar")
          || targetElement?.closest(".locus-editing-highlight")
          || targetElement?.closest(".locus-handle")
          || annotationActionsRef.current?.contains(target)
          || dirtySwitchRef.current?.contains(target)
          || (conceptSelectionActive && conceptSidebarRef.current?.contains(target))
          || confirmDeleteRef.current?.contains(target)
          || textConfirmRef.current?.contains(target)
          || bulkDeleteRef.current?.contains(target)) return;

        if (textRef.current?.contains(target)) {
          const offset = textOffsetAtPoint(annotatedWrapRef.current ?? textRef.current, event.clientX, event.clientY);
          if (offset !== null) {
            const isOverAnnotation = annotations.some((a) =>
              (!conceptFilter || a.concepts.some((c) => c.lexicalConcept === conceptFilter))
              && a.start <= offset && offset < a.end,
            );
            if (isOverAnnotation) return;
          }
        }

        locusOutsidePointerStart.current = { x: event.clientX, y: event.clientY };
        return;
      }
      if (textRef.current?.contains(target) || annotationActionsRef.current?.contains(target)) return;
      if (conceptSelectionActive && conceptSidebarRef.current?.contains(target)) return;
      if (confirmDeleteRef.current?.contains(target)) return;
      if (textConfirmRef.current?.contains(target)) return;
      if (bulkDeleteRef.current?.contains(target)) return;
      resetSelectionFlow();
    }

    function finishOutsideLocusPointer(event: PointerEvent) {
      const start = locusOutsidePointerStart.current;
      locusOutsidePointerStart.current = null;
      if (!start || !locusEditing || dirtySwitchOpen) return;
      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (distance > 3) return;
      if (editDirty || locusDirty) {
        dirtySwitchTargetRef.current = null;
        setDirtySwitchOpen(true);
        return;
      }
      resetSelectionFlow();
    }

    document.addEventListener("pointerdown", leaveSelectionFlow);
    document.addEventListener("pointerup", finishOutsideLocusPointer);
    document.addEventListener("pointercancel", finishOutsideLocusPointer);
    return () => {
      locusOutsidePointerStart.current = null;
      document.removeEventListener("pointerdown", leaveSelectionFlow);
      document.removeEventListener("pointerup", finishOutsideLocusPointer);
      document.removeEventListener("pointercancel", finishOutsideLocusPointer);
    };
  }, [annotations, attestationSaving, conceptFilter, conceptSelectionActive, dirtySwitchOpen, editDirty, locusDirty, locusEditing, resetSelectionFlow, selection]);

  useEffect(() => {
    if (!contextMenu) return;
    function closeOnInteraction(event: Event) {
      const target = event.target;
      if (target instanceof Node && contextMenuRef.current?.contains(target)) return;
      closeConceptContextMenu();
    }
    function closeOnKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") closeConceptContextMenu();
    }
    function closeOnScroll() {
      closeConceptContextMenu();
    }
    document.addEventListener("pointerdown", closeOnInteraction);
    document.addEventListener("scroll", closeOnScroll, true);
    document.addEventListener("keydown", closeOnKey);
    return () => {
      document.removeEventListener("pointerdown", closeOnInteraction);
      document.removeEventListener("scroll", closeOnScroll, true);
      document.removeEventListener("keydown", closeOnKey);
    };
  }, [contextMenu]);

  function findConceptLabelConflict(label: string, excludeIri?: string) {
    const normalized = label.trim().toLocaleLowerCase("it");
    return concepts.find((c) =>
      c.lexicalConcept !== excludeIri
      && c.defaultLabel.trim().toLocaleLowerCase("it") === normalized,
    );
  }

  function cancelConceptCreation() {
    if (conceptCreating) return;
    setCreatingConcept(false);
    setNewConceptLabel("");
  }

  function startConceptCreation() {
    if (conceptsLoading || conceptCreating || creatingConcept) return;
    setConceptSearchQuery("");
    setNewConceptLabel("");
    setCreatingConcept(true);
  }

  async function createConcept() {
    const label = newConceptLabel.trim();
    if (!label || conceptCreating) return;
    if (findConceptLabelConflict(label)) {
      showError(t.concepts.exists(label));
      return;
    }

    setConceptCreating(true);
    try {
      const response = await fetch(lexicalConceptEndpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          label: [{ label, language: "it" }],
        }),
      });
      if (!response.ok) throw new Error(await readErrorDetail(response));

      setCreatingConcept(false);
      setNewConceptLabel("");
      await loadConcepts();
      showNotice(t.concepts.created(label));
    } catch (error) {
      showError(t.concepts.createError(error instanceof Error ? error.message : t.concepts.unknownError));
    } finally {
      setConceptCreating(false);
    }
  }

  function handleConceptCreationKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void createConcept();
    } else if (event.key === "Escape") {
      cancelConceptCreation();
    }
  }

  function startEditingConcept(concept: LexicalConcept) {
    if (savingConceptUrl || conceptCreating) return;
    cancelConceptCreation();
    setEditingConceptUrl(concept.lexicalConcept);
    setEditedConceptLabel(concept.defaultLabel);
  }

  async function saveConceptLabel(concept: LexicalConcept) {
    const target = editedConceptLabel.trim();
    if (!target || target === concept.defaultLabel) {
      setEditingConceptUrl("");
      setEditedConceptLabel("");
      return;
    }
    if (findConceptLabelConflict(target, concept.lexicalConcept)) {
      showError(t.concepts.exists(target));
      return;
    }

    setSavingConceptUrl(concept.lexicalConcept);
    try {
      const response = await fetch(lexicalConceptEndpoint, {
        method: "PATCH",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          lexicalConcept: concept.lexicalConcept,
          label: [{ label: target, language: "it" }],
        }),
      });
      const body = await response.text();
      let payload: unknown = body;
      try {
        payload = JSON.parse(body) as unknown;
      } catch {
        // La validazione successiva gestisce anche eventuali timestamp testuali.
      }
      if (!response.ok || !containsTimestamp(payload)) {
        throw new Error(response.ok
          ? "LexO-server non ha restituito un timestamp"
          : body.trim() || `HTTP ${response.status}`);
      }

      setConcepts((current) => current.map((item) => item.lexicalConcept === concept.lexicalConcept
        ? { ...item, defaultLabel: target }
        : item));
      setInterviews((current) => current.map((interview) => {
        if (interview.id !== activeInterview?.id) return interview;
        let interviewChanged = false;
        const nextAnnotations = interview.annotations.map((annotation) => {
          let annotationChanged = false;
          const nextConcepts = annotation.concepts.map((annotationConcept) => {
            if (annotationConcept.lexicalConcept !== concept.lexicalConcept) return annotationConcept;
            annotationChanged = true;
            const suffix = ` - ${concept.defaultLabel}`;
            const label = annotationConcept.label === concept.defaultLabel
              ? target
              : annotationConcept.label.endsWith(suffix)
                ? `${annotationConcept.label.slice(0, -suffix.length)} - ${target}`
                : target;
            return { ...annotationConcept, label };
          });
          if (!annotationChanged) return annotation;
          interviewChanged = true;
          return {
            ...annotation,
            concepts: nextConcepts,
            label: nextConcepts.map((annotationConcept) => annotationConcept.label).join("\n") || annotation.label,
          };
        });
        return interviewChanged ? { ...interview, annotations: nextAnnotations } : interview;
      }));
      setOriginalEditingConcepts((current) => {
        const existing = current[concept.lexicalConcept];
        return existing
          ? { ...current, [concept.lexicalConcept]: { ...existing, label: target } }
          : current;
      });
      setEditingConceptUrl("");
      setEditedConceptLabel("");
      showNotice(t.concepts.renamed(target));
    } catch (error) {
      setEditedConceptLabel(concept.defaultLabel);
      setEditingConceptUrl("");
      showError(t.concepts.renameError(error instanceof Error ? error.message : t.concepts.unknownError));
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
      setEditedConceptLabel("");
    }
  }

  async function deleteConcept(concept: LexicalConcept) {
    if (conceptDeleting) return;
    const usedInAnnotations = interviews.some((interview) =>
      interview.annotations.some((annotation) =>
        annotation.concepts.some((c) => c.lexicalConcept === concept.lexicalConcept),
      ),
    );
    if (concept.attestation > 0 || usedInAnnotations) {
      setConceptToDelete(null);
      showError(t.concepts.inUse(concept.defaultLabel));
      return;
    }

    setConceptDeleting(true);
    try {
      const parameters = new URLSearchParams({ id: concept.lexicalConcept });
      const response = await fetch(`${lexicalConceptEndpoint}?${parameters.toString()}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = await response.text();
      let payload: unknown = body;
      try {
        payload = JSON.parse(body) as unknown;
      } catch {
        // La validazione successiva gestisce anche eventuali timestamp testuali.
      }
      if (!response.ok || !containsTimestamp(payload)) {
        throw new Error(response.ok
          ? "LexO-server non ha restituito un timestamp"
          : body.trim() || `HTTP ${response.status}`);
      }

      setConceptToDelete(null);
      setConcepts((current) => current.filter((item) => item.lexicalConcept !== concept.lexicalConcept));
      setConceptFilter((current) => current === concept.lexicalConcept ? null : current);
      setSelectedConcepts((current) => current.filter((item) => item !== concept.lexicalConcept));
      setConceptSelections((current) => {
        const next = { ...current };
        delete next[concept.lexicalConcept];
        return next;
      });
      showNotice(t.concepts.deleted(concept.defaultLabel));
    } catch (error) {
      setConceptToDelete(null);
      showError(t.concepts.deleteError(error instanceof Error ? error.message : t.concepts.unknownError));
    } finally {
      setConceptDeleting(false);
    }
  }

  async function deleteText(interview: Interview) {
    if (textDeleting || attestationSaving || uploadLoading) return;
    if (interview.source !== "server") {
      setInterviewToDelete(null);
      showError(t.archive.deleteNotAllowed);
      return;
    }

    setTextDeleting(true);
    try {
      const response = await fetch(
        `${textsEndpoint}/${encodeURIComponent(interview.id)}`,
        { method: "DELETE", headers: { Accept: "application/json" }, cache: "no-store" },
      );
      if (!response.ok) throw new Error(await readErrorDetail(response));
      const payload = await response.json() as { deleted?: unknown };
      if (payload.deleted !== true) {
        throw new Error(t.archive.deleteRejected);
      }

      setInterviewToDelete(null);
      setInterviews((current) => current.filter((item) => item.id !== interview.id));
      if (activeInterview?.id === interview.id) {
        resetSelectionFlow();
        const remaining = interviews.find((item) => item.id !== interview.id && item.source === "server");
        if (remaining) {
          activeInterviewIdRef.current = remaining.id;
          setActiveInterviewId(remaining.id);
          setTextError("");
          await loadCanonicalText(remaining.id);
        } else {
          textRequestId.current += 1;
          activeInterviewIdRef.current = "";
          setActiveInterviewId("");
          setTextLoading(false);
        }
      }
      showNotice(t.archive.deleteSuccess(interview.name));
    } catch (error) {
      setInterviewToDelete(null);
      showError(t.archive.deleteError(error instanceof Error ? error.message : t.concepts.unknownError));
    } finally {
      setTextDeleting(false);
    }
  }

  function toggleSelectionMode() {
    if (bulkDeleting || archiveLoading || uploadLoading) return;
    setSelectionMode((current) => !current);
    setSelectedInterviewIds([]);
  }

  function toggleInterviewSelection(interview: Interview) {
    if (interview.source !== "server") return;
    setSelectedInterviewIds((current) => current.includes(interview.id)
      ? current.filter((item) => item !== interview.id)
      : [...current, interview.id]);
  }

  function selectAllFilteredInterviews() {
    if (bulkDeleting || archiveLoading) return;
    setSelectedInterviewIds(filteredInterviews
      .filter((interview) => interview.source === "server")
      .map((interview) => interview.id));
  }

  function clearInterviewSelection() {
    if (bulkDeleting) return;
    setSelectedInterviewIds([]);
  }

  async function deleteInterviewsBulk() {
    if (bulkDeleting || selectedInterviewIds.length === 0) return;
    if (!activeInterview) return;

    const deletingIds = [...selectedInterviewIds];
    const activeWasDeleted = deletingIds.includes(activeInterview.id);

    setBulkDeleting(true);
    setBulkDeletionProgress({ deleted: 0, total: deletingIds.length });
    setGrowlMessage("");
    try {
      const response = await fetch(`${basePath}/api/lexo/texts/bulk`, {
        method: "DELETE",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: deletingIds }),
      });
      if (!response.ok) throw new Error(await readErrorDetail(response));
      const acceptedJob = readBulkDeletionJob(await response.json() as unknown);
      if (!acceptedJob) throw new Error(t.archive.bulkNoJob);

      const completedJob = await waitForBulkDeletion(acceptedJob.bulkId, (job) => {
        setBulkDeletionProgress({ deleted: job.deleted, total: job.total });
      });

      setBulkDeleteOpen(false);
      setSelectionMode(false);
      setSelectedInterviewIds([]);
      const failures = describeBulkDeletionFailures(completedJob);

      if (completedJob.state === "FAILED") {
        showError(t.archive.bulkDeleteError(failures || completedJob.state.toLocaleLowerCase("it-IT")));
      } else if (completedJob.state === "PARTIALLY_COMPLETED") {
        showError(t.archive.bulkDeletePartial(completedJob.deleted, completedJob.failed + completedJob.notFound, failures));
      } else if (completedJob.deleted > 0) {
        showNotice(t.archive.bulkDeleteSuccess(completedJob.deleted));
      } else {
        showError(t.archive.bulkDeleteError(failures || t.concepts.unknownError));
      }

      if (activeWasDeleted) {
        resetSelectionFlow();
        textRequestId.current += 1;
      }
      await loadArchive(activeWasDeleted ? undefined : activeInterviewIdRef.current);
    } catch (error) {
      setBulkDeleteOpen(false);
      showError(error instanceof Error && error.message === BULK_DELETION_TIMEOUT
        ? t.archive.bulkTimeout
        : t.archive.bulkDeleteError(error instanceof Error ? error.message : t.concepts.unknownError));
    } finally {
      setBulkDeleting(false);
      setBulkDeletionProgress(null);
    }
  }

  function handleConceptLabelClick(concept: LexicalConcept) {
    if (conceptSelectionActive) {
      toggleConcept(concept.lexicalConcept);
      return;
    }
    if (conceptFilterClickTimer.current) window.clearTimeout(conceptFilterClickTimer.current);
    conceptFilterClickTimer.current = window.setTimeout(() => {
      conceptFilterClickTimer.current = null;
      setConceptFilter((current) => current === concept.lexicalConcept ? null : concept.lexicalConcept);
    }, 250);
  }

  function handleConceptLabelDoubleClick(concept: LexicalConcept) {
    if (conceptFilterClickTimer.current) {
      window.clearTimeout(conceptFilterClickTimer.current);
      conceptFilterClickTimer.current = null;
    }
    startEditingConcept(concept);
  }

  function openConceptContextMenu(event: React.MouseEvent, concept: LexicalConcept) {
    if (conceptSelectionActive) return;
    event.preventDefault();
    event.stopPropagation();
    closeConceptContextMenu();
    setContextMenu({ x: event.clientX, y: event.clientY, concept });
  }

  function closeConceptContextMenu() {
    setContextMenu(null);
  }

  async function selectInterview(interview: Interview) {
    if (attestationSaving || uploadLoading) return;
    activeInterviewIdRef.current = interview.id;
    setActiveInterviewId(interview.id);
    resetSelectionFlow();
    setTextError("");
    setConceptFilter(null);
    closeConceptContextMenu();
    setSearchView(null);

    if (interview.source !== "server") {
      textRequestId.current += 1;
      setTextLoading(false);
      return;
    }

    await loadCanonicalText(interview.id);
  }

  function buildImportProblems(job: BulkTextJob) {
    const lines: string[] = [];
    for (const item of job.items) {
      const name = item.originalFileName ?? item.fileId;
      if (["FAILED", "CANCELLED"].includes(item.state)) {
        lines.push(`${name}: ${item.message ?? item.state.toLocaleLowerCase("it-IT")}`);
        continue;
      }
      const unsaved = item.unsavedAttestations ?? [];
      if (unsaved.length > 0) {
        const detail = unsaved.map((unsavedItem) =>
          `${unsavedItem.id ?? unsavedItem.observable ?? "?"} (${unsavedItem.code ?? "ATTESTATION_IMPORT_FAILED"}${unsavedItem.cause ? `: ${unsavedItem.cause}` : ""})`,
        ).join("; ");
        lines.push(`${name}: ${t.archive.bulkAttestationsPartial(unsaved.length, detail)}`);
      }
    }
    return lines;
  }

  function clearSearchFlashes() {
    searchFlashRef.current.forEach((flash) => flash.remove());
    searchFlashRef.current = [];
  }

  async function ensureCorpusTexts() {
    if (corpusTextsRef.current) return corpusTextsRef.current;
    const response = await fetch(`${textsEndpoint}/corpus`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await readErrorDetail(response));
    const payload = await response.json() as { texts?: Record<string, unknown> };
    const map = new Map<string, string>();
    for (const [fileId, value] of Object.entries(payload.texts ?? {})) {
      if (typeof value === "string") map.set(fileId, value);
    }
    corpusTextsRef.current = map;
    return map;
  }

  async function runFormaSearch() {
    const query = searchInput.trim();
    if (!query || searchLoading) return;
    setSearchLoading(true);
    setGrowlMessage("");
    try {
      const corpus = await ensureCorpusTexts();
      const regex = wildcardToRegex(query);
      const rows: SearchRow[] = [];
      for (const interview of interviews) {
        if (interview.source !== "server") continue;
        const text = corpus.get(interview.id);
        if (!text) continue;
        for (const match of text.matchAll(regex)) {
          const start = match.index ?? 0;
          const end = start + match[0].length;
          if (end <= start) continue;
          const [left, right] = kwicContext(text, start, end);
          rows.push({
            fileId: interview.id,
            docLabel: interview.metadataId || interview.name,
            docTitle: interview.name,
            left,
            keyword: match[0],
            right,
            start,
            end,
          });
        }
      }
      setLastSearch({ type: "forma", query, rows });
      setSearchFilters({ doc: "", left: "", keyword: "", right: "" });
      setSearchPage(0);
    } catch (error) {
      showError(t.search.error(error instanceof Error ? error.message : t.concepts.unknownError));
    } finally {
      setSearchLoading(false);
    }
  }

  async function runConceptSearch(concept: LexicalConcept) {
    if (searchLoading) return;
    setSearchLoading(true);
    setGrowlMessage("");
    try {
      const parameters = new URLSearchParams({ observable: concept.lexicalConcept, limit: "500" });
      const response = await fetch(`${attestationsByObservableEndpoint}?${parameters.toString()}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await readErrorDetail(response));
      const payload = await response.json() as { list?: unknown };
      const items = Array.isArray(payload.list) ? payload.list : [];
      const docIndex = new Map(interviews.map((interview, index) => [interview.id, index]));
      const parsed = items.flatMap((rawItem) => {
        if (!rawItem || typeof rawItem !== "object") return [];
        const item = rawItem as Record<string, unknown>;
        const fileId = typeof item.fileId === "string" ? item.fileId : "";
        const value = typeof item.value === "string" ? item.value : "";
        const start = Number(item.start);
        const end = Number(item.end);
        if (!fileId || !value || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return [];
        if (!docIndex.has(fileId)) return [];
        return [{ fileId, value, start, end }];
      });
      parsed.sort((a, b) => (docIndex.get(a.fileId) ?? 0) - (docIndex.get(b.fileId) ?? 0) || a.start - b.start);
      const corpus = await ensureCorpusTexts();
      const rows: SearchRow[] = parsed.map((item) => {
        const interview = interviews.find((entry) => entry.id === item.fileId);
        const withContext = item.value.length < SEARCH_KEYWORD_CONTEXT_MIN;
        const text = withContext ? corpus.get(item.fileId) : undefined;
        const [left, right] = text ? kwicContext(text, item.start, item.end) : ["", ""];
        return {
          fileId: item.fileId,
          docLabel: interview?.metadataId || interview?.name || item.fileId,
          docTitle: interview?.name ?? item.fileId,
          left,
          keyword: item.value,
          right,
          start: item.start,
          end: item.end,
        };
      });
      setLastSearch({ type: "concetto", query: concept.defaultLabel, rows });
      setSearchFilters({ doc: "", left: "", keyword: "", right: "" });
      setSearchPage(0);
    } catch (error) {
      showError(t.search.error(error instanceof Error ? error.message : t.concepts.unknownError));
    } finally {
      setSearchLoading(false);
    }
  }

  async function runEntrySearch(entry: LexicalEntryOption) {
    if (searchLoading || entry.senses.length === 0) return;
    setSearchLoading(true);
    setGrowlMessage("");
    try {
      const responses = await Promise.all(entry.senses.map(async (sense) => {
        const parameters = new URLSearchParams({ observable: sense, limit: "500" });
        const response = await fetch(`${attestationsByObservableEndpoint}?${parameters.toString()}`, {
          method: "POST",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) throw new Error(await readErrorDetail(response));
        return await response.json() as { list?: unknown };
      }));
      const items = responses.flatMap((payload) => Array.isArray(payload.list) ? payload.list : []);
      const docIndex = new Map(interviews.map((interview, index) => [interview.id, index]));
      const parsed = items.flatMap((rawItem) => {
        if (!rawItem || typeof rawItem !== "object") return [];
        const item = rawItem as Record<string, unknown>;
        const fileId = typeof item.fileId === "string" ? item.fileId : "";
        const value = typeof item.value === "string" ? item.value : "";
        const start = Number(item.start);
        const end = Number(item.end);
        if (!fileId || !value || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return [];
        if (!docIndex.has(fileId)) return [];
        return [{ fileId, value, start, end }];
      });
      parsed.sort((a, b) => (docIndex.get(a.fileId) ?? 0) - (docIndex.get(b.fileId) ?? 0) || a.start - b.start);
      const corpus = await ensureCorpusTexts();
      const rows: SearchRow[] = parsed.map((item) => {
        const interview = interviews.find((candidate) => candidate.id === item.fileId);
        const withContext = item.value.length < SEARCH_KEYWORD_CONTEXT_MIN;
        const text = withContext ? corpus.get(item.fileId) : undefined;
        const [left, right] = text ? kwicContext(text, item.start, item.end) : ["", ""];
        return {
          fileId: item.fileId,
          docLabel: interview?.metadataId || interview?.name || item.fileId,
          docTitle: interview?.name ?? item.fileId,
          left,
          keyword: item.value,
          right,
          start: item.start,
          end: item.end,
        };
      });
      setLastSearch({ type: "termine", query: entry.label, rows });
      setSearchFilters({ doc: "", left: "", keyword: "", right: "" });
      setSearchPage(0);
    } catch (error) {
      showError(t.search.error(error instanceof Error ? error.message : t.concepts.unknownError));
    } finally {
      setSearchLoading(false);
    }
  }

  function toggleSearchView(type: SearchType) {
    if (searchView === type) {
      setSearchView(null);
      return;
    }
    resetSelectionFlow();
    clearSearchFlashes();
    if (type === "termine") void loadLexicalEntries();
    setSearchView(type);
  }

  function openSearchResult(row: SearchRow) {
    setSearchView(null);
    if (row.fileId !== activeInterviewId) {
      const target = interviews.find((interview) => interview.id === row.fileId);
      if (target) void selectInterview(target);
    }
    setPendingScroll({ start: row.start, end: row.end });
  }

  async function handleBulkFiles(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;

    textRequestId.current += 1;
    setUploadLoading(true);
    setImportReport({ running: true, total: files.length, completed: 0, problems: [] });
    setArchiveLoading(true);
    setArchiveError("");
    setTextLoading(true);
    setTextError("");
    resetSelectionFlow();
    setGrowlMessage("");

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("file", file, file.name));
      formData.append("language", "it");
      const response = await fetch(textBulkUploadEndpoint, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData,
      });
      if (!response.ok) throw new Error(await readErrorDetail(response));
      const acceptedJob = readBulkTextJob(await response.json() as unknown);
      if (!acceptedJob) throw new Error(t.archive.bulkNoJob);

      const completedJob = await waitForBulkTextConversion(acceptedJob.bulkId, (job) => {
        setImportReport((current) => current
          ? { ...current, completed: job.completed, problems: buildImportProblems(job) }
          : current);
      });

      setImportReport({
        running: false,
        total: completedJob.items.length,
        completed: completedJob.completed,
        problems: buildImportProblems(completedJob),
      });

      const firstCompleted = completedJob.items.find((item) => item.state === "COMPLETED");
      if (!firstCompleted) return;

      const preferredInterviewId = firstCompleted.resultId ?? firstCompleted.fileId;
      activeInterviewIdRef.current = preferredInterviewId;
      setSearchQuery("");
      if (!await loadArchive(preferredInterviewId)) {
        throw new Error(t.archive.bulkNotReady);
      }
    } catch (error) {
      setArchiveLoading(false);
      setTextLoading(false);
      setImportReport((current) => current
        ? { ...current, running: false }
        : current);
      showError(t.archive.bulkError(error instanceof Error ? error.message : t.concepts.unknownError));
    } finally {
      setUploadLoading(false);
      input.value = "";
    }
  }

  function captureSelection(event?: React.MouseEvent) {
    if (attestationSaving) {
      setDragging(false);
      return;
    }
    if (!dragging) return;
    setDragging(false);
    const root = textRef.current;
    const browserSelection = window.getSelection();
    if (!root || !browserSelection || browserSelection.rangeCount === 0) {
      if (locusEditing) return;
      resetSelectionFlow();
      return;
    }

    if (browserSelection.isCollapsed) {
      if (event) {
        const offset = textOffsetAtPoint(annotatedWrapRef.current ?? root, event.clientX, event.clientY);
        if (offset !== null) {
          const matchingAnnotations = annotations.filter((a) =>
            (!conceptFilter || a.concepts.some((c) => c.lexicalConcept === conceptFilter))
            && a.start <= offset && offset < a.end,
          );
          if (matchingAnnotations.length === 1) {
            editAnnotation(matchingAnnotations[0]);
            return;
          }
        }
      }
      if (locusEditing) return;
      resetSelectionFlow();
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
    const categoryMenuWidth = Math.min(250, window.innerWidth - 24);

    if (!selectedText.trim()) return;
    if (locusEditing && selection?.mode === "edit") {
      const wrap = annotatedWrapRef.current;
      const wrapRect = wrap?.getBoundingClientRect();
      const relLeft = wrapRect ? rect.left - wrapRect.left : rect.left;
      const relTop = wrapRect ? rect.top - wrapRect.top : rect.top;
      const posX = Math.max(12, relLeft + rect.width / 2 - 45);
      const posY = locusBarY(relTop, rect.height, wrapRect?.height);

      setSelection((current) => current && current.mode === "edit" ? {
        ...current,
        start,
        end: start + selectedText.length,
        text: selectedText,
        x: posX,
        y: posY,
        actionX: posX,
      } : current);
      browserSelection.removeAllRanges();
      return;
    }
    setSelectedConcepts([]);
    setConceptSelections({});
    setOriginalEditingConcepts({});
    setRemovedList([]);
    setAddedList([]);
    setUpdatedList({});
    setLocusEditing(false);
    lexicalSenseTypesRequestIds.current = {};
    setSelection({
      start,
      end: start + selectedText.length,
      text: selectedText,
      x: Math.max(12, Math.min(
        window.innerWidth - categoryMenuWidth - 12,
        rect.left + rect.width / 2 - categoryMenuWidth / 2,
      )),
      y: Math.max(12, rect.top - 52),
      actionX: Math.min(window.innerWidth - 54, Math.max(12, rect.left + rect.width / 2 - 21)),
      mode: "create",
    });
    void loadLexicalEntries();
  }

  async function addAnnotation() {
    if (!selection || selectedConcepts.length === 0 || attestationSaving) return;
    if (!selectedConceptsConfigured) {
      showError(t.messages.createNeedOptions);
      return;
    }
    if (!activeInterview || activeInterview.source !== "server" || !activeInterview.contextIri) {
      showError(t.messages.createNoContext);
      return;
    }

    const selectedLexicalConcepts = selectedConcepts.flatMap((lexicalConcept) => {
      const concept = concepts.find((item) => item.lexicalConcept === lexicalConcept);
      return concept ? [concept] : [];
    });
    if (selectedLexicalConcepts.length !== selectedConcepts.length) {
      showError(t.messages.createConceptGone);
      return;
    }

    setAttestationSaving(true);
    setGrowlMessage("");
    try {
      const parameters = new URLSearchParams({
        corpus: activeInterview.contextIri,
        author: "",
        external: "",
      });
      const observables = selectedLexicalConcepts.map((concept) => {
        const options = conceptSelections[concept.lexicalConcept];
        if (options.relationType === "paradigmatico") {
          return {
            observable: options.paradigmaticSense,
            metadata: [{
              property: referringConceptProperty,
              values: [{ value: concept.lexicalConcept, type: "iri" }],
            }],
          };
        }
        return {
          observable: concept.lexicalConcept,
          metadata: narrativeMetadata(options),
        };
      });
      const response = await fetch(
        `${attestationsEndpoint}/by-locus?${parameters.toString()}`,
        {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            value: selection.text,
            start: selection.start,
            end: selection.end,
            observables,
          }),
        },
      );
      if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(detail || `HTTP ${response.status}`);
      }

      const narrativeSelections = selectedLexicalConcepts.flatMap((concept) => {
        const conceptSelection = conceptSelections[concept.lexicalConcept];
        return conceptSelection.relationType === "narrativo"
          ? [{ concept, conceptSelection }]
          : [];
      });
      const lexicalConceptUpdates = await Promise.all(narrativeSelections.map(async ({ concept, conceptSelection }) => {
        try {
          const patchResponse = await fetch(lexicalConceptEndpoint, {
            method: "PATCH",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({
              lexicalConcept: concept.lexicalConcept,
              addSenses: [{ senseId: conceptSelection.narrativeSense, language: "it" }],
            }),
          });
          if (patchResponse.ok) return "";
          const detail = (await patchResponse.text()).trim();
          return `${concept.defaultLabel}: ${detail || `HTTP ${patchResponse.status}`}`;
        } catch (error) {
          return `${concept.defaultLabel}: ${error instanceof Error ? error.message : t.concepts.unknownError}`;
        }
      }));

      let annotationsReloadError = "";
      try {
        const loadedAnnotations = await fetchAttestations(activeInterview.id, concepts);
        setInterviews((current) => current.map((interview) => interview.id === activeInterview.id
          ? { ...interview, annotations: loadedAnnotations, annotationCount: loadedAnnotations.length }
          : interview));
      } catch (error) {
        annotationsReloadError = error instanceof Error ? error.message : t.concepts.unknownError;
      }
      resetSelectionFlow();
      const failedUpdates = lexicalConceptUpdates.filter(Boolean);
      if (failedUpdates.length > 0) {
        showError(t.messages.createPartialSenses(failedUpdates.length, failedUpdates.join(" · ")));
      } else if (annotationsReloadError) {
        showError(t.messages.createReloadError(annotationsReloadError));
      } else {
        showNotice(t.messages.saved);
      }
    } catch (error) {
      showError(t.messages.saveError(error instanceof Error ? error.message : t.concepts.unknownError));
    } finally {
      setAttestationSaving(false);
    }
  }

  function toggleConcept(lexicalConcept: string) {
    if (!conceptSelectionActive || attestationSaving) return;
    const isSelected = selectedConcepts.includes(lexicalConcept);
    if (isSelected) {
      lexicalSenseTypesRequestIds.current[lexicalConcept]
        = (lexicalSenseTypesRequestIds.current[lexicalConcept] ?? 0) + 1;
    }
    setSelectedConcepts((current) => isSelected
      ? current.filter((item) => item !== lexicalConcept)
      : [...current, lexicalConcept]);

    if (editingAttestation) {
      const originalConcept = originalEditingConcepts[lexicalConcept];
      if (isSelected) {
        if (originalConcept) {
          if (originalConcept.attestationIri) {
            setRemovedList((current) => current.includes(originalConcept.attestationIri)
              ? current
              : [...current, originalConcept.attestationIri]);
          }
          setUpdatedList((current) => {
            const next = { ...current };
            delete next[originalConcept.attestationIri];
            return next;
          });
        } else {
          setAddedList((current) => current.filter((item) => item !== lexicalConcept));
        }
        setConceptSelections((current) => {
          const next = { ...current };
          delete next[lexicalConcept];
          return next;
        });
        return;
      }

      if (originalConcept) {
        setRemovedList((current) => current.filter((item) => item !== originalConcept.attestationIri));
        setConceptSelections((current) => ({
          ...current,
          [lexicalConcept]: {
            ...emptyConceptSelection(lexicalConcept),
            ...originalConcept.options,
          },
        }));
      } else {
        setAddedList((current) => current.includes(lexicalConcept) ? current : [...current, lexicalConcept]);
        setConceptSelections((current) => ({
          ...current,
          [lexicalConcept]: emptyConceptSelection(lexicalConcept),
        }));
      }
      return;
    }

    setConceptSelections((current) => {
      if (!isSelected) return { ...current, [lexicalConcept]: emptyConceptSelection(lexicalConcept) };
      const next = { ...current };
      delete next[lexicalConcept];
      return next;
    });
  }

  function updateConceptAnnotationOptions(
    lexicalConcept: string,
    change: Partial<ConceptAnnotationOptions>,
  ) {
    if (!conceptSelectionActive || attestationSaving) return;
    const nextSelection = {
      ...(conceptSelections[lexicalConcept] ?? emptyConceptSelection(lexicalConcept)),
      ...change,
    };
    setConceptSelections((current) => ({ ...current, [lexicalConcept]: nextSelection }));
    if (editingAttestation) {
      const originalConcept = originalEditingConcepts[lexicalConcept];
      if (originalConcept?.attestationIri) {
        setUpdatedList((current) => {
          const next = { ...current };
          if (editableOptionsEqual(nextSelection, originalConcept.options)) {
            delete next[originalConcept.attestationIri];
          } else {
            next[originalConcept.attestationIri] = {
              attestationIri: originalConcept.attestationIri,
              lexicalConcept,
              options: nextSelection,
            };
          }
          return next;
        });
      }
    }
  }

  function selectConceptRelation(lexicalConcept: string, relationType: ConceptRelationType) {
    if (editingAttestation && originalEditingConcepts[lexicalConcept]) return;
    updateConceptAnnotationOptions(lexicalConcept, relationType === "paradigmatico"
      ? {
          relationType,
          polarity: "",
          definitionType: "",
          evidenceStatus: "nessuno",
          pragmaticUsage: "nessuno",
          note: "",
        }
      : { relationType });
  }

  async function toggleLocusEditing() {
    if (!selection || selection.mode !== "edit" || attestationSaving) return;
    if (!locusEditing) {
      window.getSelection()?.removeAllRanges();
      setLocusEditing(true);
      return;
    }

    if (!locusDirty) {
      return;
    }

    if (!activeInterview || activeInterview.source !== "server") {
      showError(t.messages.locusNoText);
      return;
    }

    const sourceStart = selection.sourceStart ?? selection.start;
    const sourceEnd = selection.sourceEnd ?? selection.end;
    const originalAnnotation = annotations.find((annotation) =>
      annotation.start === sourceStart
      && annotation.end === sourceEnd
      && (!selection.locusIri || annotation.locusIri === selection.locusIri),
    );
    const attestationIris = originalAnnotation?.attestationIris ?? [];
    if (attestationIris.length === 0) {
      showError(t.messages.locusNoAttestations);
      return;
    }

    setAttestationSaving(true);
    setGrowlMessage("");
    try {
      const results = await Promise.allSettled(attestationIris.map(async (attestation) => {
        const response = await fetch(
          `${attestationsEndpoint}/${encodeURIComponent(activeInterview.id)}/locus`,
          {
            method: "PATCH",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({
              attestation,
              start: selection.start,
              end: selection.end,
              updateGloss: true,
            }),
          },
        );
        if (!response.ok) throw new Error(await readErrorDetail(response));
      }));
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");

      const loadedAnnotations = await fetchAttestations(activeInterview.id, concepts);
      setInterviews((current) => current.map((interview) => interview.id === activeInterview.id
        ? { ...interview, annotations: loadedAnnotations, annotationCount: loadedAnnotations.length }
        : interview));
      resetSelectionFlow();

      if (failures.length > 0) {
        const firstFailure = failures[0].reason;
        throw new Error(t.messages.updatePartialFailures(
          failures.length,
          attestationIris.length,
          firstFailure instanceof Error ? firstFailure.message : t.concepts.unknownError,
        ));
      }
      showNotice(t.messages.locusSaved(selection.start, selection.end));
    } catch (error) {
      showError(t.messages.locusError(error instanceof Error ? error.message : t.concepts.unknownError));
    } finally {
      setAttestationSaving(false);
    }
  }

  async function requestAnnotationUpdate() {
    if (!selection || !editingAttestation || !editDirty || attestationSaving) return;
    if (!addedConceptsConfigured) {
      showError(t.messages.updateNeedOptions);
      return;
    }
    if (!activeInterview || activeInterview.source !== "server" || !activeInterview.contextIri) {
      showError(t.messages.updateNoText);
      return;
    }
    if (!selection.locusIri) {
      showError(t.messages.updateNoLocus);
      return;
    }

    const addedConcepts = addedList.flatMap((lexicalConcept) => {
      const concept = concepts.find((item) => item.lexicalConcept === lexicalConcept);
      return concept ? [concept] : [];
    });
    if (addedConcepts.length !== addedList.length) {
      showError(t.messages.updateConceptGone);
      return;
    }

    setAttestationSaving(true);
    setGrowlMessage("");
    let mutationCompleted = false;
    try {
      if (removedList.length > 0) {
        const parameters = new URLSearchParams({ corpus: activeInterview.contextIri });
        const response = await fetch(
          `${attestationsEndpoint}/${encodeURIComponent(activeInterview.id)}/by-locus?${parameters.toString()}`,
          {
            method: "DELETE",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ locus: selection.locusIri, attestations: removedList }),
          },
        );
        if (!response.ok) throw new Error(t.messages.updateRemoveError(await readErrorDetail(response)));
        mutationCompleted = true;
      }

      if (addedConcepts.length > 0) {
        const parameters = new URLSearchParams({
          corpus: activeInterview.contextIri,
          author: "",
          external: "",
        });
        const observables = addedConcepts.map((concept) => {
          const options = conceptSelections[concept.lexicalConcept];
          return options.relationType === "paradigmatico"
            ? {
                observable: options.paradigmaticSense,
                metadata: [{
                  property: referringConceptProperty,
                  values: [{ value: concept.lexicalConcept, type: "iri" }],
                }],
              }
            : {
                observable: concept.lexicalConcept,
                metadata: narrativeMetadata(options),
              };
        });
        const response = await fetch(`${attestationsEndpoint}/by-locus?${parameters.toString()}`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            value: selection.text,
            start: selection.start,
            end: selection.end,
            observables,
          }),
        });
        if (!response.ok) throw new Error(t.messages.updateAddError(await readErrorDetail(response)));
        mutationCompleted = true;

        await Promise.all(addedConcepts.map(async (concept) => {
          const options = conceptSelections[concept.lexicalConcept];
          if (options.relationType !== "narrativo") return;
          const patchResponse = await fetch(lexicalConceptEndpoint, {
            method: "PATCH",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({
              lexicalConcept: concept.lexicalConcept,
              addSenses: [{ senseId: options.narrativeSense, language: "it" }],
            }),
          });
          if (!patchResponse.ok) {
            throw new Error(t.messages.updateSenseLinkError(concept.defaultLabel, await readErrorDetail(patchResponse)));
          }
        }));
      }

      for (const update of Object.values(updatedList)) {
        const response = await fetch(metadataEndpoint, {
          method: "PATCH",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            entityType: "attestation",
            resource: update.attestationIri,
            fileId: activeInterview.id,
            properties: narrativeMetadata(update.options, true),
          }),
        });
        if (!response.ok) throw new Error(t.messages.updateMetadataError(await readErrorDetail(response)));
        mutationCompleted = true;
      }

      const loadedAnnotations = await fetchAttestations(activeInterview.id, concepts);
      setInterviews((current) => current.map((interview) => interview.id === activeInterview.id
        ? { ...interview, annotations: loadedAnnotations, annotationCount: loadedAnnotations.length }
        : interview));
      resetSelectionFlow();
      showNotice(t.messages.updated);
    } catch (error) {
      if (mutationCompleted) {
        try {
          const loadedAnnotations = await fetchAttestations(activeInterview.id, concepts);
          setInterviews((current) => current.map((interview) => interview.id === activeInterview.id
            ? { ...interview, annotations: loadedAnnotations, annotationCount: loadedAnnotations.length }
            : interview));
        } catch {
          // La modifica è già parzialmente applicata; il prossimo caricamento riallineerà lo stato.
        }
        resetSelectionFlow();
      }
      showError(t.messages.updateError(error instanceof Error ? error.message : t.concepts.unknownError));
    } finally {
      setAttestationSaving(false);
    }
  }

  async function requestAnnotationDeletion() {
    if (!editingAttestation || attestationSaving) return;
    if (!activeInterview || activeInterview.source !== "server" || !activeInterview.contextIri) {
      showError(t.messages.deleteNoContext);
      return;
    }
    if (!selection.locusIri) {
      showError(t.messages.deleteNoLocus);
      return;
    }

    setAttestationSaving(true);
    setGrowlMessage("");
    try {
      const parameters = new URLSearchParams({ corpus: activeInterview.contextIri });
      const response = await fetch(
        `${attestationsEndpoint}/${encodeURIComponent(activeInterview.id)}/by-locus?${parameters.toString()}`,
        {
          method: "DELETE",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ locus: selection.locusIri, all: true }),
        },
      );
      if (!response.ok) throw new Error(await readErrorDetail(response));

      const loadedAnnotations = await fetchAttestations(activeInterview.id, concepts);
      setInterviews((current) => current.map((interview) => interview.id === activeInterview.id
        ? { ...interview, annotations: loadedAnnotations, annotationCount: loadedAnnotations.length }
        : interview));
      resetSelectionFlow();
      showNotice(t.messages.deleted);
    } catch (error) {
      showError(t.messages.deleteError(error instanceof Error ? error.message : t.concepts.unknownError));
    } finally {
      setAttestationSaving(false);
    }
  }

  function renderTextParagraphs(str: string, keyPrefix: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    const regex = /\n{2,}/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        parts.push(str.slice(lastIndex, match.index));
      }
      parts.push(
        <span key={`${keyPrefix}-pb-${match.index}`} className="paragraph-break">
          {match[0]}
        </span>,
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < str.length) {
      parts.push(str.slice(lastIndex));
    }

    return parts;
  }

  function renderAnnotatedText() {
    const headingMatch = /Trascrizione Intervista/i.exec(text);
    if (!headingMatch) return <>{renderTextParagraphs(text, "full")}</>;

    const headingStart = headingMatch.index;
    const headingEnd = headingStart + headingMatch[0].length;

    return (
      <>
        {headingStart > 0 && (
          <span className="interview-offset-prefix" aria-hidden="true">
            {text.slice(0, headingStart)}
          </span>
        )}
        <span className="transcript-heading">
          {text.slice(headingStart, headingEnd)}
        </span>
        {renderTextParagraphs(text.slice(headingEnd), "transcript")}
      </>
    );
  }

  function renderFloatingTooltip() {
    if (!hoveredTooltip || dragging || locusDragging) return null;
    const { annotation, x, y } = hoveredTooltip;
    const conceptItems = annotation.concepts.length
      ? annotation.concepts
      : annotation.label.split("\n").map((label, i) => ({
          attestationIri: "",
          observableIri: "",
          lexicalConcept: `fallback-${i}`,
          label,
          term: "",
          options: {
            relationType: "",
            polarity: "",
            definitionType: "",
            evidenceStatus: "nessuno",
            pragmaticUsage: "nessuno",
            note: "",
            lexicalEntry: "",
          } as ConceptAnnotationOptions,
        }));

    return (
      <div
        className="attestation-tooltip"
        style={{ left: `${x}px`, top: `${y}px` }}
        aria-hidden="true"
      >
        {conceptItems.map((concept) => (
          <span className="attestation-tooltip-row" key={concept.lexicalConcept}>
            <span
              className="attestation-tooltip-label"
              data-label={concept.label}
              data-entry={resolveLexicalEntryLabel(concept.options.lexicalEntry, concept.observableIri, lexicalEntries) || concept.term || undefined}
            />
            <span className="attestation-tooltip-icons">
              {concept.options.polarity && (
                <span className={`tooltip-polarity polarity-${concept.options.polarity}`}>
                  <span className="sentiment-face tooltip-sentiment" />
                </span>
              )}
              {concept.options.definitionType && (
                <span className="tooltip-definition-icon">
                  <DefinitionTypeIcon type={concept.options.definitionType} />
                </span>
              )}
            </span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand">
          <div className="brand-image" aria-hidden="true">
            <img src={`${basePath}/donCalabria-logo.png`} alt="" />
          </div>
          <div>
            <p className="eyebrow">{t.header.eyebrow}</p>
            <h1>Futuri (im)Possibili</h1>
          </div>
        </div>
        <div className="partner-logos" aria-label={t.header.partnerAria}>
          <img
            className="partner-logo foundation-logo"
            src={`${basePath}/logo-fondazione-rut.png`}
            alt="Fondazione RUT"
          />
          <span className="partner-divider" aria-hidden="true" />
          <img
            className="partner-logo ilc-logo"
            src={`${basePath}/logo-ilc.png`}
            alt="Istituto di Linguistica Computazionale Antonio Zampolli"
          />
        </div>
      </header>

      <nav className="main-nav" aria-label={t.nav.mainAria}>
        {menuItemIds.map((itemId, index) => (
          <button
            key={itemId}
            className={activePage === index ? "active" : ""}
            onClick={() => {
              if (index === reservedMenuItemIndex && !workspaceUnlocked) {
                setPasswordOpen(true);
                return;
              }
              setActivePage(index);
              if (index === 4) void loadConcepts();
            }}
            aria-label={index === reservedMenuItemIndex ? t.nav.reservedAria(t.nav.items[index]) : t.nav.items[index]}
            title={index === reservedMenuItemIndex ? t.nav.reservedTitle : undefined}
          >
            {t.nav.items[index]}
            {index === reservedMenuItemIndex && !workspaceUnlocked && <span className="nav-lock" aria-hidden="true">🔒</span>}
          </button>
        ))}
        <div className="lang-switch" role="group" aria-label={t.nav.switchAria}>
          {(["it", "en"] as const).map((code) => (
            <button
              key={code}
              type="button"
              className={lang === code ? "active" : ""}
              onClick={() => setLang(code)}
              aria-pressed={lang === code}
              aria-label={code === "it" ? "Italiano" : "English"}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="main-nav-version" title={t.nav.versionTitle(appVersion)}>v{appVersion}</span>
      </nav>

      <main>
        {activePage === 1 ? (
          <section className="statistics-page" aria-label="Statistiche" />
        ) : activePage === 4 ? (
          <section className="workspace" aria-label={t.workspace.sectionAria}>
            <div className="interview-layout">
              <aside className="interview-sidebar" aria-label={t.archive.title}>
                <div className="sidebar-heading">
                  <div className="sidebar-heading-row">
                    <strong>{t.archive.title}</strong>
                    <label
                      className={`archive-upload ${uploadLoading ? "disabled" : ""}`}
                      aria-label={t.archive.uploadAria}
                      aria-disabled={uploadLoading}
                      title={t.archive.uploadTitle}
                    >
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M12 16V4" />
                        <path d="M6 10l6-6 6 6" />
                        <path d="M4 20h16" />
                      </svg>
                      <input
                        type="file"
                        accept=".txt,.md,.markdown,.json,text/plain,text/markdown,application/json"
                        onChange={(event) => void handleBulkFiles(event)}
                        disabled={uploadLoading}
                        multiple
                      />
                    </label>
                    <button
                      className={`archive-select ${selectionMode ? "active" : ""}`}
                      onClick={toggleSelectionMode}
                      disabled={archiveLoading || uploadLoading || bulkDeleting || textDeleting}
                      aria-label={t.archive.selectAria}
                      aria-pressed={selectionMode}
                      title={t.archive.selectTitle}
                    >
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="4" y="4" width="16" height="16" rx="4" />
                        <path d="M8.5 12.2l2.4 2.4 4.8-5" className="archive-select-check" />
                      </svg>
                    </button>
                    <button
                      className="archive-delete"
                      onClick={() => {
                        if (selectionMode) {
                          if (selectedInterviewIds.length > 0) setBulkDeleteOpen(true);
                        } else {
                          setInterviewToDelete(activeInterview);
                        }
                      }}
                      disabled={!activeInterview
                        || archiveLoading
                        || uploadLoading
                        || textLoading
                        || bulkDeleting
                        || (selectionMode && selectedInterviewIds.length === 0)}
                      aria-label={t.archive.deleteAria}
                      title={selectionMode && selectedInterviewIds.length === 0 ? t.archive.selectFirst : t.archive.deleteAria}
                    >
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M4 7h16" />
                        <path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
                        <path d="M6.5 7l.75 12.3A1.9 1.9 0 0 0 9.15 21h5.7a1.9 1.9 0 0 0 1.9-1.7L17.5 7" />
                        <path d="M10.1 11v6M13.9 11v6" />
                      </svg>
                    </button>
                    <button
                      className="archive-reload"
                      onClick={() => void loadArchive()}
                      disabled={archiveLoading || uploadLoading}
                      aria-label={t.archive.reloadAria}
                      title={t.archive.reloadTitle}
                    >
                      ↻
                    </button>
                  </div>
                  <small className="sidebar-count">
                    {selectionMode && selectedInterviewIds.length > 0
                      ? t.archive.selectedCount(selectedInterviewIds.length)
                      : t.archive.fileCount(interviews.length)}
                  </small>
                </div>
                <div className="interview-search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t.archive.searchPlaceholder}
                    aria-label={t.archive.searchAria}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                {selectionMode && (
                  <div className="archive-bulk-bar">
                    <button
                      type="button"
                      onClick={selectAllFilteredInterviews}
                      disabled={bulkDeleting || archiveLoading}
                    >
                      {t.archive.selectAll}
                    </button>
                    <button
                      type="button"
                      onClick={clearInterviewSelection}
                      disabled={bulkDeleting || selectedInterviewIds.length === 0}
                    >
                      {t.archive.clearSelection}
                    </button>
                  </div>
                )}
                <div className="interview-list">
                  {importReport && (
                    <div className="import-report" role="status" aria-live="polite">
                      <div className="import-report-head">
                        <span className="import-report-title">{t.archive.importReportTitle}</span>
                        <button
                          type="button"
                          onClick={() => setImportReport(null)}
                          aria-label={t.modals.growlClose}
                        >
                          ×
                        </button>
                      </div>
                      <small className="import-report-summary">
                        {importReport.running
                          ? t.archive.uploadProgress(importReport.completed, importReport.total)
                          : t.archive.importReportSummary(importReport.completed, importReport.total, importReport.problems.length)}
                      </small>
                      {importReport.problems.length > 0 && (
                        <ul className="import-report-list">
                          {importReport.problems.map((line, index) => (
                            <li key={index}>{line}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {bulkDeleting && (
                    <div className="archive-loading" role="status" aria-live="polite">
                      <span className="loading-spinner" aria-hidden="true" />
                      <small>
                        {t.archive.bulkDeleteProgress(bulkDeletionProgress?.deleted ?? 0, bulkDeletionProgress?.total ?? 0)}
                      </small>
                    </div>
                  )}
                  {!uploadLoading && archiveLoading && (
                    <div className="archive-loading" role="status">
                      <span className="loading-spinner" aria-hidden="true" />
                      <small>{t.archive.loading}</small>
                    </div>
                  )}
                  {!archiveLoading && archiveError && (
                    <div className="archive-error">
                      <strong>{t.archive.unavailable}</strong>
                      <small>{archiveError}</small>
                      <code>LexO-server /service/texts</code>
                    </div>
                  )}
                  {filteredInterviews.map((interview) => {
                    const isSelectedRow = selectedInterviewIds.includes(interview.id);
                    return (
                    <button
                      key={interview.id}
                      className={`${interview.id === activeInterviewId ? "active" : ""} ${selectionMode ? "select-mode" : ""} ${isSelectedRow ? "row-selected" : ""} ${selectionMode && interview.source !== "server" ? "not-selectable" : ""}`}
                      onClick={() => selectionMode ? toggleInterviewSelection(interview) : void selectInterview(interview)}
                    >
                      {selectionMode && (
                        <span className={`interview-select-box ${isSelectedRow ? "checked" : ""}`} aria-hidden="true">
                          {isSelectedRow && (
                            <svg viewBox="0 0 24 24" fill="none">
                              <path d="M5.5 12.5l4 4 9-9" />
                            </svg>
                          )}
                        </span>
                      )}
                      <span className="list-copy">
                        <strong title={interview.metadataId && interview.metadataId !== interview.name ? interview.name : undefined}>
                          {interview.metadataId || interview.name}
                        </strong>
                        <small>
                          {interview.source === "server"
                            ? t.archive.serverStats(interview.tokenCount?.toLocaleString(numberLocale) ?? "", interview.sentenceCount ?? 0, interview.annotationCount ?? 0)
                            : t.archive.localStats(interview.text.length.toLocaleString(numberLocale), interview.annotations.length)}
                        </small>
                      </span>
                    </button>
                    );
                  })}
                  {!archiveLoading && !archiveError && filteredInterviews.length === 0 && (
                    <p className="empty-search">{t.archive.emptySearch}</p>
                  )}
                </div>
              </aside>

              <div className="document-card">
                <div className="document-toolbar">
                  {!searchView && (
                    <>
                      <div className="file-info">
                        <strong
                          title={activeInterview?.metadataId && activeInterview.metadataId !== activeInterview.name ? activeInterview.name : undefined}
                        >
                          {activeInterview?.metadataId || fileName}
                        </strong>
                      </div>
                      {description && !textLoading && !textError && (
                        <div className="description-tab" title={description} aria-label={t.document.descriptionAria(description)}>
                          <strong>{description}</strong>
                        </div>
                      )}
                    </>
                  )}
                  <div className="toolbar-searches">
                    <button
                      type="button"
                      className={`toolbar-search ${searchView === "forma" ? "active" : ""}`}
                      onClick={() => toggleSearchView("forma")}
                      disabled={Boolean(selection) || textLoading || Boolean(textError)}
                      aria-label={t.search.formaTitle}
                      aria-pressed={searchView === "forma"}
                      title={t.search.formaTitle}
                    >
                      {t.search.formaButton}
                    </button>
                    <button
                      type="button"
                      className={`toolbar-search ${searchView === "concetto" ? "active" : ""}`}
                      onClick={() => toggleSearchView("concetto")}
                      disabled={Boolean(selection) || textLoading || Boolean(textError) || conceptsLoading || Boolean(conceptsError)}
                      aria-label={t.search.conceptTitle}
                      aria-pressed={searchView === "concetto"}
                      title={t.search.conceptTitle}
                    >
                      {t.search.conceptButton}
                    </button>
                    <button
                      type="button"
                      className={`toolbar-search ${searchView === "termine" ? "active" : ""}`}
                      onClick={() => toggleSearchView("termine")}
                      disabled={Boolean(selection) || textLoading || Boolean(textError) || lexicalEntriesLoading || Boolean(lexicalEntriesError)}
                      aria-label={t.search.entryTitle}
                      aria-pressed={searchView === "termine"}
                      title={t.search.entryTitle}
                    >
                      {t.search.entryButton}
                    </button>
                  </div>
                </div>
                {searchView ? (
                  <div className="search-panel">
                    {searchView === "forma" ? (
                    <div className="search-fields">
                      <span className="search-kicker">{t.search.formaTitle}</span>
                      <input
                        type="search"
                        className="search-input"
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void runFormaSearch();
                        }}
                        placeholder={t.search.formaPlaceholder}
                        aria-label={t.search.formaTitle}
                        autoFocus
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="search-run"
                        onClick={() => void runFormaSearch()}
                        disabled={!searchInput.trim() || searchLoading}
                      >
                        {t.search.run}
                      </button>
                      <small className="search-hint">{t.search.formaHint}</small>
                    </div>
                    ) : searchView === "concetto" ? (
                    <div className="search-fields">
                      <span className="search-kicker">{t.search.conceptTitle}</span>
                      <div className="search-combo" ref={conceptComboRef}>
                        <input
                          type="search"
                          className="search-input"
                          value={conceptQuery}
                          onChange={(event) => {
                            setConceptQuery(event.target.value);
                            setConceptSelected(null);
                            setConceptListOpen(true);
                          }}
                          onFocus={() => setConceptListOpen(true)}
                          placeholder={t.search.conceptPlaceholder}
                          aria-label={t.search.conceptTitle}
                          autoComplete="off"
                          spellCheck={false}
                        />
                        {conceptListOpen && (
                          <div className="search-combo-list">
                            {matchingConcepts.length === 0 ? (
                              <div className="search-combo-empty">{t.search.noMatch}</div>
                            ) : (
                              matchingConcepts.map((concept) => (
                                <button
                                  type="button"
                                  key={concept.lexicalConcept}
                                  className={`search-combo-item ${conceptSelected?.lexicalConcept === concept.lexicalConcept ? "selected" : ""}`}
                                  onClick={() => {
                                    setConceptSelected(concept);
                                    setConceptQuery(concept.defaultLabel);
                                    setConceptListOpen(false);
                                  }}
                                >
                                  <span>{concept.defaultLabel}</span>
                                  <small>{concept.attestation}</small>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="search-run"
                        onClick={() => { if (conceptSelected) void runConceptSearch(conceptSelected); }}
                        disabled={!conceptSelected || searchLoading}
                      >
                        {t.search.run}
                      </button>
                      <small className="search-hint">{t.search.conceptHint}</small>
                    </div>
                    ) : (
                    <div className="search-fields">
                      <span className="search-kicker">{t.search.entryTitle}</span>
                      <div className="search-combo" ref={entryComboRef}>
                        <input
                          type="search"
                          className="search-input"
                          value={entryQuery}
                          onChange={(event) => {
                            setEntryQuery(event.target.value);
                            setEntrySelected(null);
                            setEntryListOpen(true);
                          }}
                          onFocus={() => setEntryListOpen(true)}
                          placeholder={t.search.entryPlaceholder}
                          aria-label={t.search.entryTitle}
                          autoComplete="off"
                          spellCheck={false}
                        />
                        {entryListOpen && (
                          <div className="search-combo-list">
                            {matchingEntries.length === 0 ? (
                              <div className="search-combo-empty">{t.search.noMatch}</div>
                            ) : (
                              matchingEntries.map((entry) => (
                                <button
                                  type="button"
                                  key={entry.entry}
                                  className={`search-combo-item ${entrySelected?.entry === entry.entry ? "selected" : ""}`}
                                  onClick={() => {
                                    setEntrySelected(entry);
                                    setEntryQuery(entry.label);
                                    setEntryListOpen(false);
                                  }}
                                >
                                  <span>{entry.label}</span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="search-run"
                        onClick={() => { if (entrySelected) void runEntrySearch(entrySelected); }}
                        disabled={!entrySelected || entrySelected.senses.length === 0 || searchLoading}
                      >
                        {t.search.run}
                      </button>
                      <small className="search-hint">{t.search.entryHint}</small>
                    </div>
                    )}
                    <div className="search-results">
                      {searchLoading ? (
                        <div className="kwic-empty">{t.search.loading}</div>
                      ) : !lastSearch || lastSearch.type !== searchView ? (
                        <div className="kwic-empty">{t.search.emptyPrompt}</div>
                      ) : (
                        <>
                          <div className={`kwic-scroll${searchView === "forma" ? "" : " anno-mode"}`}>
                          <div className={`kwic-head${searchView === "forma" ? "" : " anno-mode"}`}>
                            <span>{t.search.colDoc}</span>
                            {searchView === "forma" ? (
                              <>
                                <span>{t.search.colLeft}</span>
                                <span>{t.search.colKeyword}</span>
                                <span>{t.search.colRight}</span>
                              </>
                            ) : (
                              <span>{t.search.colAnnotation}</span>
                            )}
                          </div>
                          <div className={`kwic-filters${searchView === "forma" ? "" : " anno-mode"}`}>
                            <input
                              type="search"
                              value={searchFilters.doc}
                              onChange={(event) => { setSearchFilters({ ...searchFilters, doc: event.target.value }); setSearchPage(0); }}
                              aria-label={t.search.colDoc}
                              autoComplete="off"
                              spellCheck={false}
                            />
                            {searchView === "forma" ? (
                              <>
                                <input
                                  type="search"
                                  value={searchFilters.left}
                                  onChange={(event) => { setSearchFilters({ ...searchFilters, left: event.target.value }); setSearchPage(0); }}
                                      aria-label={t.search.colLeft}
                                  autoComplete="off"
                                  spellCheck={false}
                                />
                                <input
                                  type="search"
                                  value={searchFilters.keyword}
                                  onChange={(event) => { setSearchFilters({ ...searchFilters, keyword: event.target.value }); setSearchPage(0); }}
                                      aria-label={t.search.colKeyword}
                                  autoComplete="off"
                                  spellCheck={false}
                                />
                                <input
                                  type="search"
                                  value={searchFilters.right}
                                  onChange={(event) => { setSearchFilters({ ...searchFilters, right: event.target.value }); setSearchPage(0); }}
                                      aria-label={t.search.colRight}
                                  autoComplete="off"
                                  spellCheck={false}
                                />
                              </>
                            ) : (
                              <input
                                type="search"
                                value={searchFilters.keyword}
                                onChange={(event) => { setSearchFilters({ ...searchFilters, keyword: event.target.value }); setSearchPage(0); }}
                                  aria-label={t.search.colAnnotation}
                                autoComplete="off"
                                spellCheck={false}
                              />
                            )}
                          </div>
                          {filteredSearchRows.length === 0 ? (
                            <div className="kwic-empty kwic-empty-row">{t.search.noResults}</div>
                          ) : (
                            filteredSearchRows
                              .slice(safeSearchPage * SEARCH_PAGE_SIZE, (safeSearchPage + 1) * SEARCH_PAGE_SIZE)
                              .map((row, index) => (
                                <button
                                  type="button"
                                  className={`kwic-row${searchView === "forma" ? "" : " anno-mode"}`}
                                  key={`${row.fileId}-${row.start}-${index}`}
                                  onClick={() => openSearchResult(row)}
                                >
                                  <span className="kwic-doc" title={row.docTitle}>{row.docLabel}</span>
                                  {searchView === "forma" ? (
                                    <>
                                      <span className="kwic-left">{row.left}</span>
                                      <span className="kwic-keyword">{row.keyword}</span>
                                      <span className="kwic-right">{row.right}</span>
                                    </>
                                  ) : (
                                    <span
                                      className="kwic-anno"
                                      title={`${row.left} ${row.keyword} ${row.right}`.trim()}
                                    >
                                      {row.left && <span className="kwic-context">{row.left} </span>}
                                      <strong>{row.keyword}</strong>
                                      {row.right && <span className="kwic-context"> {row.right}</span>}
                                    </span>
                                  )}
                                </button>
                              ))
                          )}
                          </div>
                          <div className="kwic-pager">
                            <span>{t.search.results(filteredSearchRows.length)}</span>
                            <span className="kwic-pager-nav">
                              <button
                                type="button"
                                disabled={safeSearchPage === 0}
                                onClick={() => setSearchPage(safeSearchPage - 1)}
                                aria-label="<"
                              >
                                ‹
                              </button>
                              <span>{t.search.page(safeSearchPage + 1, searchPages)}</span>
                              <button
                                type="button"
                                disabled={safeSearchPage >= searchPages - 1}
                                onClick={() => setSearchPage(safeSearchPage + 1)}
                                aria-label=">"
                              >
                                ›
                              </button>
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                <div className="document-body">
                  <div
                    ref={textRef}
                    className="text-area"
                    onMouseDown={(event) => {
                      if ((event.target as HTMLElement).closest(".bar, .locus-handle")) return;
                      if (event.detail <= 1) setDragging(true);
                    }}
                    onMouseUp={(event) => {
                      if ((event.target as HTMLElement).closest(".bar, .locus-handle")) {
                        setDragging(false);
                        return;
                      }
                      captureSelection(event);
                    }}
                    onMouseMove={(event) => {
                      if ((event.target as HTMLElement).closest(".bar")) return;
                      if (locusDragging || dragging) {
                        if (hoveredTooltip) setHoveredTooltip(null);
                        return;
                      }
                      const wrap = annotatedWrapRef.current;
                      if (!wrap) return;
                      const offset = textOffsetAtPoint(wrap, event.clientX, event.clientY);
                      if (offset === null) {
                        if (hoveredTooltip) setHoveredTooltip(null);
                        return;
                      }
                      const editingStart = selection?.mode === "edit" ? selection.sourceStart : null;
                      const editingEnd = selection?.mode === "edit" ? selection.sourceEnd : null;
                      const matching = annotations.filter((a) =>
                        (!conceptFilter || a.concepts.some((c) => c.lexicalConcept === conceptFilter))
                        && a.start <= offset && offset < a.end
                        && !(editingStart !== null && a.start === editingStart && a.end === editingEnd),
                      );
                      if (matching.length === 1) {
                        const wrapRect = wrap.getBoundingClientRect();
                        setHoveredTooltip({
                          annotation: matching[0],
                          x: event.clientX - wrapRect.left,
                          y: event.clientY - wrapRect.top - 4,
                        });
                      } else {
                        if (hoveredTooltip) setHoveredTooltip(null);
                      }
                    }}
                    onMouseLeave={() => {
                      if (hoveredTooltip) setHoveredTooltip(null);
                    }}
                  >
                    <div className="annotated-text-wrap" ref={annotatedWrapRef}>
                      {textLoading ? (
                        <div className="text-loading" role="status" aria-live="polite">
                          <span className="text-loading-spinner" aria-hidden="true" />
                          <small>{t.document.loadingInterview}</small>
                        </div>
                      ) : textError ? (
                        <div className="text-error" role="alert">
                          <strong>{t.document.textUnavailable}</strong>
                          <span>{textError}</span>
                          {activeInterview && (
                            <button onClick={() => void selectInterview(activeInterview)}>{t.document.retry}</button>
                          )}
                        </div>
                      ) : (
                        renderAnnotatedText()
                      )}
                      <div
                        className="annotation-layer"
                        ref={annotationLayerRef}
                      />
                      {renderFloatingTooltip()}
                      {selection && editingAttestation && activePage === 4 && (
                        <div
                          ref={annotationActionsRef}
                          className="annotation-actions"
                          style={{ left: `${selection.actionX ?? selection.x}px`, top: `${selection.y}px` }}
                        >
                          <button
                            className={`annotation-locus ${locusDirty ? "active" : ""} ${locusEditing && !locusDirty ? "idle" : ""}`}
                            onClick={() => void toggleLocusEditing()}
                            disabled={attestationSaving || editDirty}
                            aria-pressed={locusDirty}
                            aria-label={locusEditing ? t.document.locusSaveAria : t.document.locusEditAria}
                            title={locusEditing ? t.document.locusSaveTitle : t.document.locusEditTitle}
                          >
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M8 4H5v16h3M16 4h3v16h-3" />
                              <path d="M9 12h6M11 9l-3 3 3 3M13 9l3 3-3 3" />
                            </svg>
                          </button>
                          <button
                            className="annotation-eraser"
                            onClick={() => setConfirmDeleteOpen(true)}
                            disabled={attestationSaving || editDirty}
                            aria-label={t.document.eraseAria}
                            title={t.document.eraseTitle}
                          >
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M4 7h16" />
                              <path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
                              <path d="M6.5 7l.75 12.3A1.9 1.9 0 0 0 9.15 21h5.7a1.9 1.9 0 0 0 1.9-1.7L17.5 7" />
                              <path d="M10.1 11v6M13.9 11v6" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                )}
                <div className="document-foot">
                  {attestationSaving ? (
                    <div className="annotation-progress" role="status" aria-live="polite" aria-label={t.document.savingAria}>
                      <span aria-hidden="true" />
                    </div>
                  ) : (
                    <span>{locusEditing
                      ? t.document.locusHint
                      : editingAttestation
                        ? t.document.editHint
                        : t.document.selectHint}</span>
                  )}
                  <div className="legend">
                    <span />
                    {conceptFilter
                      ? t.document.countFiltered(filteredAnnotations.length, annotations.length)
                      : t.document.countAll(annotations.length)}
                    {conceptFilter && (
                      <button
                        type="button"
                        className="concept-filter-chip"
                        onClick={() => setConceptFilter(null)}
                        title={t.document.filterRemoveTitle}
                        aria-label={t.document.filterRemoveTitle}
                      >
                        <strong>{filteredConceptLabel}</strong>
                        <span aria-hidden="true">✕</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <aside
                ref={conceptSidebarRef}
                className={`concept-sidebar ${conceptSelectionActive ? "selection-active" : ""}`}
                aria-label={t.concepts.sidebarAria}
              >
                <div className="sidebar-heading concept-heading">
                  <div className="concept-heading-row">
                    <strong>{t.concepts.title}</strong>
                    <button
                      className="archive-upload concept-add"
                      onClick={startConceptCreation}
                      disabled={conceptsLoading || Boolean(conceptsError) || conceptCreating || creatingConcept || Boolean(savingConceptUrl)}
                      aria-label={t.concepts.addAria}
                      title={t.concepts.addTitle}
                    >
                      <span aria-hidden="true">+</span>
                    </button>
                    {(conceptCreating || savingConceptUrl) && (
                      <span
                        className="concept-create-spinner"
                        role="status"
                        aria-label={conceptCreating ? t.concepts.creatingAria : t.concepts.renamingAria}
                      />
                    )}
                    <button
                      className="archive-reload"
                      onClick={() => {
                        cancelConceptCreation();
                        void loadConcepts();
                      }}
                      disabled={conceptsLoading || conceptCreating || Boolean(savingConceptUrl)}
                      aria-label={t.concepts.reloadAria}
                      title={t.concepts.reloadTitle}
                    >
                      ↻
                    </button>
                  </div>
                  <small className="sidebar-count">{t.concepts.count(conceptTotalHits)}</small>
                </div>
                <div className="interview-search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    value={conceptSearchQuery}
                    onChange={(event) => setConceptSearchQuery(event.target.value)}
                    placeholder={t.concepts.searchPlaceholder}
                    aria-label={t.concepts.searchAria}
                  />
                </div>
                <div className="concept-list" ref={conceptListRef}>
                  {conceptsLoading && (
                    <div className="archive-loading" role="status" aria-live="polite">
                      <span className="loading-spinner" aria-hidden="true" />
                      <small>{t.concepts.loading}</small>
                    </div>
                  )}
                  {!conceptsLoading && conceptsError && (
                    <div className="archive-error">
                      <strong>{t.concepts.unavailable}</strong>
                      <small>{conceptsError}</small>
                      <code>LexO-server /service/data/lexicalConcepts?id=root</code>
                    </div>
                  )}
                  {!conceptsLoading && !conceptsError && creatingConcept && (
                    <div className="concept-item concept-new-item">
                      <div className="concept-main-row">
                        <span className="concept-new-mark" aria-hidden="true">+</span>
                        <div className="concept-edit-row">
                          <input
                            className="concept-create-input"
                            value={newConceptLabel}
                            onChange={(event) => setNewConceptLabel(event.target.value)}
                            onKeyDown={handleConceptCreationKeyDown}
                            disabled={conceptCreating}
                            placeholder={t.concepts.newPlaceholder}
                            aria-label={t.concepts.newNameAria}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="concept-edit-confirm"
                            onClick={() => void createConcept()}
                            disabled={conceptCreating}
                            aria-label={t.concepts.confirmCreateAria}
                            title={t.concepts.confirmCreateAria}
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className="concept-edit-cancel"
                            onClick={cancelConceptCreation}
                            disabled={conceptCreating}
                            aria-label={t.concepts.cancelCreateAria}
                            title={t.concepts.cancelCreateAria}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {!conceptsLoading && !conceptsError && filteredConcepts.map((concept) => {
                    const isSelected = selectedConcepts.includes(concept.lexicalConcept);
                    const isEditing = editingConceptUrl === concept.lexicalConcept;
                    const isSaving = savingConceptUrl === concept.lexicalConcept;
                    const annotationOptions = conceptSelections[concept.lexicalConcept]
                      ?? emptyConceptSelection(concept.lexicalConcept);
                    const isExistingEditingConcept = Boolean(
                      editingAttestation && originalEditingConcepts[concept.lexicalConcept],
                    );

                    return (
                      <div
                        key={concept.lexicalConcept}
                        data-concept-iri={concept.lexicalConcept}
                        className={`concept-item ${isSelected ? "selected" : ""} ${!conceptSelectionActive ? "selection-disabled" : ""} ${conceptFilter === concept.lexicalConcept ? "filter-active" : ""}`}
                        onContextMenu={(event) => openConceptContextMenu(event, concept)}
                      >
                        <div className="concept-main-row">
                          {isEditing ? (
                            <div className="concept-edit-row">
                              <input
                                className="concept-edit-input"
                                value={editedConceptLabel}
                                onChange={(event) => setEditedConceptLabel(event.target.value)}
                                onKeyDown={(event) => handleConceptEditKeyDown(event, concept)}
                                 disabled={isSaving}
                                 aria-label={t.concepts.editAria(concept.defaultLabel)}
                                 autoFocus
                               />
                               <button
                                 type="button"
                                 className="concept-edit-confirm"
                                 onClick={() => void saveConceptLabel(concept)}
                                 disabled={isSaving}
                                 aria-label={t.concepts.confirmRenameAria}
                                 title={t.concepts.confirmRenameAria}
                               >
                                 ✓
                               </button>
                              <button
                                type="button"
                                className="concept-edit-cancel"
                                onClick={() => {
                                  setEditingConceptUrl("");
                                  setEditedConceptLabel("");
                                }}
                                 disabled={isSaving}
                                 aria-label={t.concepts.cancelRenameAria}
                                 title={t.concepts.cancelRenameAria}
                               >
                                 ✕
                               </button>
                            </div>
                          ) : (
                            <button
                              className="concept-label-button"
                              onClick={() => handleConceptLabelClick(concept)}
                              onDoubleClick={() => handleConceptLabelDoubleClick(concept)}
                              aria-pressed={isSelected}
                              aria-disabled={attestationSaving}
                              title={conceptSelectionActive
                                ? t.concepts.clickSelect
                                : t.concepts.clickFilter}
                            >
                              <span className="concept-check" aria-hidden="true">
                                {isSelected ? "✓" : conceptFilter === concept.lexicalConcept ? "•" : ""}
                              </span>
                              <span className="concept-label-copy">
                                <strong>{concept.defaultLabel}</strong>
                                <small className="concept-attestation">({concept.attestation})</small>
                              </span>
                            </button>
                          )}
                        </div>
                        {isSelected && (
                          <div className="concept-options-panel">
                            <fieldset disabled={isExistingEditingConcept}>
                              <legend>{t.entry.legend}</legend>
                              {isExistingEditingConcept ? (
                                <div className="concept-entry-readonly" aria-label={t.entry.aria(concept.defaultLabel)}>
                                  {(() => {
                                    const orig = originalEditingConcepts[concept.lexicalConcept];
                                    const label = resolveLexicalEntryLabel(annotationOptions.lexicalEntry, orig?.observableIri ?? "", lexicalEntries) || orig?.term;
                                    if (label) return label;
                                    return lexicalEntriesLoading
                                      ? t.entry.loading
                                      : lexicalEntriesError
                                        ? t.entry.unavailable
                                        : t.entry.none;
                                  })()}
                                </div>
                              ) : (
                                <select
                                  className="concept-entry-select"
                                  value={annotationOptions.lexicalEntry}
                                  onChange={(event) => void selectLexicalEntryOption(concept.lexicalConcept, event.target.value)}
                                  disabled={lexicalEntriesLoading || attestationSaving}
                                  aria-label={t.entry.aria(concept.defaultLabel)}
                                >
                                  <option value="">{lexicalEntriesLoading ? t.entry.loading : t.entry.choose}</option>
                                  {lexicalEntries.map((lexicalEntry) => (
                                    <option key={lexicalEntry.entry} value={lexicalEntry.entry}>
                                      {lexicalEntry.label}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {!isExistingEditingConcept && (
                                <>
                                  {lexicalEntriesError && (
                                    <div className="concept-entry-message error">
                                      {t.entry.unavailable}. <button type="button" onClick={() => void loadLexicalEntries()}>{t.entry.retry}</button>
                                    </div>
                                  )}
                                  {annotationOptions.sensesLoading && (
                                    <div className="concept-entry-message">{t.entry.sensesLoading}</div>
                                  )}
                                  {annotationOptions.sensesError && (
                                    <div className="concept-entry-message error">
                                      {t.entry.sensesError} <button type="button" onClick={() => void selectLexicalEntryOption(concept.lexicalConcept, annotationOptions.lexicalEntry)}>{t.entry.retry}</button>
                                    </div>
                                  )}
                                  {annotationOptions.sensesReady && (!annotationOptions.narrativeSense || !annotationOptions.paradigmaticSense) && (
                                    <div className="concept-entry-message error">
                                      {!annotationOptions.narrativeSense && !annotationOptions.paradigmaticSense
                                        ? t.entry.noSenses
                                        : !annotationOptions.narrativeSense
                                          ? t.entry.noNarrative
                                          : t.entry.noParadigmatic}
                                    </div>
                                  )}
                                </>
                              )}
                            </fieldset>
                            <fieldset disabled={isExistingEditingConcept || !annotationOptions.sensesReady}>
                              <legend>{t.panels.relationLegend}</legend>
                              <div className="concept-option-grid relation-options">
                                {conceptRelationOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className={`concept-option ${annotationOptions.relationType === option.value ? "active" : ""}`}
                                    onClick={() => selectConceptRelation(concept.lexicalConcept, option.value)}
                                    aria-pressed={annotationOptions.relationType === option.value}
                                  >
                                    {t.options.relation[option.value]}
                                  </button>
                                ))}
                              </div>
                            </fieldset>
                            <fieldset
                              className="dependent-concept-options"
                              disabled={annotationOptions.relationType !== "narrativo"}
                            >
                              <legend>{t.panels.polarityLegend}</legend>
                              <div className="concept-option-grid polarity-options">
                                {polarityOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className={`concept-option polarity-${option.value} ${annotationOptions.polarity === option.value ? "active" : ""}`}
                                    onClick={() => updateConceptAnnotationOptions(concept.lexicalConcept, { polarity: option.value })}
                                    aria-pressed={annotationOptions.polarity === option.value}
                                    aria-label={t.panels.polarityAria(t.options.polarity[option.value])}
                                    title={t.options.polarity[option.value]}
                                  >
                                    <span className="sentiment-face" aria-hidden="true" />
                                  </button>
                                ))}
                              </div>
                            </fieldset>
                            <fieldset
                              className="dependent-concept-options"
                              disabled={annotationOptions.relationType !== "narrativo"}
                            >
                              <legend>{t.panels.definitionLegend}</legend>
                              <div className="concept-option-grid definition-options">
                                {definitionTypeOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className={`concept-option ${annotationOptions.definitionType === option.value ? "active" : ""}`}
                                    onClick={() => updateConceptAnnotationOptions(concept.lexicalConcept, { definitionType: option.value })}
                                    aria-pressed={annotationOptions.definitionType === option.value}
                                    aria-label={t.panels.definitionAria(t.options.definition[option.value])}
                                    title={t.options.definition[option.value]}
                                  >
                                    <DefinitionTypeIcon type={option.value} />
                                  </button>
                                ))}
                              </div>
                            </fieldset>
                            <fieldset
                              className="dependent-concept-options"
                              disabled={annotationOptions.relationType !== "narrativo"}
                            >
                              <legend>{t.panels.evidenceLegend}</legend>
                              <div className="concept-option-grid evidence-options">
                                {evidenceStatusOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className={`concept-option ${annotationOptions.evidenceStatus === option.value ? "active" : ""}`}
                                    onClick={() => updateConceptAnnotationOptions(concept.lexicalConcept, { evidenceStatus: option.value })}
                                    aria-pressed={annotationOptions.evidenceStatus === option.value}
                                  >
                                    {t.options.evidence[option.value]}
                                  </button>
                                ))}
                              </div>
                            </fieldset>
                            <fieldset
                              className="dependent-concept-options"
                              disabled={annotationOptions.relationType !== "narrativo"}
                            >
                              <legend>{t.panels.usageLegend}</legend>
                              <select
                                className="concept-metadata-select"
                                value={annotationOptions.pragmaticUsage}
                                onChange={(event) => updateConceptAnnotationOptions(concept.lexicalConcept, { pragmaticUsage: event.target.value })}
                                aria-label={t.panels.usageAria(concept.defaultLabel)}
                              >
                                <option value="nessuno">{t.options.usageNone}</option>
                              </select>
                            </fieldset>
                            <fieldset
                              className="dependent-concept-options"
                              disabled={annotationOptions.relationType !== "narrativo"}
                            >
                              <legend>{t.panels.noteLegend}</legend>
                              <textarea
                                className="concept-note-input"
                                value={annotationOptions.note}
                                onChange={(event) => updateConceptAnnotationOptions(concept.lexicalConcept, { note: event.target.value })}
                                placeholder={t.panels.notePlaceholder}
                                aria-label={t.panels.noteAria(concept.defaultLabel)}
                                rows={2}
                              />
                            </fieldset>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!conceptsLoading && !conceptsError && filteredConcepts.length === 0 && (
                    <p className="empty-search">
                      {concepts.length === 0 ? t.concepts.emptyAll : t.concepts.emptyFilter}
                    </p>
                  )}
                </div>
                {conceptSelectionActive && (
                  <div
                    className={`concept-status ${annotationActionReady ? "ready" : ""} ${attestationSaving ? "saving" : ""}`}
                    role="button"
                    tabIndex={annotationActionReady && !attestationSaving ? 0 : -1}
                    aria-disabled={!annotationActionReady || attestationSaving}
                    onClick={() => {
                      if (!annotationActionReady || attestationSaving) return;
                      if (editingAttestation) void requestAnnotationUpdate();
                      else void addAnnotation();
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      if (!annotationActionReady || attestationSaving) return;
                      if (editingAttestation) void requestAnnotationUpdate();
                      else void addAnnotation();
                    }}
                  >
                    {attestationSaving ? (
                      <span className="concept-status-spinner" role="status" aria-label={t.action.savingAria} />
                    ) : annotationActionReady ? (
                      <span className="concept-status-save">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                          <path d="M17 21v-8H7v8M7 3v5h8" />
                        </svg>
                        <strong>{editingAttestation ? t.action.confirm : t.action.save}</strong>
                      </span>
                    ) : (
                      <>
                        <strong>{selectedConcepts.length}</strong>
                        <span>{selectedConcepts.length === 1 ? t.action.oneSelected : t.action.manySelected}</span>
                        <small>
                          {editingAttestation
                            ? editDirty
                              ? t.action.editCompleteNew
                              : t.action.editModify
                            : selectedConcepts.length
                              ? t.action.createComplete
                              : t.action.createChoose}
                        </small>
                      </>
                    )}
                  </div>
                )}
              </aside>
            </div>
          </section>
        ) : activePage === 5 ? (
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
            <h2>{t.nav.items[activePage]}</h2>
            <p>Questa sezione è pronta per ospitare il prossimo servizio di LexO-server.</p>
            <div className="placeholder-grid">
              <div /><div /><div />
            </div>
          </section>
        )}
      </main>

      {confirmDeleteOpen && (
        <div
          ref={confirmDeleteRef}
          className="confirm-modal-overlay"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setConfirmDeleteOpen(false);
          }}
        >
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title">
            <p className="confirm-modal-kicker">{t.modals.kicker}</p>
            <h3 id="confirm-delete-title">{t.modals.attestationTitle}</h3>
            <p>
              {t.modals.attestationBody(selection?.text ?? "")}
            </p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                data-confirm-cancel
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={attestationSaving}
              >
                {t.modals.cancel}
              </button>
              <button
                type="button"
                className="confirm-modal-danger"
                onClick={() => {
                  setConfirmDeleteOpen(false);
                  void requestAnnotationDeletion();
                }}
                disabled={attestationSaving}
              >
                {t.modals.delete}
              </button>
            </div>
          </div>
        </div>
      )}
      {dirtySwitchOpen && (
        <div
          ref={dirtySwitchRef}
          className="confirm-modal-overlay"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) cancelDirtySwitch();
          }}
        >
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="dirty-switch-title">
            <p className="confirm-modal-kicker">{t.modals.dirtyKicker}</p>
            <h3 id="dirty-switch-title">{t.modals.dirtyTitle}</h3>
            <p>{t.modals.dirtyBody}</p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                data-dirty-cancel
                onClick={cancelDirtySwitch}
              >
                {t.modals.cancel}
              </button>
              <button
                type="button"
                className="confirm-modal-danger"
                onClick={confirmDirtySwitch}
              >
                {t.modals.dirtyConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
      {passwordOpen && (
        <div
          ref={passwordModalRef}
          className="confirm-modal-overlay"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setPasswordOpen(false);
              setPasswordValue("");
              setPasswordError("");
            }
          }}
        >
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="password-title">
            <p className="confirm-modal-kicker">{t.modals.passwordKicker}</p>
            <h3 id="password-title">{t.modals.passwordTitle}</h3>
            <p>{t.modals.passwordBody}</p>
            <form onSubmit={(event) => void verifyWorkspacePassword(event)}>
              <input
                type="password"
                className="password-input"
                value={passwordValue}
                onChange={(event) => {
                  setPasswordValue(event.target.value);
                  if (passwordError) setPasswordError("");
                }}
                placeholder={t.modals.passwordPlaceholder}
                aria-label={t.modals.passwordAria}
                autoComplete="off"
                spellCheck={false}
              />
              {passwordError && <p className="password-error" role="alert">{passwordError}</p>}
              <div className="confirm-modal-actions">
                <button
                  type="button"
                  data-password-cancel
                  onClick={() => {
                    setPasswordOpen(false);
                    setPasswordValue("");
                    setPasswordError("");
                  }}
                >
                  {t.modals.cancel}
                </button>
                <button
                  type="submit"
                  className="confirm-modal-confirm"
                  disabled={passwordPending || !passwordValue}
                >
                  {t.modals.passwordConfirm}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="concept-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          aria-label={t.concepts.menuAria}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const concept = contextMenu.concept;
              closeConceptContextMenu();
              setConceptToDelete(concept);
            }}
          >
            {t.concepts.menuDelete}
          </button>
        </div>
      )}
      {conceptToDelete && (
        <div
          ref={conceptConfirmRef}
          className="confirm-modal-overlay"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !conceptDeleting) setConceptToDelete(null);
          }}
        >
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="concept-delete-title">
            <p className="confirm-modal-kicker">{t.modals.kicker}</p>
            <h3 id="concept-delete-title">{t.concepts.deleteConfirmTitle(conceptToDelete.defaultLabel)}</h3>
            <p>
              {t.concepts.deleteConfirmBody}
            </p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                data-concept-confirm-cancel
                onClick={() => setConceptToDelete(null)}
                disabled={conceptDeleting}
              >
                {t.modals.cancel}
              </button>
              <button
                type="button"
                className="confirm-modal-danger"
                onClick={() => void deleteConcept(conceptToDelete)}
                disabled={conceptDeleting}
              >
                {t.modals.delete}
              </button>
            </div>
          </div>
        </div>
      )}
      {interviewToDelete && (
        <div
          ref={textConfirmRef}
          className="confirm-modal-overlay"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !textDeleting) setInterviewToDelete(null);
          }}
        >
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="text-delete-title">
            <p className="confirm-modal-kicker">{t.modals.kicker}</p>
            <h3 id="text-delete-title">{t.archive.deleteConfirmTitle(interviewToDelete.name)}</h3>
            <p>
              {t.archive.deleteConfirmBody}
            </p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                data-text-confirm-cancel
                onClick={() => setInterviewToDelete(null)}
                disabled={textDeleting}
              >
                {t.modals.cancel}
              </button>
              <button
                type="button"
                className="confirm-modal-danger"
                onClick={() => void deleteText(interviewToDelete)}
                disabled={textDeleting}
              >
                {t.modals.delete}
              </button>
            </div>
          </div>
        </div>
      )}
      {bulkDeleteOpen && (
        <div
          ref={bulkDeleteRef}
          className="confirm-modal-overlay"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !bulkDeleting) setBulkDeleteOpen(false);
          }}
        >
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-delete-title">
            <p className="confirm-modal-kicker">{t.modals.kicker}</p>
            <h3 id="bulk-delete-title">{t.archive.bulkDeleteConfirmTitle(selectedInterviewIds.length)}</h3>
            <p>
              {t.archive.bulkDeleteConfirmBody}
            </p>
            {activeInterview && selectedInterviewIds.includes(activeInterview.id) && (
              <p className="bulk-active-warning">{t.archive.bulkDeleteActiveWarning}</p>
            )}
            <div className="confirm-modal-actions">
              <button
                type="button"
                data-bulk-confirm-cancel
                onClick={() => setBulkDeleteOpen(false)}
                disabled={bulkDeleting}
              >
                {t.modals.cancel}
              </button>
              <button
                type="button"
                className="confirm-modal-danger"
                onClick={() => void deleteInterviewsBulk()}
                disabled={bulkDeleting}
              >
                {t.modals.delete}
              </button>
            </div>
          </div>
        </div>
      )}
      {growlMessage && (
        <div className={`error-growl ${growlTone === "notice" ? "notice" : ""}`} role="alert" aria-live="assertive">
          <span aria-hidden="true">{growlTone === "notice" ? "i" : "!"}</span>
          <p>{growlMessage}</p>
          <button onClick={() => setGrowlMessage("")} aria-label={t.modals.growlClose}>×</button>
        </div>
      )}
    </div>
  );
}
