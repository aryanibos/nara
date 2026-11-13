"use client";

import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-display text-3xl">Ada yang tidak beres.</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Nara tidak bisa menampilkan obrolan. Coba muat ulang halaman ini.
      </p>
      <Button type="button" onClick={() => reset()}>
        Coba lagi
      </Button>
    </div>
  );
}
