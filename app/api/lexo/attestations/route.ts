const lexoServerUrl = (process.env.LEXO_SERVER_URL ?? "http://localhost:8080/LexO-server").replace(/\/$/, "");

export async function POST(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const observable = requestUrl.searchParams.get("observable")?.trim();
    const corpus = requestUrl.searchParams.get("corpus")?.trim();
    if (!observable || !corpus) {
      return Response.json(
        { error: "I parametri observable e corpus sono obbligatori" },
        { status: 400 },
      );
    }

    const occurrences = await request.json() as unknown;
    if (!Array.isArray(occurrences)) {
      return Response.json(
        { error: "Il body deve contenere direttamente un array di occorrenze" },
        { status: 400 },
      );
    }
    const authorization = request.headers.get("Authorization")
      ?? process.env.LEXO_SERVER_AUTHORIZATION;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (authorization) headers.Authorization = authorization;

    const serviceUrl = new URL(`${lexoServerUrl}/service/attestations`);
    serviceUrl.searchParams.set("observable", observable);
    serviceUrl.searchParams.set("corpus", corpus);
    const response = await fetch(serviceUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(occurrences),
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
