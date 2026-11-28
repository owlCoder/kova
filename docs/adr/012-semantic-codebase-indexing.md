# ADR 012: Tree-sitter and hybrid semantic codebase indexing

Status: **Proposed in PR**

## Context

Literal substring and regex search (`search_files`, `@mention`) locates exact identifiers well, but struggles when users ask conceptual or descriptive questions without knowing exact symbol names. At the same time, indexing must preserve Kova's local-first design and strict package boundaries (`@kova/core` has zero external dependencies, and `@kova/vscode` must not import `@kova/ollama` directly).

## Decision

Introduce a hybrid keyword + semantic codebase index across `@kova/core`, `@kova/ollama` and `@kova/runtime`:

- **Core contracts and ranking:** Define `CodeIndex`, `IndexedSnippet` (with optional `vector`), `CodeIndexQuery` (with optional `queryVector`), and the `EmbeddingProvider` interface in `@kova/core`. `RelevanceRanker` combines existing keyword/symbol/graph scoring with cosine similarity (`Math.max(0, cosine(queryVector, vector) - 0.5) * 40`), awarding semantic points only when similarity exceeds `0.5`.
- **AST symbol extraction and packaging:** Use `web-tree-sitter` and bundled `.wasm` language grammars inside `@kova/runtime` (`WorkspaceCodeIndex`) to extract structural symbols, dependency edges and code snippets, caching file entries incrementally by `mtimeMs` and refreshing edited files after `write_file` and `edit_file`.
- **Local Ollama embedding adapter:** Implement `OllamaEmbeddingProvider` in `@kova/ollama` on top of `OllamaConnection.json('/api/embed', ...)` in batches of 16, reusing existing timeout, response-size limit and cancellation handling.
- **Boundary-preserving composition:** Configure `kova.indexing.enabled` and `kova.indexing.embeddingModel` (default `nomic-embed-text`) in `@kova/vscode`, passing configuration strings through `WorkspaceRuntime` into `NodeWorkspaceRuntime`, which instantiates `OllamaConnection` and `OllamaEmbeddingProvider`.

## Consequences

- Descriptive queries without exact symbol names surface semantically related code snippets while preserving exact-match precision through combined scoring.
- Initial indexing on large repositories takes longer when computing snippet embeddings, while subsequent runs only re-embed new or modified files due to `mtimeMs` caching.
- If Ollama is unreachable, the embedding model is missing, or `kova.indexing.embeddingModel` is empty, `WorkspaceCodeIndex` disables embeddings for the active session and falls back seamlessly to keyword-only ranking without failing the agent run.
- Architecture boundary tests (`tests/architecture/boundaries.test.ts`) remain green because `@kova/vscode` never imports `@kova/ollama` directly.
