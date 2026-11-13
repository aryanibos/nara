import type { CoarenaModel, ReasoningEffort } from "@/lib/chat/types";

export const PREFERRED_MODEL_ID = "claude-haiku-5-5";

export const DEFAULT_SYSTEM_PROMPT =
  "Kamu membantu Arya. Jawab dalam bahasa Indonesia yang jelas, kecuali jika diminta bahasa lain. Jika kamu tidak yakin, katakan terus terang.";

export const DEFAULT_EFFORT: ReasoningEffort = "medium";

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  google: "Google",
  openai: "OpenAI",
  xai: "xAI",
  deepseek: "DeepSeek",
  moonshot: "Moonshot",
  "z.ai": "Z.ai",
  zai: "Z.ai",
  tencent: "Tencent",
  xiaomi: "Xiaomi",
  minimax: "MiniMax",
  qwen: "Qwen",
  alibaba: "Alibaba",
};

export function providerLabel(ownedBy: string): string {
  const key = ownedBy.trim().toLowerCase();
  return PROVIDER_LABELS[key] ?? ownedBy;
}

export function preferredModelId(models: CoarenaModel[]): string {
  return (
    models.find((model) => model.id === PREFERRED_MODEL_ID)?.id ??
    models[0]?.id ??
    ""
  );
}

export function modelDisplayName(
  models: CoarenaModel[],
  modelId: string | undefined,
): string {
  if (!modelId) return "Model";
  return models.find((model) => model.id === modelId)?.displayName ?? modelId;
}

export function groupModels(models: CoarenaModel[]): Array<{
  provider: string;
  models: CoarenaModel[];
}> {
  const groups: Array<{ provider: string; models: CoarenaModel[] }> = [];
  for (const model of models) {
    const provider = providerLabel(model.ownedBy);
    const existing = groups.find((group) => group.provider === provider);
    if (existing) existing.models.push(model);
    else groups.push({ provider, models: [model] });
  }
  return groups;
}
