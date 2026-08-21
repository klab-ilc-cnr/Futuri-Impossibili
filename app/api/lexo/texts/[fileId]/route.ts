const lexoServerUrl = (process.env.LEXO_SERVER_URL ?? "http://localhost:8080/LexO-server").replace(/\/$/, "");

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const { fileId } = await params;
    const authorization = request.headers.get("Authorization")
      ?? process.env.LEXO_SERVER_AUTHORIZATION;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (authorization) headers.Authorization = authorization;

    const response = await fetch(
      `${lexoServerUrl}/service/texts/${encodeURIComponent(fileId)}`,
      { method: "DELETE", headers, cache: "no-store" },
    );
    const hasResponseBody = ![204, 205, 304].includes(response.status);
    const body = await response.text();

    return new Response(hasResponseBody ? body : null, {
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
