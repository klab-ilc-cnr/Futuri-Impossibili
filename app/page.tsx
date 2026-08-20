"use client";

import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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

type TextConversionJob = {
  state: string;
  message?: string;
};

type BulkTextJobItem = {
  fileId: string;
  originalFileName?: string;
  state: string;
  message?: string;
  resultId?: string;
};

type BulkTextJob = {
  bulkId: string;
  state: string;
  completed: number;
  failed: number;
  cancelled: number;
  items: BulkTextJobItem[];
};

const menuItems = [
  "Il Progetto",
  "Statistiche",
  "Esplora Dizionario",
  "Interrogazioni",
  "Costruisci Dizionario",
  "Risultati Scientifici",
  "Contatti",
];

const appVersion = "0.6.0";

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "/futuri-impossibili").replace(/\/$/, "");

const textsEndpoint = `${basePath}/api/lexo/texts`;
const textUploadEndpoint = `${basePath}/api/lexo/texts/upload`;
const textBulkUploadEndpoint = `${basePath}/api/lexo/texts/bulk`;
const conceptsEndpoint = `${basePath}/api/lexo/lexical-concepts`;
const lexicalEntriesEndpoint = `${basePath}/api/lexo/lexical-entries`;
const metadataEndpoint = `${basePath}/api/lexo/metadata`;
const lexicalConceptEndpoint = `${basePath}/api/lexo/lexical-concept`;
const attestationsEndpoint = `${basePath}/api/lexo/attestations`;
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

const polarityOptions: Array<{ value: ConceptPolarity; label: string }> = [
  { value: "negative", label: "Negative" },
  { value: "neutral", label: "Neutral" },
  { value: "positive", label: "Positive" },
];

const definitionTypeOptions: Array<{ value: DefinitionType; label: string }> = [
  { value: "sinonimo", label: "Sinonimo" },
  { value: "parafrasi", label: "Parafrasi" },
  { value: "esempio-prototipo", label: "Esempio prototipo" },
  { value: "associazione-concettuale", label: "Associazione concettuale" },
];

const conceptRelationOptions: Array<{ value: ConceptRelationType; label: string }> = [
  { value: "paradigmatico", label: "Paradigmatico" },
  { value: "narrativo", label: "Narrativo" },
];

const evidenceStatusOptions: Array<{ value: EvidenceStatus; label: string }> = [
  { value: "nessuno", label: "Nessuno" },
  { value: "attestato", label: "Attestato" },
  { value: "inferito", label: "Inferito" },
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
    const lexicalSenseType = "http://www.w3.org/ns/lemon/ontolex#LexicalSense";
    function collectTypes(value: unknown): string[] {
      if (Array.isArray(value)) return value.flatMap(collectTypes);
      if (typeof value === "string") return [value.trim()];
      if (!value || typeof value !== "object") return [];
      const container = value as Record<string, unknown>;
      return collectTypes(container.value ?? container.iri ?? container["@id"] ?? container.id);
    }
    return values.flatMap(collectTypes).includes(lexicalSenseType);
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
      if (effectiveConceptIri) {
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
        current.concepts.set(effectiveConceptIri, {
          attestationIri,
          observableIri: observable,
          lexicalConcept: effectiveConceptIri,
          label: displayLabels[0] ?? effectiveConceptLabel ?? conceptLabel ?? effectiveConceptIri,
          options: {
            relationType: referringConceptIri ? "paradigmatico" : polarity || definitionType ? "narrativo" : "",
            polarity,
            definitionType,
            evidenceStatus,
            pragmaticUsage,
            note,
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

async function waitForBulkTextConversion(bulkId: string) {
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const response = await fetch(
      `${textBulkUploadEndpoint}/${encodeURIComponent(bulkId)}/status`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    if (!response.ok) throw new Error(await readErrorDetail(response));

    const job = readBulkTextJob(await response.json() as unknown);
    if (job && ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"].includes(job.state)) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Tempo massimo superato durante l’importazione bulk");
}

function describeBulkFailures(job: BulkTextJob) {
  const details = job.items
    .filter((item) => ["FAILED", "CANCELLED"].includes(item.state))
    .slice(0, 3)
    .map((item) => `${item.originalFileName ?? item.fileId}: ${item.message ?? item.state.toLocaleLowerCase("it-IT")}`);
  return details.join(" · ");
}

function getDefinitionTypeSvg(type: DefinitionType): string {
  const common = 'viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  if (type === "sinonimo") {
    return `<svg ${common}><path d="M12.2 10.2 9.8 7.8a5 5 0 0 0-7.1 7.1l3.8 3.8a5 5 0 0 0 7.1 0l1.5-1.5" /><path d="m19.8 21.8 2.4 2.4a5 5 0 0 0 7.1-7.1l-3.8-3.8a5 5 0 0 0-7.1 0l-1.5 1.5" /><path d="m10.8 21.2 10.4-10.4" /></svg>`;
  }
  if (type === "parafrasi") {
    return `<svg ${common}><path d="M4 6.5h15a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H10l-5 4v-4H4a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3Z" /><path d="M10 23.5h12l5 4v-4h1a3 3 0 0 0 3-3v-5a3 3 0 0 0-3-3h-2" /><path d="M7 11h9M7 14h6" /></svg>`;
  }
  if (type === "esempio-prototipo") {
    return `<svg ${common}><path d="M11 23h10M12.5 27h7" /><path d="M9.2 18.5A9 9 0 1 1 22.8 18.5c-1.2 1-1.8 2-1.8 4.5H11c0-2.5-.6-3.5-1.8-4.5Z" /><path d="m16 7.5 1.2 2.5 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4L16 7.5Z" /></svg>`;
  }
  return `<svg ${common}><rect x="5" y="4" width="22" height="24" rx="3" /><path d="M9 10h14M9 15h14M9 20h8" /></svg>`;
}

function createTooltipElement(annotation: Annotation): HTMLElement {
  const tooltip = document.createElement("span");
  tooltip.className = "attestation-tooltip";
  tooltip.setAttribute("aria-hidden", "true");

  const conceptItems = annotation.concepts.length
    ? annotation.concepts
    : annotation.label.split("\n").map((label, i) => ({
        attestationIri: "",
        observableIri: "",
        lexicalConcept: `fallback-${i}`,
        label,
        options: {
          relationType: "",
          polarity: "",
          definitionType: "",
          evidenceStatus: "nessuno",
          pragmaticUsage: "nessuno",
          note: "",
        } as ConceptAnnotationOptions,
      }));

  for (const concept of conceptItems) {
    const row = document.createElement("span");
    row.className = "attestation-tooltip-row";

    const labelEl = document.createElement("span");
    labelEl.className = "attestation-tooltip-label";
    labelEl.setAttribute("data-label", concept.label);
    row.appendChild(labelEl);

    const icons = document.createElement("span");
    icons.className = "attestation-tooltip-icons";

    if (concept.options.polarity) {
      const pol = document.createElement("span");
      pol.className = `tooltip-polarity polarity-${concept.options.polarity}`;
      const sentiment = document.createElement("span");
      sentiment.className = "sentiment-face tooltip-sentiment";
      sentiment.setAttribute("role", "img");
      sentiment.setAttribute("aria-label", `Polarità: ${concept.options.polarity}`);
      pol.appendChild(sentiment);
      icons.appendChild(pol);
    }

    if (concept.options.definitionType) {
      const def = document.createElement("span");
      def.className = "tooltip-definition-icon";
      def.setAttribute("role", "img");
      def.setAttribute("aria-label", `Tipo definizione: ${concept.options.definitionType}`);
      def.title = `Tipo definizione: ${concept.options.definitionType}`;
      def.innerHTML = getDefinitionTypeSvg(concept.options.definitionType);
      icons.appendChild(def);
    }

    row.appendChild(icons);
    tooltip.appendChild(row);
  }

  return tooltip;
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

export default function Home() {
  const [activePage, setActivePage] = useState(0);
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
  const [locusDragging, setLocusDragging] = useState(false);
  const [conceptFilter, setConceptFilter] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; concept: LexicalConcept } | null>(null);
  const [conceptToDelete, setConceptToDelete] = useState<LexicalConcept | null>(null);
  const [conceptDeleting, setConceptDeleting] = useState(false);
  const conceptFilterClickTimer = useRef<number | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const annotatedWrapRef = useRef<HTMLDivElement>(null);
  const annotationLayerRef = useRef<HTMLDivElement>(null);
  const conceptSidebarRef = useRef<HTMLElement>(null);
  const annotationActionsRef = useRef<HTMLDivElement>(null);
  const confirmDeleteRef = useRef<HTMLDivElement>(null);
  const conceptConfirmRef = useRef<HTMLDivElement>(null);
  const textRequestId = useRef(0);
  const activeInterviewIdRef = useRef("");
  const conceptsRequestId = useRef(0);
  const lexicalSenseTypesRequestIds = useRef<Record<string, number>>({});
  const growlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locusDragEndpoint = useRef<"start" | "end" | null>(null);
  const dragBoundsRef = useRef<{ start: number; end: number } | null>(null);
  const locusOutsidePointerStart = useRef<{ x: number; y: number } | null>(null);

  const activeInterview = interviews.find((item) => item.id === activeInterviewId) ?? interviews[0];
  const text = activeInterview?.text ?? "";
  const fileName = activeInterview?.name ?? "Nessuna intervista";
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
        interview.name.toLocaleLowerCase("it-IT").includes(normalizedInterviewQuery),
      )
    : interviews;
  const filteredConcepts = concepts.filter((concept) =>
    concept.defaultLabel.toLocaleLowerCase("it").includes(conceptSearchQuery.trim().toLocaleLowerCase("it")),
  );
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

  const loadLexicalEntries = useCallback(async () => {
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
      setLexicalEntriesError(error instanceof Error ? error.message : "errore sconosciuto");
    } finally {
      setLexicalEntriesLoading(false);
    }
  }, []);

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
      const message = error instanceof Error ? error.message : "errore sconosciuto";
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
      showError(`Impossibile caricare i metadata dei sensi: ${message}`);
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

  useEffect(() => () => {
    if (growlTimer.current) clearTimeout(growlTimer.current);
  }, []);

  const [layerTick, setLayerTick] = useState(0);

  const editAnnotation = useCallback((annotation: Annotation, target: HTMLElement) => {
    if (attestationSaving) return;
    const rect = target.getBoundingClientRect();
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
    setSelection({
      start: annotation.start,
      end: annotation.end,
      text: text.slice(annotation.start, annotation.end),
      x: Math.min(window.innerWidth - 154, Math.max(12, rect.left + rect.width / 2 - 71)),
      y: Math.max(12, rect.top - 52),
      mode: "edit",
      sourceStart: annotation.start,
      sourceEnd: annotation.end,
      locusIri: annotation.locusIri,
    });
    void loadLexicalEntries();
  }, [attestationSaving, concepts, loadLexicalEntries, text]);

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
    const barHeight = 5;
    const barGap = 3;

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
        jobs.push({
          annotation,
          index,
          start: annotation.start,
          end: annotation.end,
        });
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

      rects.forEach((rect, rIndex) => {
        if (rect.width <= 0 || rect.height <= 0) return;
        const highlightEl = document.createElement("div");
        highlightEl.className = `annotation-highlight${isSingle ? "" : " overlap"}${isSingle && primaryJob.index === editingAnnotationIndex ? " editing" : ""}`;
        if (isSingle) {
          highlightEl.setAttribute("data-annotation-index", String(primaryJob.index));
          highlightEl.setAttribute("role", "button");
          highlightEl.setAttribute("tabindex", "0");
          highlightEl.setAttribute("aria-label", `Modifica attestazione: ${primaryJob.annotation.label.replace(/\n/g, ", ")}`);
          highlightEl.title = "Modifica attestazione";
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

          if (rIndex === 0 && segStart === primaryJob.start) {
            highlightEl.appendChild(createTooltipElement(primaryJob.annotation));
          }
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
      const range = createRangeForOffsets(entries, annotation.start, annotation.end);
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
        barEl.setAttribute("aria-label", label ? `Modifica attestazione: ${label}` : "Modifica attestazione");
        barEl.title = label || "Modifica attestazione";
        barEl.style.left = `${bar.left}px`;
        barEl.style.top = `${bar.top + level * (barHeight + barGap)}px`;
        barEl.style.width = `${bar.right - bar.left}px`;
        barEl.onmousedown = (event) => {
          event.stopPropagation();
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

      const locusRange = createRangeForOffsets(entries, activeStart, activeEnd);
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
  }, [annotations, conceptFilter, editAnnotation, editingAnnotationIndex, locusDragging, locusEditing, nudgeLocusEndpoint, selection, textError, textLoading]);

  useLayoutEffect(() => {
    drawAnnotationsLayer();
    if (!textLoading) {
      const frame = requestAnimationFrame(() => drawAnnotationsLayer());
      return () => cancelAnimationFrame(frame);
    }
  }, [drawAnnotationsLayer, layerTick, text, textError, textLoading, workspaceVisible]);

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
        const targetElement = target instanceof Element ? target : target.parentElement;
        if (targetElement?.closest(".annotation-highlight")
          || targetElement?.closest(".bar")
          || targetElement?.closest(".locus-editing-highlight")
          || targetElement?.closest(".locus-handle")
          || annotationActionsRef.current?.contains(target)
          || (conceptSelectionActive && conceptSidebarRef.current?.contains(target))
          || confirmDeleteRef.current?.contains(target)) return;
        locusOutsidePointerStart.current = { x: event.clientX, y: event.clientY };
        return;
      }
      if (textRef.current?.contains(target) || annotationActionsRef.current?.contains(target)) return;
      if (conceptSelectionActive && conceptSidebarRef.current?.contains(target)) return;
      if (confirmDeleteRef.current?.contains(target)) return;
      resetSelectionFlow();
    }

    function finishOutsideLocusPointer(event: PointerEvent) {
      const start = locusOutsidePointerStart.current;
      locusOutsidePointerStart.current = null;
      if (!start || !locusEditing) return;
      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (distance <= 3) resetSelectionFlow();
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
  }, [attestationSaving, conceptSelectionActive, locusEditing, resetSelectionFlow, selection]);

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
      showError(`Esiste già un concetto chiamato “${label}”.`);
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
      showNotice(`Concetto “${label}” creato correttamente.`);
    } catch (error) {
      showError(`Il concetto non è stato creato: ${error instanceof Error ? error.message : "errore sconosciuto"}`);
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
      showError(`Esiste già un concetto chiamato “${target}”.`);
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
      showNotice(`Concetto rinominato in “${target}”.`);
    } catch (error) {
      setEditedConceptLabel(concept.defaultLabel);
      setEditingConceptUrl("");
      showError(`La label non è stata modificata a causa di un errore in LexO-server: ${error instanceof Error ? error.message : "errore sconosciuto"}`);
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
      showError(`Il concetto “${concept.defaultLabel}” è usato e non può essere eliminato.`);
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
      showNotice(`Concetto “${concept.defaultLabel}” eliminato.`);
    } catch (error) {
      setConceptToDelete(null);
      showError(`Il concetto non è stato eliminato: ${error instanceof Error ? error.message : "errore sconosciuto"}`);
    } finally {
      setConceptDeleting(false);
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
    resetSelectionFlow();
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

  async function handleBulkFiles(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;

    textRequestId.current += 1;
    setUploadLoading(true);
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
      if (!acceptedJob) throw new Error("LexO-server non ha restituito l’identificativo del bulk");

      const completedJob = await waitForBulkTextConversion(acceptedJob.bulkId);
      const firstCompleted = completedJob.items.find((item) => item.state === "COMPLETED");
      if (!firstCompleted) {
        throw new Error(describeBulkFailures(completedJob) || "Nessun testo del bulk è stato convertito");
      }

      const preferredInterviewId = firstCompleted.resultId ?? firstCompleted.fileId;
      activeInterviewIdRef.current = preferredInterviewId;
      setSearchQuery("");
      if (!await loadArchive(preferredInterviewId)) {
        throw new Error("I testi convertiti non sono ancora disponibili nell’archivio");
      }

      if (completedJob.state === "PARTIALLY_COMPLETED") {
        const detail = describeBulkFailures(completedJob);
        showError(`Importazione parziale: ${completedJob.completed} file caricati, ${completedJob.failed} non riusciti${detail ? `. ${detail}` : "."}`);
      }
    } catch (error) {
      setArchiveLoading(false);
      setTextLoading(false);
      showError(`Errore durante l’importazione bulk: ${error instanceof Error ? error.message : "errore sconosciuto"}`);
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
      setSelection((current) => current && current.mode === "edit" ? {
        ...current,
        start,
        end: start + selectedText.length,
        text: selectedText,
        x: Math.min(window.innerWidth - 154, Math.max(12, rect.left + rect.width / 2 - 71)),
        y: Math.max(12, rect.top - 52),
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
      showError("Scegli paradigmatico o narrativo e completa gli attributi richiesti per ogni concetto.");
      return;
    }
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
          return `${concept.defaultLabel}: ${error instanceof Error ? error.message : "errore sconosciuto"}`;
        }
      }));

      let annotationsReloadError = "";
      try {
        const loadedAnnotations = await fetchAttestations(activeInterview.id, concepts);
        setInterviews((current) => current.map((interview) => interview.id === activeInterview.id
          ? { ...interview, annotations: loadedAnnotations, annotationCount: loadedAnnotations.length }
          : interview));
      } catch (error) {
        annotationsReloadError = error instanceof Error ? error.message : "errore sconosciuto";
      }
      resetSelectionFlow();
      const failedUpdates = lexicalConceptUpdates.filter(Boolean);
      if (failedUpdates.length > 0) {
        showError(`Attestazione creata, ma non è stato possibile aggiornare ${failedUpdates.length} concetti narrativi (${failedUpdates.join(" · ")}).`);
      } else if (annotationsReloadError) {
        showError(`Attestazione creata, ma non è stato possibile ricaricare l’elenco (${annotationsReloadError}).`);
      } else {
        showNotice("Annotazione salvata.");
      }
    } catch (error) {
      showError(`Errore durante il salvataggio dell’annotazione: ${error instanceof Error ? error.message : "errore sconosciuto"}`);
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
      showError("Non è possibile modificare il locus: mancano i dati del testo su LexO-server.");
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
      showError("Non è possibile modificare il locus: mancano gli IRI delle attestazioni selezionate.");
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
        throw new Error(`${failures.length} di ${attestationIris.length} aggiornamenti non riusciti: ${
          firstFailure instanceof Error ? firstFailure.message : "errore sconosciuto"
        }`);
      }
      showNotice(`Nuovo locus salvato: start ${selection.start}, end ${selection.end}.`);
    } catch (error) {
      showError(`Errore durante la modifica del locus: ${error instanceof Error ? error.message : "errore sconosciuto"}`);
    } finally {
      setAttestationSaving(false);
    }
  }

  async function requestAnnotationUpdate() {
    if (!selection || !editingAttestation || !editDirty || attestationSaving) return;
    if (!addedConceptsConfigured) {
      showError("Completa entrata, relazione e attributi obbligatori dei nuovi concetti.");
      return;
    }
    if (!activeInterview || activeInterview.source !== "server" || !activeInterview.contextIri) {
      showError("Non è possibile modificare l’attestazione: mancano i dati del testo su LexO-server.");
      return;
    }
    if (!selection.locusIri) {
      showError("Non è possibile modificare l’attestazione: manca l’IRI del locus.");
      return;
    }

    const addedConcepts = addedList.flatMap((lexicalConcept) => {
      const concept = concepts.find((item) => item.lexicalConcept === lexicalConcept);
      return concept ? [concept] : [];
    });
    if (addedConcepts.length !== addedList.length) {
      showError("Uno dei nuovi concetti selezionati non è più disponibile.");
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
        if (!response.ok) throw new Error(`Rimozione: ${await readErrorDetail(response)}`);
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
        if (!response.ok) throw new Error(`Aggiunta: ${await readErrorDetail(response)}`);
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
            throw new Error(`Collegamento del senso per ${concept.defaultLabel}: ${await readErrorDetail(patchResponse)}`);
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
        if (!response.ok) throw new Error(`Aggiornamento metadati: ${await readErrorDetail(response)}`);
        mutationCompleted = true;
      }

      const loadedAnnotations = await fetchAttestations(activeInterview.id, concepts);
      setInterviews((current) => current.map((interview) => interview.id === activeInterview.id
        ? { ...interview, annotations: loadedAnnotations, annotationCount: loadedAnnotations.length }
        : interview));
      resetSelectionFlow();
      showNotice("Modifiche all’attestazione salvate.");
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
      showError(`Errore durante la modifica dell’attestazione: ${error instanceof Error ? error.message : "errore sconosciuto"}`);
    } finally {
      setAttestationSaving(false);
    }
  }

  async function requestAnnotationDeletion() {
    if (!editingAttestation || attestationSaving) return;
    if (!activeInterview || activeInterview.source !== "server" || !activeInterview.contextIri) {
      showError("Non è possibile eliminare l’attestazione: l’intervista non contiene l’IRI del nif:Context.");
      return;
    }
    if (!selection.locusIri) {
      showError("Non è possibile eliminare l’attestazione: il servizio non ha restituito l’IRI del locus.");
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
      showNotice("Attestazione eliminata.");
    } catch (error) {
      showError(`Errore durante l’eliminazione dell’attestazione: ${error instanceof Error ? error.message : "errore sconosciuto"}`);
    } finally {
      setAttestationSaving(false);
    }
  }

  function renderAnnotatedText() {
    const headingMatch = /Trascrizione Intervista/i.exec(text);
    if (!headingMatch) return <span>{text}</span>;

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
        {text.slice(headingEnd)}
      </>
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
            <p className="eyebrow">Ricerca Linguistica e Innovazione Sociale</p>
            <h1>Futuri (im)Possibili</h1>
          </div>
        </div>
        <div className="partner-logos" aria-label="Partner del progetto">
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

      <nav className="main-nav" aria-label="Navigazione principale">
        {menuItems.map((item, index) => (
          <button
            key={item}
            className={activePage === index ? "active" : ""}
            onClick={() => {
              setActivePage(index);
              if (index === 4) void loadConcepts();
            }}
            aria-label={index === 4 ? `${item}, area riservata con autenticazione` : item}
            title={index === 4 ? "Area riservata: sarà richiesta l’autenticazione" : undefined}
          >
            {item}
            {index === 4 && <span className="nav-lock" aria-hidden="true">🔒</span>}
          </button>
        ))}
        <span className="main-nav-version" title={`Versione dell’interfaccia ${appVersion}`}>v{appVersion}</span>
      </nav>

      <main>
        {activePage === 1 ? (
          <section className="statistics-page" aria-label="Statistiche" />
        ) : activePage === 4 ? (
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
                      title="Carica una intervista"
                    >
                      <span aria-hidden="true">↑</span>
                      <input
                        type="file"
                        accept=".txt,.md,.markdown,text/plain,text/markdown"
                        onChange={(event) => void handleFile(event)}
                        disabled={uploadLoading}
                      />
                    </label>
                    <label
                      className={`archive-upload archive-upload-bulk ${uploadLoading ? "disabled" : ""}`}
                      aria-label="Carica più interviste in bulk"
                      aria-disabled={uploadLoading}
                      title="Carica più interviste in bulk"
                    >
                      <span aria-hidden="true">⇈</span>
                      <input
                        type="file"
                        accept=".txt,.md,.markdown,text/plain,text/markdown"
                        onChange={(event) => void handleBulkFiles(event)}
                        disabled={uploadLoading}
                        multiple
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
                    onMouseDown={(event) => {
                      if ((event.target as HTMLElement).closest(".annotation-highlight, .bar, .locus-handle")) return;
                      if (event.detail <= 1) setDragging(true);
                    }}
                    onMouseUp={(event) => {
                      if ((event.target as HTMLElement).closest(".annotation-highlight, .bar, .locus-handle")) {
                        setDragging(false);
                        return;
                      }
                      captureSelection();
                    }}
                  >
                    <div className="annotated-text-wrap" ref={annotatedWrapRef}>
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
                      <div
                        className="annotation-layer"
                        ref={annotationLayerRef}
                      />
                    </div>
                  </div>
                </div>
                <div className="document-foot">
                  {attestationSaving ? (
                    <div className="annotation-progress" role="status" aria-live="polite" aria-label="Salvataggio annotazione in corso">
                      <span aria-hidden="true" />
                    </div>
                  ) : (
                    <span>{locusEditing
                      ? "Modifica locus: trascina le maniglie oppure seleziona un nuovo intervallo"
                      : editingAttestation
                        ? "Modalità modifica attestazione"
                        : "Seleziona una porzione di testo con il mouse"}</span>
                  )}
                  <div className="legend">
                    <span />
                    {conceptFilter
                      ? `${filteredAnnotations.length} di ${annotations.length} annotazioni · Concetto`
                      : `${annotations.length} annotazioni`}
                    {conceptFilter && (
                      <button
                        type="button"
                        className="concept-filter-chip"
                        onClick={() => setConceptFilter(null)}
                        title="Rimuovi il filtro concetto"
                        aria-label="Rimuovi il filtro concetto"
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
                aria-label="Repertorio dei concetti"
              >
                <div className="sidebar-heading concept-heading">
                  <span>REPERTORIO</span>
                  <div className="concept-heading-row">
                    <strong>Concetti</strong>
                    <button
                      className="archive-upload concept-add"
                      onClick={startConceptCreation}
                      disabled={conceptsLoading || Boolean(conceptsError) || conceptCreating || creatingConcept || Boolean(savingConceptUrl)}
                      aria-label="Aggiungi lexical concept"
                      title="Aggiungi lexical concept"
                    >
                      <span aria-hidden="true">+</span>
                    </button>
                    {(conceptCreating || savingConceptUrl) && (
                      <span
                        className="concept-create-spinner"
                        role="status"
                        aria-label={conceptCreating
                          ? "Creazione del concetto in corso"
                          : "Rinomina del concetto in corso"}
                      />
                    )}
                    <button
                      className="archive-reload"
                      onClick={() => {
                        cancelConceptCreation();
                        void loadConcepts();
                      }}
                      disabled={conceptsLoading || conceptCreating || Boolean(savingConceptUrl)}
                      aria-label="Ricarica concetti da LexO-server"
                      title="Ricarica concetti"
                    >
                      ↻
                    </button>
                    <small className="sidebar-count">{conceptTotalHits} voci</small>
                  </div>
                </div>
                <div className="concept-intro">
                  {editingAttestation
                    ? "Modifica i concetti associati o i loro attributi. Il tipo narrativo/paradigmatico dei concetti esistenti non può essere cambiato."
                    : conceptSelectionActive
                      ? "Seleziona uno o più concetti, poi scegli entrata lessicale e attributi in ciascun pannello."
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
                            placeholder="Scrivi il nome del concetto"
                            aria-label="Nome del nuovo lexical concept"
                            autoFocus
                          />
                          <button
                            type="button"
                            className="concept-edit-confirm"
                            onClick={() => void createConcept()}
                            disabled={conceptCreating}
                            aria-label="Conferma creazione"
                            title="Conferma creazione"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className="concept-edit-cancel"
                            onClick={cancelConceptCreation}
                            disabled={conceptCreating}
                            aria-label="Annulla creazione"
                            title="Annulla creazione"
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
                                aria-label={`Modifica ${concept.defaultLabel}`}
                                autoFocus
                              />
                              <button
                                type="button"
                                className="concept-edit-confirm"
                                onClick={() => void saveConceptLabel(concept)}
                                disabled={isSaving}
                                aria-label="Conferma rinomina"
                                title="Conferma rinomina"
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
                                aria-label="Annulla rinomina"
                                title="Annulla rinomina"
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
                                ? "Clic per selezionare il concetto"
                                : "Clic per filtrare le annotazioni per concetto"}
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
                            {!isExistingEditingConcept && (
                              <fieldset>
                                <legend>Entrata lessicale</legend>
                                <select
                                  className="concept-entry-select"
                                  value={annotationOptions.lexicalEntry}
                                  onChange={(event) => void selectLexicalEntryOption(concept.lexicalConcept, event.target.value)}
                                  disabled={lexicalEntriesLoading || attestationSaving}
                                  aria-label={`Entrata lessicale per ${concept.defaultLabel}`}
                                >
                                  <option value="">{lexicalEntriesLoading ? "Caricamento…" : "Scegli un’entrata…"}</option>
                                  {lexicalEntries.map((lexicalEntry) => (
                                    <option key={lexicalEntry.entry} value={lexicalEntry.entry}>
                                      {lexicalEntry.label}
                                    </option>
                                  ))}
                                </select>
                                {lexicalEntriesError && (
                                  <div className="concept-entry-message error">
                                    Entrate non disponibili. <button type="button" onClick={() => void loadLexicalEntries()}>Riprova</button>
                                  </div>
                                )}
                                {annotationOptions.sensesLoading && (
                                  <div className="concept-entry-message">Caricamento metadata dei sensi…</div>
                                )}
                                {annotationOptions.sensesError && (
                                  <div className="concept-entry-message error">
                                    Metadata non disponibili. <button type="button" onClick={() => void selectLexicalEntryOption(concept.lexicalConcept, annotationOptions.lexicalEntry)}>Riprova</button>
                                  </div>
                                )}
                                {annotationOptions.sensesReady && (!annotationOptions.narrativeSense || !annotationOptions.paradigmaticSense) && (
                                  <div className="concept-entry-message error">
                                    {!annotationOptions.narrativeSense && !annotationOptions.paradigmaticSense
                                      ? "Nessun senso narrativo o paradigmatico trovato."
                                      : !annotationOptions.narrativeSense
                                        ? "Senso narrativo non disponibile."
                                        : "Senso paradigmatico non disponibile."}
                                  </div>
                                )}
                              </fieldset>
                            )}
                            <fieldset disabled={isExistingEditingConcept || !annotationOptions.sensesReady}>
                              <legend>Relazione</legend>
                              <div className="concept-option-grid relation-options">
                                {conceptRelationOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className={`concept-option ${annotationOptions.relationType === option.value ? "active" : ""}`}
                                    onClick={() => selectConceptRelation(concept.lexicalConcept, option.value)}
                                    aria-pressed={annotationOptions.relationType === option.value}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </fieldset>
                            <fieldset
                              className="dependent-concept-options"
                              disabled={annotationOptions.relationType !== "narrativo"}
                            >
                              <legend>Polarità</legend>
                              <div className="concept-option-grid polarity-options">
                                {polarityOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className={`concept-option polarity-${option.value} ${annotationOptions.polarity === option.value ? "active" : ""}`}
                                    onClick={() => updateConceptAnnotationOptions(concept.lexicalConcept, { polarity: option.value })}
                                    aria-pressed={annotationOptions.polarity === option.value}
                                    aria-label={`Polarità ${option.label}`}
                                    title={option.label}
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
                              <legend>Tipo di definizione</legend>
                              <div className="concept-option-grid definition-options">
                                {definitionTypeOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className={`concept-option ${annotationOptions.definitionType === option.value ? "active" : ""}`}
                                    onClick={() => updateConceptAnnotationOptions(concept.lexicalConcept, { definitionType: option.value })}
                                    aria-pressed={annotationOptions.definitionType === option.value}
                                    aria-label={`Tipo di definizione: ${option.label}`}
                                    title={option.label}
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
                              <legend>Tipo di evidenza</legend>
                              <div className="concept-option-grid evidence-options">
                                {evidenceStatusOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className={`concept-option ${annotationOptions.evidenceStatus === option.value ? "active" : ""}`}
                                    onClick={() => updateConceptAnnotationOptions(concept.lexicalConcept, { evidenceStatus: option.value })}
                                    aria-pressed={annotationOptions.evidenceStatus === option.value}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </fieldset>
                            <fieldset
                              className="dependent-concept-options"
                              disabled={annotationOptions.relationType !== "narrativo"}
                            >
                              <legend>Modi d’uso</legend>
                              <select
                                className="concept-metadata-select"
                                value={annotationOptions.pragmaticUsage}
                                onChange={(event) => updateConceptAnnotationOptions(concept.lexicalConcept, { pragmaticUsage: event.target.value })}
                                aria-label={`Modo d’uso per ${concept.defaultLabel}`}
                              >
                                <option value="nessuno">Nessuno</option>
                              </select>
                            </fieldset>
                            <fieldset
                              className="dependent-concept-options"
                              disabled={annotationOptions.relationType !== "narrativo"}
                            >
                              <legend>Note</legend>
                              <textarea
                                className="concept-note-input"
                                value={annotationOptions.note}
                                onChange={(event) => updateConceptAnnotationOptions(concept.lexicalConcept, { note: event.target.value })}
                                placeholder="Aggiungi una nota…"
                                aria-label={`Note per ${concept.defaultLabel}`}
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
                      {concepts.length === 0 ? "Nessun concetto trovato." : "Nessun concetto corrispondente."}
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
                      <span className="concept-status-spinner" role="status" aria-label="Salvataggio in corso" />
                    ) : annotationActionReady ? (
                      <span className="concept-status-save">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                          <path d="M17 21v-8H7v8M7 3v5h8" />
                        </svg>
                        <strong>{editingAttestation ? "Conferma modifiche" : "Salva annotazione"}</strong>
                      </span>
                    ) : (
                      <>
                        <strong>{selectedConcepts.length}</strong>
                        <span>{selectedConcepts.length === 1 ? "concetto selezionato" : "concetti selezionati"}</span>
                        <small>
                          {editingAttestation
                            ? editDirty
                              ? "Completa i dati obbligatori dei nuovi concetti"
                              : "Modifica concetti o attributi"
                            : selectedConcepts.length
                              ? "Completa entrata, relazione e attributi di ogni concetto"
                              : "Scegli almeno un concetto"}
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
            <h2>{menuItems[activePage]}</h2>
            <p>Questa sezione è pronta per ospitare il prossimo servizio di LexO-server.</p>
            <div className="placeholder-grid">
              <div /><div /><div />
            </div>
          </section>
        )}
      </main>

      {selection && editingAttestation && activePage === 4 && (
        <div
          ref={annotationActionsRef}
          className="annotation-actions"
          style={{ left: selection.actionX ?? selection.x, top: selection.y }}
        >
          {editingAttestation && (
            <>
              <button
                className={`annotation-locus ${locusDirty ? "active" : ""} ${locusEditing && !locusDirty ? "idle" : ""}`}
                onClick={() => void toggleLocusEditing()}
                disabled={attestationSaving || editDirty}
                aria-pressed={locusDirty}
                aria-label={locusEditing ? "Salva i nuovi limiti dell’evidenziazione" : "Modifica i limiti dell’evidenziazione"}
                title={locusEditing ? "Salva nuovo start ed end" : "Modifica start ed end"}
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
                aria-label="Elimina l’intera attestazione"
                title="Elimina attestazione e concetti associati"
              >
                <span className="trash-icon" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      )}
      {confirmDeleteOpen && (
        <div
          ref={confirmDeleteRef}
          className="confirm-modal-overlay"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setConfirmDeleteOpen(false);
          }}
        >
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title">
            <p className="confirm-modal-kicker">ELIMINAZIONE</p>
            <h3 id="confirm-delete-title">Eliminare l’attestazione?</h3>
            <p>
              Verranno eliminate l’attestazione &quot;{selection?.text}&quot; e i concetti ad essa associati.
              L’operazione non può essere annullata.
            </p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                data-confirm-cancel
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={attestationSaving}
              >
                Annulla
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
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="concept-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          aria-label="Menu concetto"
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
            Elimina
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
            <p className="confirm-modal-kicker">ELIMINAZIONE</p>
            <h3 id="concept-delete-title">Eliminare il concetto &quot;{conceptToDelete.defaultLabel}&quot;?</h3>
            <p>
              Il concetto verrà rimosso dal repertorio. L’operazione non può essere annullata.
            </p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                data-concept-confirm-cancel
                onClick={() => setConceptToDelete(null)}
                disabled={conceptDeleting}
              >
                Annulla
              </button>
              <button
                type="button"
                className="confirm-modal-danger"
                onClick={() => void deleteConcept(conceptToDelete)}
                disabled={conceptDeleting}
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
      {growlMessage && (
        <div className={`error-growl ${growlTone === "notice" ? "notice" : ""}`} role="alert" aria-live="assertive">
          <span aria-hidden="true">{growlTone === "notice" ? "i" : "!"}</span>
          <p>{growlMessage}</p>
          <button onClick={() => setGrowlMessage("")} aria-label="Chiudi messaggio">×</button>
        </div>
      )}
    </div>
  );
}
