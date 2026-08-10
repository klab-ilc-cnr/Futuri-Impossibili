const lexoServerUrl = (process.env.LEXO_SERVER_URL ?? "http://localhost:8080/LexO-server").replace(/\/$/, "");

function requestHeaders(request: Request, includeContentType = false) {
  const authorization = request.headers.get("Authorization")
    ?? process.env.LEXO_SERVER_AUTHORIZATION;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (includeContentType) headers["Content-Type"] = "application/json";
  if (authorization) headers.Authorization = authorization;
  return headers;
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const resource = requestUrl.searchParams.get("resource")?.trim();
    if (!resource) {
      return Response.json({ error: "Il parametro resource è obbligatorio" }, { status: 400 });
    }

    const parameters = new URLSearchParams({
      entityType: "lexicalSense",
      resource,
      language: "it",
    });
    const response = await fetch(`${lexoServerUrl}/service/metadata?${parameters.toString()}`, {
      headers: requestHeaders(request),
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

export async function PATCH(request: Request) {
  try {
    const body = await request.text();
    const response = await fetch(`${lexoServerUrl}/service/metadata`, {
      method: "PATCH",
      headers: requestHeaders(request, true),
      body,
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
