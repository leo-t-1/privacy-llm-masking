export interface PIIEntity {
  placeholder: string;
  original_value: string;
  entity_type: string;
  score: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;           // displayed text
  maskedContent?: string;    // what was actually sent to LLM (user messages)
  entities?: PIIEntity[];
  mapping?: Record<string, string>;
  rawResponse?: string;      // assistant response with placeholders
  restoredResponse?: string; // assistant response with originals restored
  isLoading?: boolean;
}

export type Provider = "demo" | "deepseek" | "openai" | "groq" | "together" | "openrouter" | "mistral";

export interface ProviderInfo {
  label: string;
  base_url: string;
  models: string[];
  default_model: string;
  no_key_required?: boolean;
}

export interface ApiConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  maskPii: boolean;
  restorePiiInResponse: boolean;
  scoreThreshold: number;
}
