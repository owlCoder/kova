# Context budget and memory

Status: **Accepted**. ContextBuilder, TokenCounter and ConversationCompactor are concrete pure classes; IO/model boundaries retain ports. The budget includes native tool definitions, selected skill, explicit attachments and bounded conversation/tool results.

## Budget

```text
total context = 32,768
output reserve = 4,096
safety margin = ceil(32,768 × 0.10) = 3,277
estimated input budget = 32,768 − 4,096 − 3,277 = 25,395
```

Validate settings: positive integer maximum/reserve, reserve smaller than maximum, margin in [0, 1), positive output cap, and a positive resulting input budget. Default per-tool model output cap is 8,000 characters. ContextBuilder may shrink it further. The UI maximum and provider `num_ctx` are the same captured setting. Never silently reduce the configured window; if the model cannot support it, reject with a visible suggestion.

Count **all** content: system text, project rules from `AGENTS.md`, selected skill, tool native function-envelope schemas/descriptions/names, current user message, summary, historical assistant calls and framing, attachments, tool results and synthetic omission/repair markers. Estimate characters conservatively (initially roughly three characters per token with a UTF-8-byte adjustment for non-ASCII input), plus explicit message/schema framing. This remains an estimate, not a guaranteed tokenizer bound. TokenCounter encapsulates the strategy so it can be improved without changing orchestration.

`prompt_eval_count` / `eval_count` update actual UI usage after a response. Retain estimated tool-definition cost separately because the provider reports aggregate usage. A per-model conservative correction may increase later estimates when actual input exceeded the estimate; never shrink the reserve because one request was cheap. Do not pretend tool-definition cost is directly measured by Ollama.

## Priority and eviction

| Priority, highest first            | Handling                                                 |
| ---------------------------------- | -------------------------------------------------------- |
| System instructions                | Pinned                                                   |
| Currently enabled tool definitions | Pinned; Plan exposes only reviewed read-only definitions |
| Active skill                       | Pinned, only one selected body                           |
| Current user message               | Pinned; never silently truncate                          |
| Recent conversation                | Keep newest complete turns; compact older ones           |
| Selection/current file             | Explicit attachment only; truncate if needed             |
| Explicit user files                | Explicit attachment only; truncate if needed             |
| Tool results                       | Old results become stubs first                           |
| MCP results                        | Old results become stubs first, with provenance retained |

Current-step tool results are additionally pinned **as identities**: each name/call-ID/result/error remains present, payload truncated if necessary. For multiple calls in the same step, share remaining space across results so the last result cannot evict earlier current-step results. If minimal markers and pinned instructions still cannot fit, return Overflow, not an invalid request.

Evict by age, old first:

1. Replace old tool/MCP output bodies with one-line stubs such as `[read_file src/X.cs: 214 lines, omitted]`. Preserve assistant tool-call metadata and corresponding result IDs; do not strand native call/result pairs. The latest active batch is exempt from removal.
2. Truncate explicit attachments, older/lower-priority ones first, preserving source labels and omitted counts. Drop payload down to a stub if necessary; current user/skill/system are untouched.
3. Compact whole older conversation turns into a structured summary, keeping newest turns. Bound/truncate the summary itself if needed. Preserve the current user message, current assistant calls and current-step result markers.
4. Shorten current-step payloads further if required, keeping every result identity. If pinned non-result content or minimum paired framing exceeds the input budget, return `PinnedContextExceedsBudget` with required/available token counts and a suggestion (reduce skill/tool set or shorten prompt).

ContextBuilder returns a ready request plus the bounded conversation to persist, or a structured overflow. It performs no IO and no background model call. ContextUpdated records which labels were stubbed, truncated or compacted; teaching UI can reveal what was sent without dumping the workspace.

## Compaction and retention

Deterministic compaction produces Goal, Files inspected, Changes and Outstanding from previous summary, bounded user/assistant text and structured tool metadata. It is a lossy reference, not a verified claim that a plan was fulfilled. Do not infer successful changes from an attempted/denied tool. Summary entries from untrusted outputs remain clearly labeled data. There is no automatic LLM summarizer in v1.

Retention ceilings complement the token budget: stored transcript 65,536 characters and 80 entries before the next provider request; structured summary target 768 tokens; model-facing tool payload 8,000 characters; one UI tool result 30,000 characters; total retained UI tool-output text 256,000 characters; 200 activity rows; live thinking 16,000 characters, retained only for the current visible response until the next prompt/chat or Webview reload. Trim oldest retained data first. Rebound before every provider request, including continuations after tool batches; generation text is independently capped.

Keep no permanent event log in memory. History across chats is not required: NewConversation releases the previous active transcript. Prompt is capped at 16,000 characters at the host boundary; this is an input-size ceiling, not a promise it fits with a large skill/tool set. Limit attachments to 10 and text reads/previews to 2 MiB each; binary/oversized files are refused with a narrow-read suggestion. Output buffering stops at bounded caps even when subprocesses keep writing.

Truncation marker includes the exact omitted character count and a useful hint: `output truncated (omitted 21,400 characters; narrow the search or read a line range)`. Marker/framing cost is included inside the cap. `read_file` line ranges and bounded `search_files` results let the model narrow requests.

No background workspace ingestion occurs. Estimates remain conservative heuristics; real usage reconciles subsequent requests.
