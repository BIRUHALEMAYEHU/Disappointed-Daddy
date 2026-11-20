/**
 * What hosted AI usage costs us, so prepaid credit can be charged at real cost.
 * Prices are USD per million tokens, Anthropic first-party rates (from the claude-api reference, Nov 2026).
 * Cache writes (5-minute TTL) cost 1.25x input. Update this table when prices change.
 */
interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
}

const PRICES: Record<string, ModelPrice> = {
  "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
const CACHE_WRITE_MULTIPLIER = 1.25;

/** Unknown models are charged at the most expensive known rate, so we never undercharge. */
const FALLBACK_PRICE: ModelPrice = Object.values(PRICES).reduce((a, b) => (b.output > a.output ? b : a));

export function priceFor(model: string | undefined | null): ModelPrice {
  if (!model) return FALLBACK_PRICE;
  const exact = PRICES[model];
  if (exact) return exact;
  // Dated or suffixed IDs ("claude-opus-5-5-xyz", "anthropic.claude-opus-5-5"): match the known base name.
  const base = Object.keys(PRICES).find((k) => model.includes(k));
  return base ? PRICES[base] : FALLBACK_PRICE;
}

export interface Usage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Cost of one response in micro-dollars (1 USD = 1,000,000), rounded up. */
export function costMicroUsd(usage: Usage, ...models: Array<string | undefined | null>): number {
  const n = (x: number | null | undefined) => (typeof x === "number" && x > 0 ? x : 0);
  // If a response was served by a fallback model, charge at the more expensive of the models involved.
  const candidates = models.filter(Boolean).length ? models : [undefined];
  const perMillion = Math.max(
    ...candidates.map((m) => {
      const p = priceFor(m);
      return (
        n(usage.input_tokens) * p.input +
        n(usage.cache_creation_input_tokens) * p.input * CACHE_WRITE_MULTIPLIER +
        n(usage.cache_read_input_tokens) * p.cacheRead +
        n(usage.output_tokens) * p.output
      );
    }),
  );
  return Math.ceil(perMillion); // tokens x $/MTok = micro-dollars
}

export const MICRO = 1_000_000;
export const usd = (micro: number) => micro / MICRO;
export const fmtUsd = (micro: number) => `$${(Math.floor(micro / 10_000) / 100).toFixed(2)}`;
