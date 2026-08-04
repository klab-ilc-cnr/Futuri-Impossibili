const lexoServerUrl = (process.env.LEXO_SERVER_URL ?? "http://localhost:8080/LexO-server").replace(/\/$/, "");

type ByLocusPayload = {
  value?: unknown;
  start?: unknown;
  end?: unknown;
  observables?: unknown;
};

type ObservablePayload = {
  observable: string;
  metadata?: unknown[];
};

export async function POST(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const corpus = requestUrl.searchParams.get("corpus")?.trim();
    if (!corpus) {
      return Response.json({ error: "Il parametro corpus è obbligatorio" }, { status: 400 });
    }

    const payload = await request.json() as ByLocusPayload;
    const value = typeof payload.value === "string" ? payload.value : "";
    const start = Number(payload.start);
    const end = Number(payload.end);
    const observables: ObservablePayload[] = Array.isArray(payload.observables)
      ? payload.observables.flatMap((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return [];
          const observableItem = item as Record<string, unknown>;
          const observable = typeof observableItem.observable === "string"
            ? observableItem.observable.trim()
            : "";
          if (!observable) return [];
          return [{
            observable,
            ...(Array.isArray(observableItem.metadata) ? { metadata: observableItem.metadata } : {}),
          }];
        })
      : [];
    if (!value || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || observables.length === 0) {
      return Response.json(
        { error: "Il body deve contenere value, start, end e almeno un observable" },
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

    const serviceUrl = new URL(`${lexoServerUrl}/service/attestations/by-locus`);
    serviceUrl.searchParams.set("corpus", corpus);
    serviceUrl.searchParams.set("author", requestUrl.searchParams.get("author") ?? "");
    serviceUrl.searchParams.set("external", requestUrl.searchParams.get("external") ?? "");
    const response = await fetch(serviceUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ value, start, end, observables }),
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
