const lexoServerUrl = (process.env.LEXO_SERVER_URL ?? "http://localhost:8080/LexO-server").replace(/\/$/, "");

export async function POST(request: Request) {
  try {
    const incoming = await request.formData();
    const files = incoming.getAll("file").filter((value): value is File => value instanceof File);
    if (files.length === 0) {
      return Response.json({ error: "È obbligatorio selezionare almeno un file" }, { status: 400 });
    }

    const formData = new FormData();
    files.forEach((file) => formData.append("file", file, file.name));
    formData.append("language", "it");

    const authorization = request.headers.get("Authorization")
      ?? process.env.LEXO_SERVER_AUTHORIZATION;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (authorization) headers.Authorization = authorization;

    const response = await fetch(`${lexoServerUrl}/service/texts/bulk`, {
      method: "POST",
      headers,
      body: formData,
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

export async function DELETE(request: Request) {
  try {
    const payload = await request.json() as { fileIds?: unknown };
    const fileIds = Array.isArray(payload.fileIds)
      ? payload.fileIds
          .map((item) => typeof item === "string" ? item.trim() : "")
          .filter(Boolean)
      : [];
    if (fileIds.length === 0) {
      return Response.json({ error: "Il body deve contenere una lista non vuota di fileIds" }, { status: 400 });
    }

    const authorization = request.headers.get("Authorization")
      ?? process.env.LEXO_SERVER_AUTHORIZATION;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (authorization) headers.Authorization = authorization;

    const response = await fetch(`${lexoServerUrl}/service/texts/bulk`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ fileIds }),
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
