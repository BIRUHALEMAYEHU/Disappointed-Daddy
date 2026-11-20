/**
 * AI providers a user can bring their own key for. Anthropic uses its native API; the rest speak the
 * "OpenAI-compatible" Chat Completions API. Base URLs are fixed here on purpose: servers must never
 * call an arbitrary user-supplied URL.
 */
export interface ProviderPreset {
  id: ProviderId;
  label: string;
  /** Native Anthropic Messages API, or OpenAI-compatible Chat Completions. */
  kind: "anthropic" | "openai";
  baseUrl?: string;
  /** Model used when the user doesn't pick one. Unset = the user must choose (names change often). */
  defaultModel?: string;
  keyUrl: string;
  /** Shown next to the provider in pickers. */
  note?: string;
}

export type ProviderId = "anthropic" | "openai" | "gemini" | "openrouter" | "deepseek" | "groq";

export const PROVIDERS: Record<ProviderId, ProviderPreset> = {
  anthropic: {
    id: "anthropic", label: "Anthropic (Claude)", kind: "anthropic", defaultModel: "claude-opus-5-5",
    keyUrl: "https://console.anthropic.com/settings/keys", note: "recommended",
  },
  openai: {
    id: "openai", label: "OpenAI (GPT)", kind: "openai", baseUrl: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  gemini: {
    id: "gemini", label: "Google Gemini", kind: "openai", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.8-flash", keyUrl: "https://aistudio.google.com/apikey", note: "has a free tier",
  },
  openrouter: {
    id: "openrouter", label: "OpenRouter (many models)", kind: "openai", baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/keys",
  },
  deepseek: {
    id: "deepseek", label: "DeepSeek", kind: "openai", baseUrl: "https://api.deepseek.com/v1",
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  groq: {
    id: "groq", label: "Groq", kind: "openai", baseUrl: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
  },
};

export const isProviderId = (x: unknown): x is ProviderId => typeof x === "string" && x in PROVIDERS;

/** Loose sanity check for a pasted key: no spaces, plausible length. Providers' formats differ and change. */
export const looksLikeApiKey = (key: string) => /^[A-Za-z0-9_\-.:]{16,400}$/.test(key);

/** Model names: letters, digits and the punctuation real model IDs use (e.g. "openai/gpt-x:free"). */
export const looksLikeModel = (model: string) => /^[A-Za-z0-9_\-.:/@]{1,120}$/.test(model);
