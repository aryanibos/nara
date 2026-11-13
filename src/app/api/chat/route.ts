import {
  apiKey,
  COARENA_BASE_URL,
  encodeSse,
  iterateSseData,
  MAX_COMPLETION_TOKENS,
  parseChatRequest,
  publicError,
  readDelta,
} from "@/lib/coarena/server";

export const maxDuration = 120;

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

  const parsed = parseChatRequest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetch(`${COARENA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: parsed.value.model,
        messages: parsed.value.messages,
        stream: true,
        max_tokens: MAX_COMPLETION_TOKENS,
        stream_options: { include_usage: true },
        ...(parsed.value.reasoningEffort
          ? { reasoning_effort: parsed.value.reasoningEffort }
          : {}),
      }),
      signal: request.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("coarena chat request failed", error instanceof Error ? error.name : "error");
    return Response.json(
      { error: "Tidak tersambung ke Coarena." },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !upstream.body || !contentType.includes("text/event-stream")) {
    const payload: unknown = await upstream.json().catch(() => null);
    console.error("coarena chat rejected", upstream.status);
    return Response.json(
      { error: publicError(upstream.status, payload) },
      { status: upstream.status || 502 },
    );
  }

  const headerRequestId = upstream.headers.get("x-coarena-request-id") ?? "";
  const headerModel = upstream.headers.get("x-coarena-model") || parsed.value.model;
  const substitutedFrom = upstream.headers.get("x-coarena-substituted-from");
  const substitutedTo = upstream.headers.get("x-coarena-substituted-to");
  const substitutionReason = upstream.headers.get("x-coarena-substitution-reason");
  const substituted = Boolean(substitutedFrom && substitutedTo && substitutedFrom !== substitutedTo);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encodeSse(event, data));
      };

      let requestId = headerRequestId;
      let model = substitutedTo || headerModel;
      send("meta", {
        requestId,
        model,
        requestedModel: substitutedFrom || parsed.value.model,
        substituted,
        substitutionReason,
      });

      try {
        for await (const chunk of iterateSseData(upstream.body!)) {
          if (!chunk || typeof chunk !== "object") continue;
          const record = chunk as Record<string, unknown>;
          if (!requestId && typeof record.id === "string") {
            requestId = record.id;
            send("meta", {
              requestId,
              model,
              requestedModel: substitutedFrom || parsed.value.model,
              substituted,
              substitutionReason,
            });
          }
          if (typeof record.model === "string" && record.model && record.model !== model) {
            model = record.model;
            send("meta", {
              requestId,
              model,
              requestedModel: substitutedFrom || parsed.value.model,
              substituted: substituted || model !== parsed.value.model,
              substitutionReason,
            });
          }

          const usage = record.usage;
          if (usage && typeof usage === "object") {
            const usageRecord = usage as Record<string, unknown>;
            const details =
              usageRecord.completion_tokens_details &&
              typeof usageRecord.completion_tokens_details === "object"
                ? (usageRecord.completion_tokens_details as Record<string, unknown>)
                : {};
            send("usage", {
              promptTokens: Number(usageRecord.prompt_tokens ?? 0) || 0,
              completionTokens: Number(usageRecord.completion_tokens ?? 0) || 0,
              reasoningTokens: Number(details.reasoning_tokens ?? 0) || 0,
            });
          }

          const choices = Array.isArray(record.choices) ? record.choices : [];
          for (const choice of choices) {
            if (!choice || typeof choice !== "object") continue;
            const delta = (choice as { delta?: unknown }).delta;
            const { content, reasoning } = readDelta(delta);
            if (reasoning) send("reasoning", { text: reasoning });
            if (content) send("content", { text: content });
          }
        }
        send("done", {});
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("coarena stream interrupted", error instanceof Error ? error.name : "error");
          send("error", { message: "Aliran jawaban terputus." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
