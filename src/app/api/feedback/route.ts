import {
  apiKey,
  COARENA_BASE_URL,
  parseFeedbackRequest,
  publicError,
} from "@/lib/coarena/server";

export async function POST(request: Request) {
  const key = apiKey();
  if (!key) {
    return Response.json(
      { error: "COARENA_API_KEY belum diatur di server." },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body JSON tidak valid." }, { status: 400 });
  }

  const parsed = parseFeedbackRequest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const payload: Record<string, unknown> = {
    request_id: parsed.value.requestId,
    rating: parsed.value.rating,
  };
  if ("note" in parsed.value) payload.note = parsed.value.note;
  if ("tags" in parsed.value) payload.tags = parsed.value.tags;

  try {
    const response = await fetch(`${COARENA_BASE_URL}/feedback`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const text = await response.text();
    let parsedBody: unknown = null;
    if (text) {
      try {
        parsedBody = JSON.parse(text) as unknown;
      } catch {
        parsedBody = null;
      }
    }
    if (!response.ok) {
      return Response.json(
        { error: publicError(response.status, parsedBody) },
        { status: response.status },
      );
    }
    return Response.json(parsedBody ?? { ok: true });
  } catch {
    return Response.json(
      { error: "Penilaian tidak terkirim. Coba lagi." },
      { status: 502 },
    );
  }
}
