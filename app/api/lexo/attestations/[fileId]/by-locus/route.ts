const lexoServerUrl = (process.env.LEXO_SERVER_URL ?? "http://localhost:8080/LexO-server").replace(/\/$/, "");

type DeleteByLocusPayload = {
  locus?: unknown;
  all?: unknown;
};

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const requestUrl = new URL(request.url);
    const corpus = requestUrl.searchParams.get("corpus")?.trim();
    if (!corpus) {
      return Response.json({ error: "Il parametro corpus è obbligatorio" }, { status: 400 });
    }

    const payload = await request.json() as DeleteByLocusPayload;
    const locus = typeof payload.locus === "string" ? payload.locus.trim() : "";
    if (!locus || payload.all !== true) {
      return Response.json(
        { error: "Il body deve contenere l’IRI del locus e all=true" },
        { status: 400 },
      );
    }

    const { fileId } = await params;
    const authorization = request.headers.get("Authorization")
      ?? process.env.LEXO_SERVER_AUTHORIZATION;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (authorization) headers.Authorization = authorization;

    const serviceUrl = new URL(
      `${lexoServerUrl}/service/attestations/${encodeURIComponent(fileId)}/by-locus`,
    );
    serviceUrl.searchParams.set("corpus", corpus);
    const response = await fetch(serviceUrl, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ locus, all: true }),
      cache: "no-store",
    });
    const responseBody = await response.text();

    const hasResponseBody = ![204, 205, 304].includes(response.status);
    return new Response(hasResponseBody ? responseBody : null, {
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
