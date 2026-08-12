"use client";

import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

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
  const textRef = useRef<HTMLDivElement>(null);
  const conceptSidebarRef = useRef<HTMLElement>(null);
  const annotationActionsRef = useRef<HTMLDivElement>(null);
  const textRequestId = useRef(0);
  const activeInterviewIdRef = useRef("");
  const conceptsRequestId = useRef(0);
  const lexicalSenseTypesRequestIds = useRef<Record<string, number>>({});
  const growlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locusDragEndpoint = useRef<"start" | "end" | null>(null);
  const locusOutsidePointerStart = useRef<{ x: number; y: number } | null>(null);

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
  const editDirty = removedList.length > 0 || addedList.length > 0 || Object.keys(updatedList).length > 0;
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

  useEffect(() => () => {
    if (growlTimer.current) clearTimeout(growlTimer.current);
  }, []);

  useEffect(() => {
    function textOffsetAtPoint(clientX: number, clientY: number) {
      const root = textRef.current;
      if (!root) return null;
      const browserDocument = document as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
      };
      const caretPosition = document.caretPositionFromPoint?.(clientX, clientY);
      const caretRange = caretPosition ? null : browserDocument.caretRangeFromPoint?.(clientX, clientY);
      const node = caretPosition?.offsetNode ?? caretRange?.startContainer;
      const offset = caretPosition?.offset ?? caretRange?.startOffset;
      if (!node || offset === undefined || !root.contains(node)) return null;

      const before = document.createRange();
      before.selectNodeContents(root);
      before.setEnd(node, offset);
      return before.toString().length;
    }

    function moveLocusEndpoint(event: PointerEvent) {
      const endpoint = locusDragEndpoint.current;
      if (!endpoint || !locusEditing) return;
      const offset = textOffsetAtPoint(event.clientX, event.clientY);
      if (offset === null) return;
      event.preventDefault();
      setSelection((current) => {
        if (!current || current.mode !== "edit") return current;
        const nextStart = endpoint === "start"
          ? Math.min(Math.max(0, offset), current.end - 1)
          : current.start;
        const nextEnd = endpoint === "end"
          ? Math.max(Math.min(text.length, offset), current.start + 1)
          : current.end;
        return {
          ...current,
          start: nextStart,
          end: nextEnd,
          text: text.slice(nextStart, nextEnd),
        };
      });
    }

    function stopLocusDrag() {
      locusDragEndpoint.current = null;
    }

    document.addEventListener("pointermove", moveLocusEndpoint);
    document.addEventListener("pointerup", stopLocusDrag);
    document.addEventListener("pointercancel", stopLocusDrag);
    return () => {
      document.removeEventListener("pointermove", moveLocusEndpoint);
      document.removeEventListener("pointerup", stopLocusDrag);
      document.removeEventListener("pointercancel", stopLocusDrag);
    };
  }, [locusEditing, text]);

  useEffect(() => {
    function leaveSelectionFlow(event: PointerEvent) {
      if (!selection || attestationSaving) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (locusEditing) {
        const targetElement = target instanceof Element ? target : target.parentElement;
        if (targetElement?.closest("mark.locus-editing") || annotationActionsRef.current?.contains(target)) return;
        locusOutsidePointerStart.current = { x: event.clientX, y: event.clientY };
        return;
      }
      if (textRef.current?.contains(target) || annotationActionsRef.current?.contains(target)) return;
      if (conceptSelectionActive && conceptSidebarRef.current?.contains(target)) return;
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

  async function selectInterview(interview: Interview) {
    if (attestationSaving || uploadLoading) return;
    activeInterviewIdRef.current = interview.id;
    setActiveInterviewId(interview.id);
    resetSelectionFlow();
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

  function editAnnotation(annotation: Annotation, target: HTMLElement) {
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
    setLocusEditing(false);
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
  }

  async function toggleLocusEditing() {
    if (!selection || selection.mode !== "edit" || attestationSaving) return;
    if (!locusEditing) {
      window.getSelection()?.removeAllRanges();
      setLocusEditing(true);
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

  function nudgeLocusEndpoint(endpoint: "start" | "end", delta: number) {
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

  function renderAnnotatedRange(rangeStart: number, rangeEnd: number, keyPrefix: string) {
    const chunks: React.ReactNode[] = [];
    let cursor = rangeStart;
    annotations.forEach((annotation, index) => {
      const isEditingAnnotation = selection?.mode === "edit"
        && annotation.start === (selection.sourceStart ?? selection.start)
        && annotation.end === (selection.sourceEnd ?? selection.end);
      const displayStart = isEditingAnnotation && locusEditing ? selection!.start : annotation.start;
      const displayEnd = isEditingAnnotation && locusEditing ? selection!.end : annotation.end;
      const annotationStart = Math.max(rangeStart, displayStart);
      const annotationEnd = Math.min(rangeEnd, displayEnd);
      if (annotationStart >= annotationEnd) return;
      if (annotationStart > cursor) {
        chunks.push(
          <span key={`${keyPrefix}-text-${cursor}`}>{text.slice(cursor, annotationStart)}</span>,
        );
      }
      chunks.push(
        <mark
          key={`${keyPrefix}-annotation-${annotationStart}-${index}`}
          data-labels={annotation.label}
          className={isEditingAnnotation
            ? locusEditing ? "editing locus-editing" : "editing"
            : undefined}
          role="button"
          tabIndex={0}
          onMouseDown={(event) => {
            if (!locusEditing) event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            if (locusEditing) return;
            editAnnotation(annotation, event.currentTarget);
          }}
          onKeyDown={(event) => {
            if (locusEditing) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              editAnnotation(annotation, event.currentTarget);
            }
          }}
          aria-label={`Modifica attestazione: ${annotation.label.replace(/\n/g, ", ")}`}
          title="Modifica attestazione"
        >
          {isEditingAnnotation && locusEditing && annotationStart === displayStart && (
            <span
              className="locus-handle locus-handle-start"
              role="slider"
              tabIndex={0}
              aria-label="Sposta l’inizio dell’evidenziazione"
              aria-valuemin={0}
              aria-valuemax={selection!.end - 1}
              aria-valuenow={selection!.start}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                locusDragEndpoint.current = "start";
              }}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                event.stopPropagation();
                nudgeLocusEndpoint("start", event.key === "ArrowLeft" ? -1 : 1);
              }}
            />
          )}
          {text.slice(annotationStart, annotationEnd)}
          {isEditingAnnotation && locusEditing && annotationEnd === displayEnd && (
            <span
              className="locus-handle locus-handle-end"
              role="slider"
              tabIndex={0}
              aria-label="Sposta la fine dell’evidenziazione"
              aria-valuemin={selection!.start + 1}
              aria-valuemax={text.length}
              aria-valuenow={selection!.end}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                locusDragEndpoint.current = "end";
              }}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                event.stopPropagation();
                nudgeLocusEndpoint("end", event.key === "ArrowLeft" ? -1 : 1);
              }}
            />
          )}
          <span className="attestation-tooltip" aria-hidden="true">
            {(annotation.concepts.length
              ? annotation.concepts
              : annotation.label.split("\n").map((label, labelIndex) => ({
                  attestationIri: "",
                  observableIri: "",
                  lexicalConcept: `fallback-${labelIndex}`,
                  label,
                  options: {
                    relationType: "",
                    polarity: "",
                    definitionType: "",
                    evidenceStatus: "nessuno",
                    pragmaticUsage: "nessuno",
                    note: "",
                  } as ConceptAnnotationOptions,
                }))).map((concept) => (
              <span className="attestation-tooltip-row" key={concept.lexicalConcept}>
                <span className="attestation-tooltip-label" data-label={concept.label} />
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
          </span>
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
                    <span>{locusEditing
                      ? "Modifica locus: trascina le maniglie oppure seleziona un nuovo intervallo"
                      : editingAttestation
                        ? "Modalità modifica attestazione"
                        : "Seleziona una porzione di testo con il mouse"}</span>
                  )}
                  <div className="legend"><span /> {annotations.length} annotazioni</div>
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
                        <input
                          className="concept-create-input"
                          value={newConceptLabel}
                          onChange={(event) => setNewConceptLabel(event.target.value)}
                          onKeyDown={handleConceptCreationKeyDown}
                          onBlur={cancelConceptCreation}
                          disabled={conceptCreating}
                          placeholder="Scrivi il nome del concetto"
                          aria-label="Nome del nuovo lexical concept"
                          autoFocus
                        />
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
                        className={`concept-item ${isSelected ? "selected" : ""} ${!conceptSelectionActive ? "selection-disabled" : ""}`}
                      >
                        <div className="concept-main-row">
                          <span className="concept-check">{isSelected ? "✓" : ""}</span>
                          {isEditing ? (
                            <input
                              className="concept-edit-input"
                              value={editedConceptLabel}
                              onChange={(event) => setEditedConceptLabel(event.target.value)}
                              onKeyDown={(event) => handleConceptEditKeyDown(event, concept)}
                              onBlur={() => {
                                if (!isSaving) {
                                  setEditingConceptUrl("");
                                  setEditedConceptLabel("");
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
                              aria-disabled={!conceptSelectionActive || attestationSaving}
                              title="Doppio clic per modificare la label"
                            >
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
                  <div className={`concept-status ${annotationActionReady ? "ready" : ""}`}>
                    <strong>{selectedConcepts.length}</strong>
                    <span>{selectedConcepts.length === 1 ? "concetto selezionato" : "concetti selezionati"}</span>
                    <small>
                      {editingAttestation
                        ? editDirty
                          ? addedConceptsConfigured
                            ? "Premi la penna per applicare le modifiche"
                            : "Completa i dati obbligatori dei nuovi concetti"
                          : "Modifica concetti o attributi"
                        : selectedConceptsConfigured
                          ? "Premi la penna per confermare"
                        : selectedConcepts.length
                          ? "Completa entrata, relazione e attributi di ogni concetto"
                          : "Scegli almeno un concetto"}
                    </small>
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

      {selection && activePage === 4 && (
        <div
          ref={annotationActionsRef}
          className="annotation-actions"
          style={{ left: selection.actionX ?? selection.x, top: selection.y }}
        >
          <button
            className="annotation-trigger"
            data-ready={annotationActionReady}
            onClick={editingAttestation ? requestAnnotationUpdate : addAnnotation}
            disabled={attestationSaving || !annotationActionReady}
            aria-label={editingAttestation
              ? annotationActionReady ? "Conferma modifiche all’attestazione" : "Modifica i concetti per attivare la penna"
              : creationPayloadReady ? "Conferma l’annotazione" : "Completa entrata, relazione e attributi per ogni concetto"}
            title={editingAttestation
              ? annotationActionReady ? "Conferma modifiche" : "Modifica concetti o attributi"
              : creationPayloadReady ? "Conferma l’annotazione" : "Seleziona i concetti e completa i relativi attributi"}
          >
            ✎
          </button>
          {editingAttestation && (
            <>
              <button
                className={`annotation-locus ${locusEditing ? "active" : ""}`}
                onClick={() => void toggleLocusEditing()}
                disabled={attestationSaving || editDirty}
                aria-pressed={locusEditing}
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
                onClick={() => void requestAnnotationDeletion()}
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
