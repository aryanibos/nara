import type { Conversation, ConversationSummary } from "@/lib/chat/types";

/**
 * Persistence port for conversations.
 *
 * The UI talks only to this interface. `BrowserConversationRepository`
 * implements it with localStorage. A Neon/Postgres store can implement the
 * same methods behind route handlers later, without changing the chat screen.
 *
 * Suggested tables when that store is added:
 *
 *   conversations (
 *     id text primary key,
 *     title text not null,
 *     model_id text not null,
 *     system_prompt text not null default '',
 *     reasoning_effort text not null,
 *     created_at timestamptz not null,
 *     updated_at timestamptz not null
 *   )
 *
 *   messages (
 *     id text primary key,
 *     conversation_id text not null references conversations(id) on delete cascade,
 *     role text not null,
 *     content text not null,
 *     reasoning text not null default '',
 *     model_id text,
 *     model_name text,
 *     requested_model_id text,
 *     substituted boolean,
 *     request_id text,
 *     rating text,
 *     rating_note text,
 *     rating_tags jsonb,
 *     usage jsonb,
 *     status text not null,
 *     error text,
 *     created_at timestamptz not null
 *   )
 */
export interface ConversationRepository {
  list(): Promise<ConversationSummary[]>;
  get(id: string): Promise<Conversation | null>;
  save(conversation: Conversation): Promise<void>;
  delete(id: string): Promise<void>;
}
