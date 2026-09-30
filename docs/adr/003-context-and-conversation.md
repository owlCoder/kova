# ADR 003: Bounded context and conversation

Status: **Accepted with review changes, 2026-09-30**

## Context

Qwen3 4B must operate in an explicit context window. Tools consume tokens, small models loop, and unbounded history/output would defeat the low-memory goal. Persistence beyond the session is unnecessary in v1.

## Decision

From 0.3.1, default to 32,768 total tokens and reserve 4,096 output tokens plus a 10% safety margin (3,277 tokens), leaving 25,395 estimated input tokens. This replaces the initial 8,192/1,024 defaults at the user's request. Explicit settings override these defaults; larger local windows use more memory and must fit the selected model's limit. Count all serialized tool definitions and message framing. Reconcile the estimate with provider usage, retaining the reserve. Provider context equals the UI maximum; never rely on server defaults.

Stub old tool/MCP outputs first, truncate explicitly attached files/selection second, compact complete old turns third. System, enabled tools, selected skill and current user text remain pinned. Current-step tool-result identities stay, with payload truncated as needed. Pinned context that still cannot fit is a structured overflow; do not issue a silently truncated request.

Compaction is deterministic and uses no additional LLM request. Store a structured bounded summary and recent turns in an in-memory repository. Persist the bounded conversation returned by ContextBuilder so compaction actually frees memory. Thinking is transient presentation state only. Retained UI output is separately bounded.

## Consequences

Summary quality is modest and cannot recover facts omitted by deterministic compaction. The user may need to reattach/restate details. Token counting is conservative estimation, not proof of exact tokenizer size. Actual usage informs future estimates but does not authorize exceeding the configured window. There is no indexing, embeddings or background ingestion. See [context algorithm](../CONTEXT.md).
