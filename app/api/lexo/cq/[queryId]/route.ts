import {
  cqSparqlTemplates,
  renderCqSparql,
  type CqQueryId,
  type CqToken,
} from "../../../../cq/sparql";

const graphDbSparqlUrl = (process.env.GRAPHDB_SPARQL_URL ?? "http://localhost:7200/repositories/LexOLexica").replace(/\/$/, "");

const polarityValues: Record<string, string> = {
  positive: "marl:Positive",
  neutral: "marl:Neutral",
  negative: "marl:Negative",
  "marl:Positive": "marl:Positive",
  "marl:Neutral": "marl:Neutral",
  "marl:Negative": "marl:Negative",
};

const sexFilterValues = new Set(["Maschio", "Femmina", "Tutti"]);

const ageModeValues = new Set([
  "maggiore di",
  "minore di",
  "compreso tra",
  "età esatta",
  "qualunque",
]);

const requiredTokensByQuery: Record<CqQueryId, CqToken[]> = Object.fromEntries(
  Object.values(cqSparqlTemplates).map((template) => [template.id, template.requiredTokens]),
) as Record<CqQueryId, CqToken[]>;

function sanitizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\\"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function buildTokens(
  queryId: CqQueryId,
  body: Record<string, unknown>,
): { tokens: Record<CqToken, string> } | { error: string } {
  const tokens: Record<CqToken, string> = {
    TERM: "",
    POLARITY: "",
    CONCEPT: "",
    SEX_FILTER: "",
    AGE_MODE: "",
    AGE1: "",
    AGE2: "",
    RESIDENCE_FILTER: "",
  };

  if (typeof body.term === "string") {
    const term = sanitizeText(body.term);
    if (!term) return { error: "Il parametro term è vuoto o non valido" };
    tokens.TERM = `"${term}"@it`;
  }

  if (typeof body.polarity === "string") {
    const polarity = polarityValues[body.polarity.trim().toLowerCase()]
      ?? polarityValues[body.polarity.trim()];
    if (!polarity) return { error: "Il parametro polarity ammette: positive, neutral, negative" };
    tokens.POLARITY = polarity;
  }

  if (typeof body.concept === "string") {
    const concept = body.concept.trim().replace(/^[<\s]+|[>\s]+$/g, "");
    if (!concept || /[\s"'<>]/.test(concept) || !/^https?:\/\//i.test(concept)) {
      return { error: "Il parametro concept deve essere un IRI valido" };
    }
    tokens.CONCEPT = `<${concept}>`;
  }

  if (typeof body.sex === "string") {
    const sex = body.sex.trim();
    if (!sexFilterValues.has(sex)) {
      return { error: "Il parametro sex ammette: Maschio, Femmina, Tutti" };
    }
    tokens.SEX_FILTER = `"${sex}"`;
  }

  if (typeof body.ageMode === "string") {
    const ageMode = body.ageMode.trim();
    if (!ageModeValues.has(ageMode)) {
      return { error: "Il parametro ageMode non valido" };
    }
    tokens.AGE_MODE = `"${ageMode}"`;
  }

  for (const [key, token] of [["age1", "AGE1"], ["age2", "AGE2"]] as const) {
    const raw = body[key];
    if (raw === undefined || raw === "") {
      tokens[token] = "0";
      continue;
    }
    const age = Math.trunc(Number(raw));
    if (!Number.isFinite(age) || age < 0 || age > 120) {
      return { error: `Il parametro ${key} deve essere un intero tra 0 e 120` };
    }
    tokens[token] = String(age);
  }

  if (body.residence !== undefined) {
    const residence = sanitizeText(body.residence);
    tokens.RESIDENCE_FILTER = residence ? `"${residence}"` : `""`;
  } else {
    tokens.RESIDENCE_FILTER = `""`;
  }

  const missing = requiredTokensByQuery[queryId].filter((token) => !tokens[token]);
  if (missing.length) {
    return { error: `Parametri mancanti per la query ${queryId}: ${missing.join(", ")}` };
  }

  return { tokens };
}

interface SparqlBindingValue {
  value?: unknown;
}

interface SparqlResultsPayload {
  head?: { vars?: unknown };
  results?: { bindings?: unknown };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ queryId: string }> },
) {
  try {
    const { queryId } = await params;
    const template = cqSparqlTemplates[queryId as CqQueryId];
    if (!template) {
      return errorResponse("Query CQ sconosciuta", 404);
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return errorResponse("Corpo della richiesta non valido: atteso JSON");
    }

    const built = buildTokens(queryId as CqQueryId, body);
    if ("error" in built) {
      return errorResponse(built.error);
    }

    const sparql = renderCqSparql(template.id, built.tokens);

    const stripped = sparql
      .replace(/#[^\n]*/g, " ")
      .replace(/^\s*prefix\s+[^\n]*$/gim, "")
      .trim();
    if (!/^select\b/i.test(stripped)) {
      return errorResponse("Query rifiutata: sono ammesse solo query SELECT", 500);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/sparql-results+json",
    };
    const graphDbAuthorization = process.env.GRAPHDB_AUTHORIZATION;
    if (graphDbAuthorization) headers.Authorization = graphDbAuthorization;

    const response = await fetch(`${graphDbSparqlUrl}`, {
      method: "POST",
      headers,
      body: new URLSearchParams({ query: sparql }).toString(),
      cache: "no-store",
    });

    const responseText = await response.text();
    if (!response.ok) {
      return Response.json(
        {
          error: "GraphDB non raggiungibile",
          detail: responseText.slice(0, 500),
        },
        { status: 502 },
      );
    }

    let payload: SparqlResultsPayload;
    try {
      payload = JSON.parse(responseText) as SparqlResultsPayload;
    } catch {
      return Response.json(
        { error: "Risposta GraphDB non valida", detail: responseText.slice(0, 500) },
        { status: 502 },
      );
    }

    const variables = Array.isArray(payload.head?.vars)
      ? payload.head!.vars.map(String)
      : [];
    const bindings = Array.isArray(payload.results?.bindings)
      ? payload.results!.bindings
      : [];
    const rows = bindings.map((binding) => {
      const row: Record<string, string> = {};
      if (binding && typeof binding === "object") {
        for (const [key, raw] of Object.entries(binding as Record<string, SparqlBindingValue>)) {
          row[key] = String((raw as SparqlBindingValue)?.value ?? "");
        }
      }
      return row;
    });

    return Response.json({ queryId, variables, rows });
  } catch (error) {
    return Response.json(
      {
        error: "GraphDB non raggiungibile",
        detail: error instanceof Error ? error.message : "Errore sconosciuto",
      },
      { status: 502 },
    );
  }
}
