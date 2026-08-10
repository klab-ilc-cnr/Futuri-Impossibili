const lexoServerUrl = (process.env.LEXO_SERVER_URL ?? "http://localhost:8080/LexO-server").replace(/\/$/, "");

type LocusUpdatePayload = {
  attestation?: unknown;
  start?: unknown;
  end?: unknown;
  updateGloss?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const payload = await request.json() as LocusUpdatePayload;
    const attestation = typeof payload.attestation === "string" ? payload.attestation.trim() : "";
    const start = Number(payload.start);
    const end = Number(payload.end);
    if (
      !attestation
      || !Number.isInteger(start)
      || !Number.isInteger(end)
      || start < 0
      || end <= start
      || payload.updateGloss !== true
    ) {
      return Response.json(
        { error: "Il body deve contenere attestation, start, end e updateGloss=true" },
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

    const response = await fetch(
      `${lexoServerUrl}/service/attestations/${encodeURIComponent(fileId)}/locus`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ attestation, start, end, updateGloss: true }),
        cache: "no-store",
      },
    );
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
