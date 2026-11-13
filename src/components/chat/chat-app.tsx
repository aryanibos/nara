"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MenuIcon, MoonIcon, SettingsIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Composer } from "@/components/chat/composer";
import { MessageList } from "@/components/chat/message-list";
import { ModelPicker } from "@/components/chat/model-picker";
import { SettingsDialog } from "@/components/chat/settings-dialog";
import { Sidebar } from "@/components/chat/sidebar";
import { streamChat } from "@/lib/chat/stream-client";
import {
  DEFAULT_EFFORT,
  DEFAULT_SYSTEM_PROMPT,
  PREFERRED_MODEL_ID,
  modelDisplayName,
  preferredModelId,
} from "@/lib/chat/models";
import {
  createId,
  patchMessage,
  titleFromMessage,
  toSummary,
  upsertSummary,
  type ChatMessage,
  type CoarenaModel,
  type Conversation,
  type ConversationSettings,
  type ConversationSummary,
  type RatingValue,
} from "@/lib/chat/types";
import {
  createConversationRepository,
  readActiveConversationId,
  writeActiveConversationId,
} from "@/lib/persistence/browser-repository";
import type { ConversationRepository } from "@/lib/persistence/repository";

const SUGGESTIONS = [
  "Jelaskan perbedaan jawaban streaming dan jawaban utuh, dengan contoh singkat.",
  "Buatkan draf pesan singkat untuk menunda rapat 30 menit.",
  "Tulis fungsi TypeScript debounce beserta contoh pemakaiannya.",
  "Ringkas cara kerja API yang kompatibel dengan OpenAI dalam lima poin.",
];

function resolvePendingModel(modelId: string, models: CoarenaModel[]): string {
  if (models.length === 0) return modelId || PREFERRED_MODEL_ID;
  if (models.some((model) => model.id === modelId)) return modelId;
  return preferredModelId(models);
}

function errorText(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string") {
    return (payload as { error: string }).error;
  }
  return fallback;
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Ganti mode terang atau gelap"
      onClick={() => {
        const dark = resolvedTheme
          ? resolvedTheme === "dark"
          : document.documentElement.classList.contains("dark");
        setTheme(dark ? "light" : "dark");
      }}
    >
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
  );
}

function Welcome({
  disabled,
  onSuggest,
}: {
  disabled?: boolean;
  onSuggest: (text: string) => void;
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-1 py-10">
      <p className="font-display text-4xl tracking-tight sm:text-5xl">Halo, Arya.</p>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        Pilih model di atas, lalu kirim pesan. Kamu bisa berganti model di tengah percakapan. Setiap balasan mencantumkan model yang menulisnya.
      </p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={disabled}
            onClick={() => onSuggest(suggestion)}
            className="rounded-2xl border bg-card px-3.5 py-3 text-left text-sm leading-snug transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatApp() {
  const repository = useMemo<ConversationRepository>(() => createConversationRepository(), []);
  const [ready, setReady] = useState(false);
  const [models, setModels] = useState<CoarenaModel[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [summaries, setSummaries] = useState<ConversationSummary[]>([]);
  const [conversations, setConversations] = useState<Record<string, Conversation>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<ConversationSettings>({
    modelId: PREFERRED_MODEL_ID,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    reasoningEffort: DEFAULT_EFFORT,
  });
  const [draft, setDraft] = useState("");
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const conversationsRef = useRef(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const active = activeId ? conversations[activeId] ?? null : null;
  const settings: ConversationSettings = active
    ? {
        modelId: active.modelId,
        systemPrompt: active.systemPrompt,
        reasoningEffort: active.reasoningEffort,
      }
    : {
        ...pending,
        modelId: resolvePendingModel(pending.modelId, models),
      };

  const reloadModels = useCallback(async () => {
    setModelsError(null);
    try {
      const response = await fetch("/api/models");
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "Daftar model gagal dimuat."));
      const data = payload as { models?: CoarenaModel[]; configured?: boolean };
      setModels(Array.isArray(data.models) ? data.models : []);
      setConfigured(data.configured !== false);
    } catch (error) {
      setModelsError(error instanceof Error ? error.message : "Daftar model gagal dimuat.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [storedResult, modelsResult] = await Promise.allSettled([
        (async () => {
          const list = await repository.list();
          const loaded = await Promise.all(list.map((item) => repository.get(item.id)));
          return {
            list,
            conversations: loaded.filter((item): item is Conversation => item !== null),
            activeId: readActiveConversationId(),
          };
        })(),
        fetch("/api/models").then(async (response) => {
          const payload: unknown = await response.json().catch(() => null);
          if (!response.ok) throw new Error(errorText(payload, "Daftar model gagal dimuat."));
          return payload as { models?: CoarenaModel[]; configured?: boolean };
        }),
      ]);
      if (cancelled) return;
      if (storedResult.status === "fulfilled") {
        const map: Record<string, Conversation> = {};
        for (const conversation of storedResult.value.conversations) {
          map[conversation.id] = conversation;
        }
        setConversations(map);
        setSummaries(storedResult.value.list);
        const storedActive = storedResult.value.activeId;
        if (storedActive && map[storedActive]) setActiveId(storedActive);
      }
      if (modelsResult.status === "fulfilled") {
        const data = modelsResult.value;
        setModels(Array.isArray(data.models) ? data.models : []);
        setConfigured(data.configured !== false);
      } else {
        setModelsError(
          modelsResult.reason instanceof Error
            ? modelsResult.reason.message
            : "Daftar model gagal dimuat.",
        );
      }
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const tail = active?.messages.at(-1);
  useEffect(() => {
    if (!stickRef.current) return;
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [active?.id, active?.messages.length, tail?.content, tail?.reasoning, tail?.status]);

  const persist = useCallback(
    async (conversation: Conversation) => {
      await repository.save(conversation);
      setConversations((current) => ({ ...current, [conversation.id]: conversation }));
      setSummaries((current) => upsertSummary(current, toSummary(conversation)));
      setActiveId(conversation.id);
      writeActiveConversationId(conversation.id);
    },
    [repository],
  );

  function updateSettings(patch: Partial<ConversationSettings>) {
    if (!active) {
      setPending((current) => ({ ...current, ...patch }));
      return;
    }
    void persist({ ...active, ...patch, updatedAt: new Date().toISOString() }).catch(() => {
      toast.error("Pengaturan tidak tersimpan.");
    });
  }

  function selectConversation(id: string) {
    if (streamingId && id !== activeId) abortRef.current?.abort();
    setActiveId(id);
    writeActiveConversationId(id);
    setMobileNav(false);
    stickRef.current = true;
  }

  function startNew() {
    if (streamingId) abortRef.current?.abort();
    setActiveId(null);
    writeActiveConversationId(null);
    setDraft("");
    setMobileNav(false);
    stickRef.current = true;
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streamingId) return;
    if (!configured) {
      toast.error("COARENA_API_KEY belum diatur di server.");
      return;
    }
    const modelId = settings.modelId;
    if (!modelId) {
      toast.error("Pilih model dulu.");
      return;
    }

    const now = new Date().toISOString();
    const base: Conversation = active ?? {
      id: createId("conv"),
      title: titleFromMessage(trimmed),
      createdAt: now,
      updatedAt: now,
      modelId,
      systemPrompt: settings.systemPrompt,
      reasoningEffort: settings.reasoningEffort,
      messages: [],
    };
    const userMessage: ChatMessage = {
      id: createId("msg"),
      role: "user",
      content: trimmed,
      reasoning: "",
      createdAt: now,
      status: "complete",
    };
    const assistantId = createId("msg");
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      reasoning: "",
      createdAt: now,
      status: "streaming",
      modelId,
      requestedModelId: modelId,
      modelName: modelDisplayName(models, modelId),
    };
    let conversation: Conversation = {
      ...base,
      modelId,
      systemPrompt: settings.systemPrompt,
      reasoningEffort: settings.reasoningEffort,
      title: base.messages.length === 0 ? titleFromMessage(trimmed) : base.title,
      updatedAt: now,
      messages: [...base.messages, userMessage, assistantMessage],
    };

    const controller = new AbortController();
    abortRef.current = controller;
    setDraft("");
    setStreamingId(assistantId);
    stickRef.current = true;
    try {
      await persist(conversation);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Percakapan tidak tersimpan.");
    }
    if (controller.signal.aborted) {
      const stopped = patchMessage(conversation, assistantId, {
        status: "error",
        error: "Balasan dihentikan.",
      });
      setConversations((current) => ({ ...current, [stopped.id]: stopped }));
      setStreamingId(null);
      abortRef.current = null;
      try {
        await repository.save(stopped);
        setSummaries((current) => upsertSummary(current, toSummary(stopped)));
      } catch {
        // The in-memory thread already shows that the reply was stopped.
      }
      return;
    }
    let content = "";
    let reasoning = "";
    let note: string | undefined;
    let frame = 0;

    const publish = (next: Conversation) => {
      conversation = next;
      setConversations((current) => ({ ...current, [next.id]: next }));
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        publish(patchMessage(conversation, assistantId, { content, reasoning }));
      });
    };

    let aborted = false;
    try {
      await streamChat({
        model: modelId,
        systemPrompt: conversation.systemPrompt,
        reasoningEffort: conversation.reasoningEffort,
        messages: conversation.messages
          .filter((message) => message.id !== assistantId && message.content.trim())
          .map((message) => ({ role: message.role, content: message.content })),
        signal: controller.signal,
        onEvent(event) {
          if (event.type === "meta") {
            publish(
              patchMessage(conversation, assistantId, {
                requestId: event.requestId || undefined,
                modelId: event.model,
                modelName: modelDisplayName(models, event.model),
                requestedModelId: event.requestedModel,
                substituted: event.substituted,
                substitutionReason: event.substitutionReason,
                content,
                reasoning,
              }),
            );
          } else if (event.type === "content") {
            content += event.text;
            schedule();
          } else if (event.type === "reasoning") {
            reasoning += event.text;
            schedule();
          } else if (event.type === "usage") {
            publish(patchMessage(conversation, assistantId, { usage: event.usage, content, reasoning }));
          } else if (event.type === "error") {
            note = event.message;
          }
        },
      });
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        aborted = true;
      } else {
        note = error instanceof Error ? error.message : "Balasan gagal.";
      }
    } finally {
      if (frame) window.cancelAnimationFrame(frame);
      const failed = Boolean(note) && !content;
      conversation = patchMessage(conversation, assistantId, {
        content,
        reasoning,
        status: failed ? "error" : "complete",
        error: failed ? note : aborted && !content ? "Balasan dihentikan." : note,
      });
      setStreamingId(null);
      abortRef.current = null;
      publish(conversation);
      try {
        await repository.save(conversation);
        setSummaries((current) => upsertSummary(current, toSummary(conversation)));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Balasan tidak tersimpan.");
      }
    }
  }

  const rateMessage = useCallback(
    async (messageId: string, rating: RatingValue | null) => {
      const conversation = activeId ? conversationsRef.current[activeId] : null;
      const message = conversation?.messages.find((item) => item.id === messageId);
      if (!conversation || !message?.requestId) {
        toast.error("Balasan ini tidak punya id permintaan, jadi belum bisa dinilai.");
        return;
      }
      const previous = conversation;
      const next = patchMessage(conversation, messageId, {
        rating,
        ratingNote: rating ? message.ratingNote : "",
        ratingTags: rating ? message.ratingTags : [],
      });
      setConversations((current) => ({ ...current, [next.id]: next }));
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: message.requestId, rating }),
      });
      if (!response.ok) {
        setConversations((current) => ({ ...current, [previous.id]: previous }));
        const payload: unknown = await response.json().catch(() => null);
        toast.error(errorText(payload, "Penilaian tidak terkirim."));
        return;
      }
      try {
        await repository.save(next);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Penilaian tidak tersimpan di peramban.");
      }
    },
    [activeId, repository],
  );

  const annotateMessage = useCallback(
    async (messageId: string, note: string, tags: string[]) => {
      const conversation = activeId ? conversationsRef.current[activeId] : null;
      const message = conversation?.messages.find((item) => item.id === messageId);
      if (!conversation || !message?.requestId || !message.rating) return;
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: message.requestId,
          rating: message.rating,
          note,
          tags,
        }),
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        toast.error(errorText(payload, "Catatan tidak terkirim."));
        return;
      }
      const next = patchMessage(conversation, messageId, { ratingNote: note, ratingTags: tags });
      setConversations((current) => ({ ...current, [next.id]: next }));
      try {
        await repository.save(next);
        toast.success("Catatan tersimpan.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Catatan tidak tersimpan di peramban.");
      }
    },
    [activeId, repository],
  );

  async function confirmRename() {
    if (!renameId) return;
    const conversation = conversations[renameId];
    if (!conversation) {
      setRenameId(null);
      return;
    }
    const title = renameValue.trim() || "Percakapan baru";
    try {
      await persist({ ...conversation, title, updatedAt: new Date().toISOString() });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nama tidak tersimpan.");
    }
    setRenameId(null);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    if (streamingId && activeId === deleteId) abortRef.current?.abort();
    try {
      await repository.delete(deleteId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Percakapan tidak terhapus.");
      return;
    }
    setConversations((current) => {
      const next = { ...current };
      delete next[deleteId];
      return next;
    });
    setSummaries((current) => current.filter((item) => item.id !== deleteId));
    if (activeId === deleteId) {
      setActiveId(null);
      writeActiveConversationId(null);
    }
    setDeleteId(null);
    setMobileNav(false);
  }

  const sidebarProps = {
    summaries,
    models,
    activeId,
    query,
    onQueryChange: setQuery,
    onSelect: selectConversation,
    onNew: startNew,
    onRename: (id: string) => {
      setRenameValue(conversations[id]?.title ?? "");
      setRenameId(id);
    },
    onDelete: (id: string) => setDeleteId(id),
  };

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden h-full w-72 shrink-0 border-r md:block">
        <Sidebar {...sidebarProps} />
      </aside>
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-80 p-0 sm:max-w-xs">
          <SheetHeader className="sr-only">
            <SheetTitle>Percakapan</SheetTitle>
          </SheetHeader>
          <Sidebar {...sidebarProps} insetClose />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-3 py-2.5 sm:px-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Buka daftar percakapan"
            onClick={() => setMobileNav(true)}
          >
            <MenuIcon />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {active?.title ?? "Percakapan baru"}
            </p>
          </div>
          <ModelPicker
            models={models}
            modelId={settings.modelId}
            disabled={!ready || Boolean(modelsError)}
            onChange={(modelId) => updateSettings({ modelId })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Pengaturan percakapan"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
          </Button>
          <ThemeToggle />
        </header>

        {!configured ? (
          <p className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
            Server belum membaca COARENA_API_KEY. Salin .env.example menjadi .env.local, isi kuncinya, lalu jalankan ulang.
          </p>
        ) : null}
        {modelsError ? (
          <div className="flex items-center justify-between gap-3 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <p>{modelsError}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void reloadModels()}>
              Coba lagi
            </Button>
          </div>
        ) : null}

        <div
          ref={scrollerRef}
          className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-5"
          onScroll={(event) => {
            const node = event.currentTarget;
            stickRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
          }}
        >
          <div className="sr-only" aria-live="polite">
            {streamingId ? "Model sedang menulis." : ""}
          </div>
          {!ready ? (
            <div className="mx-auto max-w-3xl space-y-3 pt-8">
              <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
              <div className="h-20 animate-pulse rounded-2xl bg-muted" />
              <div className="ml-auto h-12 w-2/3 animate-pulse rounded-2xl bg-muted" />
            </div>
          ) : active && active.messages.length > 0 ? (
            <MessageList
              messages={active.messages}
              models={models}
              onRate={rateMessage}
              onAnnotate={annotateMessage}
            />
          ) : (
            <div className="flex h-full min-h-[70vh] items-center">
              <Welcome
                disabled={!configured || !settings.modelId || Boolean(streamingId)}
                onSuggest={(text) => void sendMessage(text)}
              />
            </div>
          )}
        </div>

        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => void sendMessage(draft)}
          onStop={() => abortRef.current?.abort()}
          streaming={Boolean(streamingId)}
          disabled={!ready || !configured || !settings.modelId}
        />
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={updateSettings}
      />

      <Dialog open={renameId !== null} onOpenChange={(open) => !open && setRenameId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah nama</DialogTitle>
            <DialogDescription>Nama ini hanya tampil di daftar percakapan.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            autoFocus
            maxLength={120}
            aria-label="Nama percakapan"
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void confirmRename();
              }
            }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameId(null)}>
              Batal
            </Button>
            <Button type="button" onClick={() => void confirmRename()}>
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus percakapan?</DialogTitle>
            <DialogDescription>
              Riwayat di peramban ini akan hilang. Penilaian yang sudah terkirim ke Coarena tetap tersimpan di sana.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteId(null)}>
              Batal
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmDelete()}>
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
