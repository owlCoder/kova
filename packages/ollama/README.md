# @kova/ollama

Reserved adapter boundary. Implement `OllamaLlmProvider` and `OllamaModelCatalog` here after architecture approval. HTTP, NDJSON parsing, cancellation bridging and provider-specific DTOs stay in this package. Core owns the generic contracts; this package depends inward on Core.

See [provider mapping](../../docs/PROVIDERS.md). No HTTP implementation or runtime dependency is installed in the architecture phase.
