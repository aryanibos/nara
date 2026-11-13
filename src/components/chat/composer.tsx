"use client";

import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
}) {
  const canSend = value.trim().length > 0 && !streaming && !disabled;

  return (
    <div className="border-t bg-background/85 px-3 py-3 backdrop-blur-md sm:px-5">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <label className="sr-only" htmlFor="nara-composer">
          Pesan
        </label>
        <Textarea
          id="nara-composer"
          value={value}
          disabled={disabled}
          placeholder="Tulis pesan… Enter untuk kirim, Shift+Enter untuk baris baru."
          className="max-h-40 min-h-11 flex-1 resize-none bg-card px-3 py-2.5"
          rows={1}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (canSend) onSend();
            }
          }}
        />
        {streaming ? (
          <Button type="button" size="icon-lg" variant="secondary" onClick={onStop} aria-label="Berhenti">
            <SquareIcon />
          </Button>
        ) : (
          <Button type="button" size="icon-lg" onClick={onSend} disabled={!canSend} aria-label="Kirim">
            <ArrowUpIcon />
          </Button>
        )}
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-xs text-muted-foreground">
        Riwayat tersimpan di peramban ini. Jangan kirim kata sandi atau data pribadi.
      </p>
    </div>
  );
}
