"use client";

import { memo, useState } from "react";
import { CheckIcon, CopyIcon, Loader2Icon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownView } from "@/components/chat/markdown-view";
import { DOWN_TAGS, NOTE_LIMIT, UP_TAGS } from "@/lib/chat/feedback";
import { modelDisplayName } from "@/lib/chat/models";
import type { ChatMessage, CoarenaModel, RatingValue } from "@/lib/chat/types";

function formatUsage(message: ChatMessage): string {
  if (!message.usage) return "";
  const parts: string[] = [];
  if (message.usage.completionTokens > 0) {
    parts.push(`${message.usage.completionTokens} token keluaran`);
  }
  if (message.usage.reasoningTokens > 0) {
    parts.push(`${message.usage.reasoningTokens} di antaranya penalaran`);
  }
  return parts.join(", ");
}

function ReasoningPanel({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(live);
  const [seenLive, setSeenLive] = useState(live);
  if (live !== seenLive) {
    setSeenLive(live);
    if (live) setOpen(true);
    if (!live) setOpen(false);
  }
  if (!text && !live) return null;

  return (
    <div className="mb-3 rounded-xl border bg-muted/50">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-medium text-muted-foreground"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{live ? "Sedang menalar…" : "Penalaran"}</span>
        <span>{open ? "Tutup" : "Lihat"}</span>
      </button>
      {open ? (
        <pre className="max-h-64 overflow-auto px-3 pb-3 font-sans text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {text || "…"}
        </pre>
      ) : null}
    </div>
  );
}

const MessageRow = memo(function MessageRow({
  message,
  models,
  onRate,
  onAnnotate,
}: {
  message: ChatMessage;
  models: CoarenaModel[];
  onRate: (messageId: string, rating: RatingValue | null) => Promise<void>;
  onAnnotate: (messageId: string, note: string, tags: string[]) => Promise<void>;
}) {
  const [note, setNote] = useState(message.ratingNote ?? "");
  const [tags, setTags] = useState<string[]>(message.ratingTags ?? []);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const signature = `${message.ratingNote ?? ""}\n${(message.ratingTags ?? []).join(",")}`;
  const [seenSignature, setSeenSignature] = useState(signature);
  if (signature !== seenSignature) {
    setSeenSignature(signature);
    setNote(message.ratingNote ?? "");
    setTags(message.ratingTags ?? []);
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[min(100%,38rem)] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  const liveReasoning = message.status === "streaming" && message.content.length === 0 && message.reasoning.length > 0;
  const waiting = message.status === "streaming" && !message.content && !message.reasoning;
  const modelName = message.modelName || modelDisplayName(models, message.modelId);
  const requested =
    message.substituted && message.requestedModelId
      ? modelDisplayName(models, message.requestedModelId)
      : "";
  const tagOptions = message.rating === "down" ? DOWN_TAGS : UP_TAGS;
  const dirty =
    note !== (message.ratingNote ?? "") ||
    tags.join(",") !== (message.ratingTags ?? []).join(",");

  async function rate(next: RatingValue | null) {
    setBusy(true);
    try {
      await onRate(message.id, next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="max-w-3xl">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{modelName}</span>
        {requested ? <span>menggantikan {requested}</span> : null}
        {message.substitutionReason === "cost_routing" ? <span>rute biaya</span> : null}
        {message.substitutionReason === "provider_restricted" ? <span>penyedia dibatasi</span> : null}
      </div>
      <ReasoningPanel text={message.reasoning} live={liveReasoning} />
      {waiting ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" />
          Menunggu model…
        </p>
      ) : null}
      {message.content ? <MarkdownView content={message.content} /> : null}
      {message.status === "streaming" && message.content ? (
        <span className="mt-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary align-middle" />
      ) : null}
      {message.error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {message.error}
        </p>
      ) : null}
      {message.status !== "streaming" ? (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant={message.rating === "up" ? "secondary" : "ghost"}
            aria-label="Jawaban ini membantu"
            aria-pressed={message.rating === "up"}
            disabled={busy || !message.requestId}
            onClick={() => void rate(message.rating === "up" ? null : "up")}
          >
            <ThumbsUpIcon />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={message.rating === "down" ? "secondary" : "ghost"}
            aria-label="Jawaban ini kurang membantu"
            aria-pressed={message.rating === "down"}
            disabled={busy || !message.requestId}
            onClick={() => void rate(message.rating === "down" ? null : "down")}
          >
            <ThumbsDownIcon />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Salin jawaban"
            disabled={!message.content}
            onClick={() => {
              navigator.clipboard
                .writeText(message.content)
                .then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1400);
                })
                .catch(() => toast.error("Tidak bisa menyalin jawaban."));
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </Button>
          {formatUsage(message) ? (
            <span className="ml-1 text-[11px] text-muted-foreground">{formatUsage(message)}</span>
          ) : null}
          {!message.requestId ? (
            <span className="text-[11px] text-muted-foreground">Penilaian tidak tersedia.</span>
          ) : null}
        </div>
      ) : null}
      {message.rating && message.requestId ? (
        <div className="mt-2 grid gap-2">
          <div className="flex flex-wrap gap-1.5">
            {tagOptions.map((tag) => {
              const selected = tags.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={selected}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                  onClick={() =>
                    setTags((current) =>
                      current.includes(tag.id)
                        ? current.filter((id) => id !== tag.id)
                        : [...current, tag.id],
                    )
                  }
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
          <Textarea
            value={note}
            maxLength={NOTE_LIMIT}
            placeholder="Catatan untuk penilaian ini, opsional."
            className="min-h-16 bg-card"
            onChange={(event) => setNote(event.target.value)}
          />
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!dirty || busy}
              onClick={() => {
                setBusy(true);
                void onAnnotate(message.id, note, tags).finally(() => setBusy(false));
              }}
            >
              Simpan catatan
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
});

export function MessageList({
  messages,
  models,
  onRate,
  onAnnotate,
}: {
  messages: ChatMessage[];
  models: CoarenaModel[];
  onRate: (messageId: string, rating: RatingValue | null) => Promise<void>;
  onAnnotate: (messageId: string, note: string, tags: string[]) => Promise<void>;
}) {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      {messages.map((message) => (
        <MessageRow
          key={message.id}
          message={message}
          models={models}
          onRate={onRate}
          onAnnotate={onAnnotate}
        />
      ))}
    </div>
  );
}
