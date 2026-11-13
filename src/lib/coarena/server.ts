import "server-only";

import { FEEDBACK_TAG_IDS, NOTE_LIMIT } from "@/lib/chat/feedback";
import {
  REASONING_EFFORTS,
  type CoarenaModel,
  type ReasoningEffort,
} from "@/lib/chat/types";

export const COARENA_BASE_URL = "https://coarena.ai/api/v1";

/**
 * Reasoning tokens count against max_tokens. 8192 is the API default when
 * the field is omitted, and well above a short answer plus a reasoning trace.
 * The hard cap on this API is 16384.
 */
export const MAX_COMPLETION_TOKENS = 8192;

const MAX_MESSAGES = 80;
const MAX_MESSAGE_CHARS = 32_000;
const MAX_SYSTEM_CHARS = 8_000;

export function apiKey(): string | null {
  const key = process.env.COARENA_API_KEY?.trim();
  return key ? key : null;
}

export function readUpstreamError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    const code = (error as Record<string, unknown>).code;
    if (typeof message === "string" && message.trim()) return message;
    if (typeof code === "string" && code.trim()) return code;
  }
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message;
  }
  return fallback;
}

export function publicError(status: number, payload: unknown): string {
  const message = readUpstreamError(payload, "");
  if (message) return message;
  if (status === 401) return "Kunci API ditolak. Periksa COARENA_API_KEY di server.";
  if (status === 403) return "Kunci ini tidak boleh memanggil model.";
  if (status === 404) return "Model atau permintaan tidak ditemukan.";
  if (status === 429) return "Batas pemakaian tercapai. Coba lagi sebentar.";
  return "Permintaan ke Coarena gagal.";
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeModels(payload: unknown): CoarenaModel[] {
  const data =
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : [];

  const models: CoarenaModel[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || !record.id) continue;
    const capabilities =
      record.capabilities && typeof record.capabilities === "object"
        ? (record.capabilities as Record<string, unknown>)
        : {};
    models.push({
      id: record.id,
      displayName:
        typeof record.display_name === "string" && record.display_name
          ? record.display_name
          : record.id,
      ownedBy: typeof record.owned_by === "string" ? record.owned_by : "lainnya",
      description: typeof record.description === "string" ? record.description : "",
      maxCompletionTokens: numberOr(record.max_completion_tokens, 16384),
      contextLength: numberOr(record.context_length, 128000),
      capabilities: {
        vision: capabilities.vision === true,
        tools: capabilities.tools === true,
        jsonSchema: capabilities.json_schema === true,
        reasoningText: capabilities.reasoning_text === true,
        efforts: Array.isArray(capabilities.efforts)
          ? capabilities.efforts.filter((effort): effort is string => typeof effort === "string")
          : [],
      },
    });
  }
  return models;
}

export interface UpstreamMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  reasoningEffort: ReasoningEffort | null;
  messages: UpstreamMessage[];
}

export function parseChatRequest(
  body: unknown,
): { ok: true; value: ChatRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body permintaan tidak valid." };
  }
  const record = body as Record<string, unknown>;
  if (typeof record.model !== "string" || !record.model.trim()) {
    return { ok: false, error: "Pilih model terlebih dahulu." };
  }
  if (!Array.isArray(record.messages) || record.messages.length === 0) {
    return { ok: false, error: "Pesan kosong." };
  }
  if (record.messages.length > MAX_MESSAGES) {
    return { ok: false, error: "Percakapan terlalu panjang untuk dikirim." };
  }

  const messages: UpstreamMessage[] = [];
  const systemPrompt =
    typeof record.systemPrompt === "string" ? record.systemPrompt.trim() : "";
  if (systemPrompt.length > MAX_SYSTEM_CHARS) {
    return { ok: false, error: "Instruksi sistem terlalu panjang." };
  }
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });

  for (const item of record.messages) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Ada pesan yang tidak valid." };
    }
    const message = item as Record<string, unknown>;
    if (message.role !== "user" && message.role !== "assistant") {
      return { ok: false, error: "Peran pesan tidak didukung." };
    }
    if (typeof message.content !== "string" || !message.content.trim()) {
      return { ok: false, error: "Ada pesan kosong." };
    }
    if (message.content.length > MAX_MESSAGE_CHARS) {
      return { ok: false, error: "Salah satu pesan terlalu panjang." };
    }
    messages.push({ role: message.role, content: message.content });
  }

  let reasoningEffort: ReasoningEffort | null = null;
  if (record.reasoningEffort != null && record.reasoningEffort !== "") {
    if (
      typeof record.reasoningEffort !== "string" ||
      !REASONING_EFFORTS.includes(record.reasoningEffort as ReasoningEffort)
    ) {
      return { ok: false, error: "Upaya penalaran tidak dikenal." };
    }
    reasoningEffort = record.reasoningEffort as ReasoningEffort;
  }

  return {
    ok: true,
    value: { model: record.model.trim(), reasoningEffort, messages },
  };
}

export interface FeedbackRequest {
  requestId: string;
  rating: "up" | "down" | null;
  note?: string | null;
  tags?: string[] | null;
}

export function parseFeedbackRequest(
  body: unknown,
): { ok: true; value: FeedbackRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body penilaian tidak valid." };
  }
  const record = body as Record<string, unknown>;
  if (typeof record.requestId !== "string" || !record.requestId.trim()) {
    return { ok: false, error: "Id permintaan tidak ada." };
  }
  if (record.rating !== "up" && record.rating !== "down" && record.rating !== null) {
    return { ok: false, error: "Penilaian harus jempol naik, jempol turun, atau kosong." };
  }

  const value: FeedbackRequest = {
    requestId: record.requestId.trim(),
    rating: record.rating,
  };

  if ("note" in record) {
    if (record.note != null && typeof record.note !== "string") {
      return { ok: false, error: "Catatan harus berupa teks." };
    }
    const note = typeof record.note === "string" ? record.note.slice(0, NOTE_LIMIT) : null;
    value.note = note;
  }

  if ("tags" in record) {
    if (record.tags != null && !Array.isArray(record.tags)) {
      return { ok: false, error: "Tag penilaian tidak valid." };
    }
    const tags = Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === "string")
      : [];
    if (tags.some((tag) => !FEEDBACK_TAG_IDS.has(tag))) {
      return { ok: false, error: "Ada tag penilaian yang tidak dikenal." };
    }
    value.tags = tags;
  }

  return { ok: true, value };
}

/** Coarena duplicates the same trace on `reasoning` and `reasoning_content`. */
export function readDelta(delta: unknown): { content: string; reasoning: string } {
  if (!delta || typeof delta !== "object") return { content: "", reasoning: "" };
  const record = delta as Record<string, unknown>;
  const content = typeof record.content === "string" ? record.content : "";
  const primary = record.reasoning_content;
  const secondary = record.reasoning;
  const reasoning =
    typeof primary === "string" && primary.length > 0
      ? primary
      : typeof secondary === "string"
        ? secondary
        : "";
  return { content, reasoning };
}

export async function* iterateSseData(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) yield* emitDataLine(line);
      if (done) {
        if (buffer.trim()) yield* emitDataLine(buffer);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function* emitDataLine(line: string): Generator<unknown> {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return;
  try {
    yield JSON.parse(payload) as unknown;
  } catch {
    // Ignore a malformed keepalive chunk and keep the rest of the stream.
  }
}

const encoder = new TextEncoder();

export function encodeSse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
