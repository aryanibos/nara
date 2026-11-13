export const REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export type RatingValue = "up" | "down";

export interface ModelCapabilities {
  vision: boolean;
  tools: boolean;
  jsonSchema: boolean;
  reasoningText: boolean;
  efforts: string[];
}

export interface CoarenaModel {
  id: string;
  displayName: string;
  ownedBy: string;
  description: string;
  maxCompletionTokens: number;
  contextLength: number;
  capabilities: ModelCapabilities;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning: string;
  createdAt: string;
  status: "complete" | "streaming" | "error";
  modelId?: string;
  modelName?: string;
  requestedModelId?: string;
  substituted?: boolean;
  substitutionReason?: string | null;
  requestId?: string;
  rating?: RatingValue | null;
  ratingNote?: string;
  ratingTags?: string[];
  usage?: TokenUsage;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  modelId: string;
  systemPrompt: string;
  reasoningEffort: ReasoningEffort;
  messages: ChatMessage[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  modelId: string;
  messageCount: number;
  preview: string;
}

export interface ConversationSettings {
  modelId: string;
  systemPrompt: string;
  reasoningEffort: ReasoningEffort;
}

export function toSummary(conversation: Conversation): ConversationSummary {
  const last = [...conversation.messages]
    .reverse()
    .find((message) => message.content.trim().length > 0);
  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    modelId: conversation.modelId,
    messageCount: conversation.messages.length,
    preview: (last?.content ?? "").replace(/\s+/g, " ").slice(0, 90),
  };
}

export function upsertSummary(
  summaries: ConversationSummary[],
  summary: ConversationSummary,
): ConversationSummary[] {
  return [summary, ...summaries.filter((item) => item.id !== summary.id)].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function createId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  const random =
    cryptoApi?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

export function titleFromMessage(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  if (!flat) return "Percakapan baru";
  if (flat.length <= 52) return flat;
  return `${flat.slice(0, 52).trimEnd()}…`;
}

export function patchMessage(
  conversation: Conversation,
  messageId: string,
  patch: Partial<ChatMessage>,
): Conversation {
  return {
    ...conversation,
    updatedAt: new Date().toISOString(),
    messages: conversation.messages.map((message) =>
      message.id === messageId ? { ...message, ...patch } : message,
    ),
  };
}
