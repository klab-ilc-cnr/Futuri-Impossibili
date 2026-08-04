const lexoServerUrl = (process.env.LEXO_SERVER_URL ?? "http://localhost:8080/LexO-server").replace(/\/$/, "");

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const resource = requestUrl.searchParams.get("resource")?.trim();
    if (!resource) {
      return Response.json({ error: "Il parametro resource è obbligatorio" }, { status: 400 });
    }

    const authorization = request.headers.get("Authorization")
      ?? process.env.LEXO_SERVER_AUTHORIZATION;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (authorization) headers.Authorization = authorization;

    const parameters = new URLSearchParams({
      entityType: "lexicalSense",
      resource,
      language: "it",
    });
    const response = await fetch(`${lexoServerUrl}/service/metadata?${parameters.toString()}`, {
      headers,
      cache: "no-store",
    });
    const body = await response.text();

    return new Response(body, {
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
