const lexoServerUrl = (process.env.LEXO_SERVER_URL ?? "http://localhost:8080/LexO-server").replace(/\/$/, "");

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("Authorization")
      ?? process.env.LEXO_SERVER_AUTHORIZATION;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (authorization) headers.Authorization = authorization;

    const listResponse = await fetch(`${lexoServerUrl}/service/texts`, {
      headers,
      cache: "no-store",
    });
    if (!listResponse.ok) {
      const body = await listResponse.text();
      return new Response(body, {
        status: listResponse.status,
        headers: { "Content-Type": listResponse.headers.get("Content-Type") ?? "application/json" },
      });
    }
    const listPayload = await listResponse.json() as { texts?: Array<{ fileId?: unknown }> };
    const fileIds = (listPayload.texts ?? [])
      .map((item) => typeof item.fileId === "string" ? item.fileId : "")
      .filter(Boolean);

    const readHeaders: Record<string, string> = { Accept: "application/json" };
    if (authorization) readHeaders.Authorization = authorization;
    const entries = await Promise.all(fileIds.map(async (fileId) => {
      const response = await fetch(
        `${lexoServerUrl}/service/attestations/${encodeURIComponent(fileId)}?limit=200`,
        { method: "POST", headers: readHeaders, cache: "no-store" },
      );
      if (!response.ok) return [fileId, []] as const;
      const payload = await response.json() as { list?: unknown };
      return [fileId, Array.isArray(payload.list) ? payload.list : []] as const;
    }));

    return Response.json(
      { attestations: Object.fromEntries(entries) },
      { headers: { "Content-Type": "application/json; charset=UTF-8" } },
    );
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
