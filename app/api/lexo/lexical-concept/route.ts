const lexoServerUrl = (process.env.LEXO_SERVER_URL ?? "http://localhost:8080/LexO-server").replace(/\/$/, "");

type AddSensePayload = {
  senseId?: unknown;
  language?: unknown;
};

type LexicalConceptPayload = {
  lexicalConcept?: unknown;
  addSenses?: unknown;
};

function requestHeaders(request: Request) {
  const authorization = request.headers.get("Authorization")
    ?? process.env.LEXO_SERVER_AUTHORIZATION;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (authorization) headers.Authorization = authorization;
  return headers;
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const lexicalConcept = requestUrl.searchParams.get("lexicalConcept")?.trim();
    if (!lexicalConcept) {
      return Response.json({ error: "Il parametro lexicalConcept è obbligatorio" }, { status: 400 });
    }

    const parameters = new URLSearchParams({ lexicalConcept });
    const response = await fetch(
      `${lexoServerUrl}/service/lexica/lexicalConcept?${parameters.toString()}`,
      { headers: requestHeaders(request), cache: "no-store" },
    );
    const responseBody = await response.text();

    return new Response(responseBody, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (error) {
    return Response.json(
      {
        error: "LexO-server non raggiungibile",
        detail: error instanceof Error ? error.message : "Errore sconosciuto",
      },
      { status: 502 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as LexicalConceptPayload;
    const lexicalConcept = typeof payload.lexicalConcept === "string"
      ? payload.lexicalConcept.trim()
      : "";
    const addSenses = Array.isArray(payload.addSenses)
      ? payload.addSenses.flatMap((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return [];
          const sense = item as AddSensePayload;
          const senseId = typeof sense.senseId === "string" ? sense.senseId.trim() : "";
          const language = typeof sense.language === "string" ? sense.language.trim() : "";
          return senseId && language ? [{ senseId, language }] : [];
        })
      : [];

    if (!lexicalConcept || addSenses.length === 0) {
      return Response.json(
        { error: "Il body deve contenere lexicalConcept e almeno un senso valido in addSenses" },
        { status: 400 },
      );
    }

    const headers = {
      ...requestHeaders(request),
      "Content-Type": "application/json",
    };

    const response = await fetch(`${lexoServerUrl}/service/lexica/lexicalConcept`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ lexicalConcept, addSenses }),
      cache: "no-store",
    });
    const responseBody = await response.text();

    return new Response(responseBody, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (error) {
    return Response.json(
      {
        error: "LexO-server non raggiungibile",
        detail: error instanceof Error ? error.message : "Errore sconosciuto",
      },
      { status: 502 },
    );
  }
}
