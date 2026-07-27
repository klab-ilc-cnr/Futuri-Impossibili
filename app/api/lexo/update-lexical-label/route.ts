const lexoServerUrl = (process.env.LEXO_SERVER_URL ?? "http://localhost:8080/LexO-server").replace(/\/$/, "");

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const response = await fetch(`${lexoServerUrl}/service/skos/updateLexicalLabel`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
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
