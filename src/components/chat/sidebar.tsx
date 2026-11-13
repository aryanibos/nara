"use client";

import { MoreHorizontalIcon, PlusIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { modelDisplayName } from "@/lib/chat/models";
import type { CoarenaModel, ConversationSummary } from "@/lib/chat/types";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export function Sidebar({
  summaries,
  models,
  activeId,
  query,
  onQueryChange,
  onSelect,
  onNew,
  onRename,
  onDelete,
  insetClose,
}: {
  summaries: ConversationSummary[];
  models: CoarenaModel[];
  activeId: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  insetClose?: boolean;
}) {
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? summaries.filter((item) =>
        `${item.title} ${item.preview}`.toLowerCase().includes(needle),
      )
    : summaries;

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className={`flex items-start justify-between gap-2 px-4 pt-4 pb-3 ${insetClose ? "pr-12" : ""}`}>
        <div>
          <p className="font-display text-2xl leading-none tracking-tight">Nara</p>
          <p className="mt-1 text-xs text-muted-foreground">Obrolan Arya</p>
        </div>
      </div>
      <div className="px-3">
        <Button type="button" className="w-full justify-start" onClick={onNew}>
          <PlusIcon />
          Percakapan baru
        </Button>
      </div>
      <div className="px-3 pt-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Cari percakapan"
            aria-label="Cari percakapan"
            className="bg-background/70 pl-8"
          />
        </div>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {summaries.length === 0
              ? "Belum ada percakapan."
              : "Tidak ada percakapan yang cocok."}
          </p>
        ) : (
          <ul className="grid gap-0.5">
            {visible.map((item) => {
              const selected = item.id === activeId;
              return (
                <li key={item.id} className="flex items-stretch gap-0.5">
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className={`min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      selected ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/70"
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{item.title}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatWhen(item.updatedAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {modelDisplayName(models, item.modelId)}
                      {item.preview ? ` · ${item.preview}` : ""}
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" className="mt-1 shrink-0" />}
                      aria-label={`Menu ${item.title}`}
                    >
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onRename(item.id)}>Ubah nama</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => onDelete(item.id)}>
                        Hapus
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="border-t px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        Riwayat ada di peramban ini. Model berganti di tengah percakapan, dan setiap balasan mencatat penulisnya.
      </p>
    </div>
  );
}
