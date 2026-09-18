export type CqQueryId =
  | "cq1-narrative-concepts-by-polarity"
  | "cq1-paradigmatic-concepts"
  | "cq1-concept-detail";

export type CqToken =
  | "TERM"
  | "POLARITY"
  | "CONCEPT"
  | "SEX_FILTER"
  | "AGE_MODE"
  | "AGE1"
  | "AGE2"
  | "RESIDENCE_FILTER";

export interface CqSparqlTemplate {
  id: CqQueryId;
  naturalLanguage: string;
  requiredTokens: CqToken[];
  template: string;
}

const narrativeConceptsByPolarity = String.raw`# Parametri:
#   ?sexFilter        "Maschio", "Femmina", "Tutti"
#   ?ageMode           "maggiore di", "minore di", "compreso tra", "età esatta", "qualunque"
#   ?age1              Età di riferimento o limite inferiore
#   ?age2              Limite superiore, usato soltanto con "compreso tra"
#   ?residenceFilter   Residenza esatta, senza distinzione maiuscole/minuscole; "" per tutte
#
# Per disattivare tutti i filtri demografici:
#   ("Tutti" "qualunque" 0 0 "")
PREFIX ontolex: <http://www.w3.org/ns/lemon/ontolex#>
PREFIX skos:    <http://www.w3.org/2004/02/skos/core#>
PREFIX frac:    <http://www.w3.org/ns/lemon/frac#>
PREFIX rdfs:    <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct:     <http://purl.org/dc/terms/>
PREFIX xsd:     <http://www.w3.org/2001/XMLSchema#>
PREFIX marl:    <http://purl.org/marl/ns#>

SELECT
    ?polarity
    ?concept
    (MIN(STR(?conceptLabel)) AS ?label)
    (COUNT(DISTINCT ?attestation) AS ?numberOfAttestations)
    (COUNT(DISTINCT ?interview) AS ?numberOfTexts)
WHERE {
    # Lista completa dei lexical concept
    {
        SELECT DISTINCT ?concept
        WHERE {
            GRAPH <https://lexo.ilc.cnr.it/graphs/lexical/lexicalConcept> {
                ?concept a ontolex:LexicalConcept .
            }
        }
    }

    OPTIONAL {
        GRAPH <https://lexo.ilc.cnr.it/graphs/lexical/lexicalConcept> {
            ?concept skos:prefLabel ?conceptLabel .
        }
    }

    VALUES ?term { {{TERM}} }

    # Tre righe per ogni concept
    VALUES (?polarity ?polarityOrder) {
        (marl:Positive 1)
        (marl:Neutral  2)
        (marl:Negative 3)
    }

    # Filtri demografici
    VALUES (?sexFilter ?ageMode ?age1 ?age2 ?residenceFilter) {
        ({{SEX_FILTER}} {{AGE_MODE}} {{AGE1}} {{AGE2}} {{RESIDENCE_FILTER}})
    }

    OPTIONAL {
        GRAPH ?attGraph {
            ?concept frac:attestation ?attestation .

            ?attestation
                rdfs:comment ?term ;
                marl:hasPolarity ?polarity ;
                frac:observedIn ?interview .
        }

        FILTER(STRSTARTS(
            STR(?attGraph),
            "https://lexo.ilc.cnr.it/graphs/lexical/attestations/documents/"
        ))

        SERVICE <repository:LexOTexts> {
            GRAPH ?textGraph {
                ?interview dct:description ?description .
            }

            FILTER(STRSTARTS(
                STR(?textGraph),
                "https://lexo.ilc.cnr.it/graphs/nif/documents/"
            ))
        }

        BIND(STR(?description) AS ?demographics)

        BIND(
            "(^|.*,)\\s*Sesso\\s*:\\s*([^,]+)(,.*|$)"
            AS ?sexPattern
        )
        BIND(
            "(^|.*,)\\s*Et[àa]\\s*:\\s*([0-9]+)\\s*(,.*|$)"
            AS ?agePattern
        )
        BIND(
            "(^|.*,)\\s*Residenza\\s*:\\s*([^,]+)(,.*|$)"
            AS ?residencePattern
        )

        BIND(
            REPLACE(
                REPLACE(?demographics, ?sexPattern, "$2", "is"),
                "^\\s+|\\s+$", ""
            ) AS ?sex
        )
        BIND(
            xsd:integer(
                REPLACE(?demographics, ?agePattern, "$2", "is")
            ) AS ?age
        )
        BIND(
            REPLACE(
                REPLACE(?demographics, ?residencePattern, "$2", "is"),
                "^\\s+|\\s+$", ""
            ) AS ?residence
        )

        FILTER(
            LCASE(?sexFilter) = "tutti" ||
            (
                REGEX(?demographics, ?sexPattern, "is") &&
                LCASE(?sex) = LCASE(?sexFilter)
            )
        )

        FILTER(
            ?ageMode = "qualunque" ||
            (
                REGEX(?demographics, ?agePattern, "is") &&
                (
                    (?ageMode = "maggiore di" && ?age > ?age1) ||
                    (?ageMode = "minore di" && ?age < ?age1) ||
                    (?ageMode = "compreso tra" &&
                        ?age >= ?age1 && ?age <= ?age2) ||
                    (?ageMode = "età esatta" && ?age = ?age1)
                )
            )
        )

        FILTER(
            ?residenceFilter = "" ||
            (
                REGEX(?demographics, ?residencePattern, "is") &&
                LCASE(?residence) = LCASE(?residenceFilter)
            )
        )
    }
}
GROUP BY ?polarity ?polarityOrder ?concept
ORDER BY ?polarityOrder ?label ?concept`;

const paradigmaticConcepts = String.raw`# Parametri:
#   ?term              Termine da cercare, con tag linguistico (es. "femmina"@it)
#   ?sexFilter         "Maschio", "Femmina", "Tutti"
#   ?ageMode           "maggiore di", "minore di", "compreso tra", "età esatta", "qualunque"
#   ?age1              Soglia, età esatta o limite inferiore
#   ?age2              Limite superiore per "compreso tra"; altrimenti ignorato
#   ?residenceFilter   Residenza esatta; "" per tutte
#
# Per disattivare tutti i filtri demografici:
#   ("Tutti" "qualunque" 0 0 "")

PREFIX lexo:    <https://lexo.ilc.cnr.it#>
PREFIX ontolex: <http://www.w3.org/ns/lemon/ontolex#>
PREFIX skos:    <http://www.w3.org/2004/02/skos/core#>
PREFIX frac:    <http://www.w3.org/ns/lemon/frac#>
PREFIX dct:     <http://purl.org/dc/terms/>
PREFIX xsd:     <http://www.w3.org/2001/XMLSchema#>

SELECT
    ?concept
    (MIN(STR(?conceptLabel)) AS ?label)
    (COUNT(DISTINCT ?attestation) AS ?numberOfAttestations)
    (COUNT(DISTINCT ?interview) AS ?numberOfTexts)
WHERE {
    # Lista completa dei lexical concept
    GRAPH <https://lexo.ilc.cnr.it/graphs/lexical/lexicalConcept> {
        ?concept a ontolex:LexicalConcept .
        OPTIONAL { ?concept skos:prefLabel ?conceptLabel }
    }

    VALUES ?term { {{TERM}} }

    # Parametri demografici
    VALUES (?sexFilter ?ageMode ?age1 ?age2 ?residenceFilter) {
        ({{SEX_FILTER}} {{AGE_MODE}} {{AGE1}} {{AGE2}} {{RESIDENCE_FILTER}})
    }

    OPTIONAL {
        # Sensi appartenenti all'entry del termine richiesto
        GRAPH <https://lexo.ilc.cnr.it/graphs/lexical/lexica/it> {
            ?entry
                ontolex:canonicalForm/ontolex:writtenRep ?term ;
                ontolex:sense ?sense .

            ?sense a ontolex:LexicalSense .
        }

        GRAPH ?attGraph {
            # L'observable dell'attestazione è il senso
            ?sense frac:attestation ?attestation .

            # Il concept è indicato sulla singola attestazione
            ?attestation
                lexo:referringConcept ?concept ;
                frac:observedIn ?interview .
        }

        FILTER(STRSTARTS(
            STR(?attGraph),
            "https://lexo.ilc.cnr.it/graphs/lexical/attestations/documents/"
        ))

        SERVICE <repository:LexOTexts> {
            GRAPH ?textGraph {
                ?interview dct:description ?description .
            }

            FILTER(STRSTARTS(
                STR(?textGraph),
                "https://lexo.ilc.cnr.it/graphs/nif/documents/"
            ))
        }

        BIND(STR(?description) AS ?demographics)

        BIND(
            "(^|.*,)\\s*Sesso\\s*:\\s*([^,]+)(,.*|$)"
            AS ?sexPattern
        )
        BIND(
            "(^|.*,)\\s*Et[àa]\\s*:\\s*([0-9]+)\\s*(,.*|$)"
            AS ?agePattern
        )
        BIND(
            "(^|.*,)\\s*Residenza\\s*:\\s*([^,]+)(,.*|$)"
            AS ?residencePattern
        )

        BIND(
            REPLACE(
                REPLACE(?demographics, ?sexPattern, "$2", "is"),
                "^\\s+|\\s+$", ""
            ) AS ?sex
        )
        BIND(
            xsd:integer(
                REPLACE(?demographics, ?agePattern, "$2", "is")
            ) AS ?age
        )
        BIND(
            REPLACE(
                REPLACE(?demographics, ?residencePattern, "$2", "is"),
                "^\\s+|\\s+$", ""
            ) AS ?residence
        )

        FILTER(
            LCASE(?sexFilter) = "tutti" ||
            (
                REGEX(?demographics, ?sexPattern, "is") &&
                LCASE(?sex) = LCASE(?sexFilter)
            )
        )

        FILTER(
            ?ageMode = "qualunque" ||
            (
                REGEX(?demographics, ?agePattern, "is") &&
                (
                    (?ageMode = "maggiore di" && ?age > ?age1) ||
                    (?ageMode = "minore di" && ?age < ?age1) ||
                    (?ageMode = "compreso tra" &&
                        ?age >= ?age1 && ?age <= ?age2) ||
                    (?ageMode = "età esatta" && ?age = ?age1)
                )
            )
        )

        FILTER(
            ?residenceFilter = "" ||
            (
                REGEX(?demographics, ?residencePattern, "is") &&
                LCASE(?residence) = LCASE(?residenceFilter)
            )
        )
    }
}
GROUP BY ?concept
ORDER BY DESC(?numberOfAttestations) ?label ?concept`;

const conceptDetail = String.raw`PREFIX frac: <http://www.w3.org/ns/lemon/frac#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX marl: <http://purl.org/marl/ns#>
PREFIX dct:  <http://purl.org/dc/terms/>
PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>

SELECT DISTINCT ?id ?attestation ?age ?sex ?residence
WHERE {
    # Parametri di input
    VALUES (?term ?concept ?polarity) {
        ({{TERM}} {{CONCEPT}} {{POLARITY}})
    }

    GRAPH ?attGraph {
        ?concept frac:attestation ?attestation .

        ?attestation
            rdfs:comment ?term ;
            marl:hasPolarity ?polarity .
    }

    FILTER(STRSTARTS(
        STR(?attGraph),
        "https://lexo.ilc.cnr.it/graphs/lexical/attestations/documents/"
    ))

    OPTIONAL {
        GRAPH ?attGraph {
            ?attestation frac:observedIn ?interview .
        }

        SERVICE <repository:LexOTexts> {
            GRAPH ?textGraph {
                ?interview dct:description ?description ;
                           dct:identifier ?id .
            }

            FILTER(STRSTARTS(
                STR(?textGraph),
                "https://lexo.ilc.cnr.it/graphs/nif/documents/"
            ))
        }

        BIND(STR(?description) AS ?demographics)

        BIND(
            "(^|.*,)\\s*Et[àa]\\s*:\\s*([0-9]+)\\s*(,.*|$)"
            AS ?agePattern
        )
        BIND(
            "(^|.*,)\\s*Sesso\\s*:\\s*([^,]+)(,.*|$)"
            AS ?sexPattern
        )
        BIND(
            "(^|.*,)\\s*Residenza\\s*:\\s*([^,]+)(,.*|$)"
            AS ?residencePattern
        )

        OPTIONAL {
            FILTER(REGEX(?demographics, ?agePattern, "is"))
            BIND(
                xsd:integer(
                    REPLACE(?demographics, ?agePattern, "$2", "is")
                ) AS ?age
            )
        }

        OPTIONAL {
            FILTER(REGEX(?demographics, ?sexPattern, "is"))
            BIND(
                REPLACE(
                    REPLACE(?demographics, ?sexPattern, "$2", "is"),
                    "^\\s+|\\s+$", ""
                ) AS ?sex
            )
        }

        OPTIONAL {
            FILTER(REGEX(?demographics, ?residencePattern, "is"))
            BIND(
                REPLACE(
                    REPLACE(?demographics, ?residencePattern, "$2", "is"),
                    "^\\s+|\\s+$", ""
                ) AS ?residence
            )
        }
    }
}
ORDER BY ?attestation`;

export const cqSparqlTemplates: Record<CqQueryId, CqSparqlTemplate> = {
  "cq1-narrative-concepts-by-polarity": {
    id: "cq1-narrative-concepts-by-polarity",
    naturalLanguage:
      "Which concepts are associated with the narrative senses of a given lexical entry, by polarity?",
    requiredTokens: ["TERM", "SEX_FILTER", "AGE_MODE", "AGE1", "AGE2", "RESIDENCE_FILTER"],
    template: narrativeConceptsByPolarity,
  },
  "cq1-paradigmatic-concepts": {
    id: "cq1-paradigmatic-concepts",
    naturalLanguage:
      "Which concepts are associated with the narrative senses of a given lexical entry, by polarity?",
    requiredTokens: ["TERM", "SEX_FILTER", "AGE_MODE", "AGE1", "AGE2", "RESIDENCE_FILTER"],
    template: paradigmaticConcepts,
  },
  "cq1-concept-detail": {
    id: "cq1-concept-detail",
    naturalLanguage:
      "Support query: all passages of a given concept, term and polarity, with speaker id, age, sex and residence.",
    requiredTokens: ["TERM", "CONCEPT", "POLARITY"],
    template: conceptDetail,
  },
};

export const cqExampleParams: Record<CqQueryId, Record<CqToken, string>> = {
  "cq1-narrative-concepts-by-polarity": {
    TERM: '"criminale"@it',
    POLARITY: "",
    CONCEPT: "",
    SEX_FILTER: '"Tutti"',
    AGE_MODE: '"qualunque"',
    AGE1: "0",
    AGE2: "0",
    RESIDENCE_FILTER: '""',
  },
  "cq1-paradigmatic-concepts": {
    TERM: '"femmina"@it',
    POLARITY: "",
    CONCEPT: "",
    SEX_FILTER: '"Tutti"',
    AGE_MODE: '"qualunque"',
    AGE1: "0",
    AGE2: "0",
    RESIDENCE_FILTER: '""',
  },
  "cq1-concept-detail": {
    TERM: '"criminale"@it',
    POLARITY: "marl:Negative",
    CONCEPT: "<https://lexo.ilc.cnr.it#LexO_2026-08-21T13_00_00_099+02_00>",
    SEX_FILTER: '"Tutti"',
    AGE_MODE: '"qualunque"',
    AGE1: "0",
    AGE2: "0",
    RESIDENCE_FILTER: '""',
  },
};

export function renderCqSparql(
  queryId: CqQueryId,
  tokens: Partial<Record<CqToken, string>>,
): string {
  const entry = cqSparqlTemplates[queryId];
  if (!entry) throw new Error(`Query CQ sconosciuta: ${queryId}`);
  const rendered = entry.template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, name: string) => {
    const value = tokens[name as CqToken];
    return value === undefined || value === "" ? match : value;
  });
  return rendered;
}

export const cqSparqlQueryIds = Object.keys(cqSparqlTemplates) as CqQueryId[];
