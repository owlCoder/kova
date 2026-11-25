/** Default context budget; small or local models are capped to what they report. */
export const DEFAULT_CONTEXT_TOKENS = 200_000;

/**
 * The context actually used for a run: the configured budget, capped to the
 * model's reported window, with the output reservation kept to at most a
 * quarter of that window so small models still have room for the prompt.
 */
export function effectiveContext(
  configuredMax: number,
  configuredReserve: number,
  modelMax: number | null | undefined,
): { maxTokens: number; reservedOutputTokens: number } {
  const maxTokens = modelMax && modelMax > 0 ? Math.min(configuredMax, modelMax) : configuredMax;
  return {
    maxTokens,
    reservedOutputTokens: Math.max(128, Math.min(configuredReserve, Math.floor(maxTokens / 4))),
  };
}

/** Local Ollama allocates `num_ctx` up front, so its default stays memory-safe. */
export const DEFAULT_OLLAMA_CONTEXT_TOKENS = 32_768;

/**
 * Reads the context settings and applies {@link effectiveContext}. For local
 * Ollama the model window is further capped by `kova.ollama.maxContextTokens`.
 */
export function configuredContext(
  settings: { get<T>(key: string, fallback: T): T },
  model: { readonly maxContextTokens: number | null } | undefined,
  providerKind: string,
) {
  const local =
    providerKind === 'ollama'
      ? settings.get('ollama.maxContextTokens', DEFAULT_OLLAMA_CONTEXT_TOKENS)
      : null;
  const reported = model?.maxContextTokens ?? null;
  const modelMax = local === null ? reported : Math.min(local, reported ?? local);
  return effectiveContext(
    settings.get('context.maxTokens', DEFAULT_CONTEXT_TOKENS),
    settings.get('context.reservedOutputTokens', 4096),
    modelMax,
  );
}
