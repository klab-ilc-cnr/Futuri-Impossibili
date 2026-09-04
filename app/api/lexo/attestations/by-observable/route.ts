const lexoServerUrl = (process.env.LEXO_SERVER_URL ?? "http://localhost:8080/LexO-server").replace(/\/$/, "");

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("Authorization")
      ?? process.env.LEXO_SERVER_AUTHORIZATION;
    const incoming = new URL(request.url);
    const observable = incoming.searchParams.get("observable") ?? "";
    const limit = incoming.searchParams.get("limit") ?? "";
    const offset = incoming.searchParams.get("offset") ?? "";
    if (!observable.trim()) {
      return Response.json({ error: "Il parametro observable è obbligatorio" }, { status: 400 });
    }

    const parameters = new URLSearchParams({ observable });
    if (limit) parameters.set("limit", limit);
    if (offset) parameters.set("offset", offset);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (authorization) headers.Authorization = authorization;

    const response = await fetch(
      `${lexoServerUrl}/service/attestations/by-observable?${parameters.toString()}`,
      { method: "POST", headers, cache: "no-store" },
    );
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
