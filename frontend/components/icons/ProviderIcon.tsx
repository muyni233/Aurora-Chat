"use client";

import * as React from "react";
import OpenAIIcon from "@lobehub/icons/es/OpenAI/components/Mono";
import AnthropicIcon from "@lobehub/icons/es/Anthropic/components/Mono";
import GeminiIcon from "@lobehub/icons/es/Gemini/components/Mono";
import AzureIcon from "@lobehub/icons/es/Azure/components/Mono";
import DeepSeekIcon from "@lobehub/icons/es/DeepSeek/components/Mono";
import GroqIcon from "@lobehub/icons/es/Groq/components/Mono";
import MistralIcon from "@lobehub/icons/es/Mistral/components/Mono";
import CohereIcon from "@lobehub/icons/es/Cohere/components/Mono";
import OpenRouterIcon from "@lobehub/icons/es/OpenRouter/components/Mono";
import TogetherIcon from "@lobehub/icons/es/Together/components/Mono";
import OllamaIcon from "@lobehub/icons/es/Ollama/components/Mono";
import { BrainCircuit } from "lucide-react";

type LobeIcon = React.ComponentType<{
  size?: number | string;
  className?: string;
}>;

export const PROVIDER_ICON: Record<string, LobeIcon> = {
  openai: OpenAIIcon as LobeIcon,
  anthropic: AnthropicIcon as LobeIcon,
  gemini: GeminiIcon as LobeIcon,
  azure: AzureIcon as LobeIcon,
  deepseek: DeepSeekIcon as LobeIcon,
  groq: GroqIcon as LobeIcon,
  mistral: MistralIcon as LobeIcon,
  cohere: CohereIcon as LobeIcon,
  openrouter: OpenRouterIcon as LobeIcon,
  together_ai: TogetherIcon as LobeIcon,
  ollama: OllamaIcon as LobeIcon,
};

export const PROVIDER_TINT: Record<string, string> = {
  openai: "#10A37F",
  anthropic: "#D97757",
  gemini: "#4285F4",
  azure: "#0078D4",
  deepseek: "#5B6CFF",
  groq: "#F55036",
  mistral: "#FF7000",
  cohere: "#39594D",
  openrouter: "#7C3AED",
  together_ai: "#0F62FE",
  ollama: "#888888",
  custom_openai: "#6366F1",
};

interface ProviderIconProps {
  providerType?: string;
  size?: number;
  className?: string;
}

export function ProviderIcon({
  providerType,
  size = 22,
  className,
}: ProviderIconProps) {
  const Icon = providerType ? PROVIDER_ICON[providerType] : undefined;
  const tint =
    (providerType && PROVIDER_TINT[providerType]) || "var(--color-primary)";
  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundColor: `color-mix(in srgb, ${tint} 14%, transparent)`,
        color: tint,
      }}
      className={`grid place-items-center rounded-lg shrink-0 ${className ?? ""}`}
    >
      {Icon ? (
        <Icon size={Math.round(size * 0.6)} />
      ) : (
        <BrainCircuit size={Math.round(size * 0.58)} />
      )}
    </div>
  );
}
