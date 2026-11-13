import { toSummary, type Conversation, type ReasoningEffort } from "@/lib/chat/types";
import type { ConversationRepository } from "@/lib/persistence/repository";

const INDEX_KEY = "nara.v1.index";
const ACTIVE_KEY = "nara.v1.active";

function conversationKey(id: string): string {
  return `nara.v1.conv.${id}`;
}

function storage(): Storage {
  if (typeof window === "undefined") {
    throw new Error("Penyimpanan percakapan hanya tersedia di peramban.");
  }
  return window.localStorage;
}

function readIndex(): string[] {
  try {
    const raw = storage().getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function writeIndex(ids: string[]): void {
  storage().setItem(INDEX_KEY, JSON.stringify(ids));
}

function isEffort(value: unknown): value is ReasoningEffort {
  return (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh" ||
    value === "max"
  );
}

function hydrate(value: unknown): Conversation | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<Conversation>;
  if (typeof record.id !== "string" || !Array.isArray(record.messages)) return null;
  return {
    id: record.id,
    title:
      typeof record.title === "string" && record.title.trim()
        ? record.title
        : "Percakapan baru",
    createdAt:
      typeof record.createdAt === "string"
        ? record.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof record.updatedAt === "string"
        ? record.updatedAt
        : new Date().toISOString(),
    modelId: typeof record.modelId === "string" ? record.modelId : "",
    systemPrompt: typeof record.systemPrompt === "string" ? record.systemPrompt : "",
    reasoningEffort: isEffort(record.reasoningEffort)
      ? record.reasoningEffort
      : "medium",
    messages: record.messages
      .filter((message) => message && typeof message === "object")
      .map((message) => {
        const item = message as Conversation["messages"][number];
        const interrupted = item.status === "streaming";
        return {
          ...item,
          reasoning: typeof item.reasoning === "string" ? item.reasoning : "",
          content: typeof item.content === "string" ? item.content : "",
          status: interrupted ? "error" : item.status === "error" ? "error" : "complete",
          error: interrupted
            ? item.error || "Balasan terputus sebelum selesai."
            : item.error,
        };
      }),
  };
}

export class BrowserConversationRepository implements ConversationRepository {
  async list() {
    const conversations = readIndex()
      .map((id) => this.read(id))
      .filter((conversation): conversation is Conversation => conversation !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return conversations.map(toSummary);
  }

  async get(id: string) {
    return this.read(id);
  }

  async save(conversation: Conversation) {
    try {
      storage().setItem(conversationKey(conversation.id), JSON.stringify(conversation));
      const index = readIndex().filter((id) => id !== conversation.id);
      index.unshift(conversation.id);
      writeIndex(index);
    } catch {
      throw new Error("Penyimpanan peramban penuh. Hapus percakapan lama, lalu coba lagi.");
    }
  }

  async delete(id: string) {
    storage().removeItem(conversationKey(id));
    writeIndex(readIndex().filter((item) => item !== id));
    if (readActiveConversationId() === id) writeActiveConversationId(null);
  }

  private read(id: string): Conversation | null {
    try {
      const raw = storage().getItem(conversationKey(id));
      if (!raw) return null;
      return hydrate(JSON.parse(raw));
    } catch {
      return null;
    }
  }
}

export function createConversationRepository(): ConversationRepository {
  return new BrowserConversationRepository();
}

export function readActiveConversationId(): string | null {
  try {
    return storage().getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function writeActiveConversationId(id: string | null): void {
  try {
    if (id) storage().setItem(ACTIVE_KEY, id);
    else storage().removeItem(ACTIVE_KEY);
  } catch {
    // The conversation itself is the source of truth; the pointer can fail quietly.
  }
}
