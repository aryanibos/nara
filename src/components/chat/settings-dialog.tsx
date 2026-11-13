"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/chat/models";
import { REASONING_EFFORTS, type ConversationSettings, type ReasoningEffort } from "@/lib/chat/types";

const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  xhigh: "Sangat tinggi",
  max: "Maksimal",
};

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ConversationSettings;
  onChange: (patch: Partial<ConversationSettings>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pengaturan percakapan</DialogTitle>
          <DialogDescription>
            Instruksi dan upaya penalaran dipakai pada pesan berikutnya. Riwayat sebelumnya tetap tersimpan.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Instruksi sistem</span>
            <Textarea
              value={settings.systemPrompt}
              onChange={(event) => onChange({ systemPrompt: event.target.value })}
              placeholder="Kosongkan bila tidak perlu."
              className="min-h-28"
              maxLength={8000}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange({ systemPrompt: DEFAULT_SYSTEM_PROMPT })}
            >
              Pakai contoh
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ systemPrompt: "" })}
            >
              Kosongkan
            </Button>
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Upaya penalaran</span>
            <div className="flex flex-wrap gap-1.5">
              {REASONING_EFFORTS.map((effort) => (
                <Button
                  key={effort}
                  type="button"
                  size="sm"
                  variant={settings.reasoningEffort === effort ? "default" : "outline"}
                  onClick={() => onChange({ reasoningEffort: effort })}
                >
                  {EFFORT_LABELS[effort]}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Model yang menalar memakai token ini sebelum menjawab. Upaya lebih tinggi biasanya lebih lambat.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
