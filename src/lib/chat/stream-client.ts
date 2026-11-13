import type { ReasoningEffort, TokenUsage } from "@/lib/chat/types";

export type ClientStreamEvent =
  | {
      type: "meta";
      requestId: string;
      model: string;
      requestedModel: string;
      substituted: boolean;
      substitutionReason: string | null;
    }
  | { type: "reasoning"; text: string }
  | { type: "content"; text: string }
  | { type: "usage"; usage: TokenUsage }
  | { type: "done" }
  | { type: "error"; message: string };

export interface StreamChatInput {
  model: string;
  systemPrompt: string;
  reasoningEffort: ReasoningEffort;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  signal: AbortSignal;
  onEvent: (event: ClientStreamEvent) => void;
}

function messageFromPayload(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function streamChat(input: StreamChatInput): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: input.model,
      systemPrompt: input.systemPrompt,
      reasoningEffort: input.reasoningEffort,
      messages: input.messages,
    }),
    signal: input.signal,
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("text/event-stream") || !response.body) {
    const payload: unknown = await response.json().catch(() => null);
    throw new Error(messageFromPayload(payload, "Balasan gagal dikirim."));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleBlock = (block: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;
    const data = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
    if (event === "meta") {
      input.onEvent({
        type: "meta",
        requestId: typeof data.requestId === "string" ? data.requestId : "",
        model: typeof data.model === "string" ? data.model : input.model,
        requestedModel:
          typeof data.requestedModel === "string" ? data.requestedModel : input.model,
        substituted: data.substituted === true,
        substitutionReason:
          typeof data.substitutionReason === "string" ? data.substitutionReason : null,
      });
    } else if (event === "reasoning" && typeof data.text === "string") {
      input.onEvent({ type: "reasoning", text: data.text });
    } else if (event === "content" && typeof data.text === "string") {
      input.onEvent({ type: "content", text: data.text });
    } else if (event === "usage") {
      input.onEvent({
        type: "usage",
        usage: {
          promptTokens: Number(data.promptTokens ?? 0),
          completionTokens: Number(data.completionTokens ?? 0),
          reasoningTokens: Number(data.reasoningTokens ?? 0),
        },
      });
    } else if (event === "error") {
      input.onEvent({
        type: "error",
        message: typeof data.message === "string" ? data.message : "Aliran jawaban terputus.",
      });
    } else if (event === "done") {
      input.onEvent({ type: "done" });
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        if (block.trim()) handleBlock(block);
      }
    }
    if (buffer.trim()) handleBlock(buffer);
  } finally {
    reader.releaseLock();
  }
}
