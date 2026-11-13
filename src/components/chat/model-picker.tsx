"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { groupModels, modelDisplayName } from "@/lib/chat/models";
import type { CoarenaModel } from "@/lib/chat/types";

export function ModelPicker({
  models,
  modelId,
  disabled,
  onChange,
}: {
  models: CoarenaModel[];
  modelId: string;
  disabled?: boolean;
  onChange: (modelId: string) => void;
}) {
  const groups = groupModels(models);
  const label = models.length === 0 ? "Memuat model…" : modelDisplayName(models, modelId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled || models.length === 0}
        render={
          <Button variant="outline" className="max-w-[8.5rem] justify-between sm:max-w-[15rem]" />
        }
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon className="opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {groups.map((group, index) => (
          <DropdownMenuGroup key={group.provider}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>{group.provider}</DropdownMenuLabel>
            {group.models.map((model) => (
              <DropdownMenuItem
                key={model.id}
                onClick={() => onChange(model.id)}
                title={model.description}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{model.displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">{model.id}</span>
                </span>
                {model.id === modelId ? <CheckIcon /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
