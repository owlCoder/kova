# < ✦ > Kova

**Local Coding Agent** — an offline-first AI coding assistant for VS Code, designed as a readable Clean Architecture reference implementation.

## Current status

**Architecture phase, proposed for review.** This repository contains the product specification, architecture decisions, typed contracts, the host/Webview protocol, a delivery plan, and automated boundary checks. It does **not** contain a working extension, agent, provider, or UI yet. Nothing starts Ollama, MCP servers, hooks, or shell commands.

The specification explicitly requests architecture review before broad production implementation (§41). The decisions remain proposed until that review. No approval of the architecture is implied by creating this repository.

## Start here

- [Architecture and repository map](docs/ARCHITECTURE.md)
- [Architecture Decision Records](docs/adr/README.md)
- [Agent execution state machine](docs/AGENT-LOOP.md)
- [Host ↔ Webview protocol](docs/PROTOCOL.md)
- [Context budget and compaction](docs/CONTEXT.md)
- [Tool, permission, hook and guardrail contracts](docs/TOOLS-AND-POLICY.md)
- [Testing and milestone acceptance](docs/TESTING.md)
- [Risks and architecture review checklist](docs/REVIEW.md)
- [Original product specification](docs/SPECIFICATION.md)

## Check the architecture scaffold

Use Node.js 24 and npm 11. No Ollama process, local model, VS Code installation, or cloud account is required to run the checks.

```sh
npm ci
npm run check
```

The checks typecheck the contracts, compile Core separately without Node/browser types, lint, check formatting, and test dependency direction, code organization and protocol types. They do not claim to test runtime behavior that has not been implemented.

## Planned local runtime

VS Code → Kova → Ollama → `qwen3:4b`. Defaults: 8,192 context tokens, 1,024 output tokens, thinking disabled, 5-minute model keep-alive, Manual mode. Existing installed models are discovered; Kova does not download models. The Core will remain independent of Ollama and VS Code.

Four modes: Plan (read only), Manual (approve state changes), Edit (workspace edits allowed), Auto (allowed operations and exact allowlisted commands). Guardrails apply to every mode. Built-in tools: `read_file`, `list_directory`, `search_files`, `get_git_diff`, `write_file`, `edit_file`, `run_command`.

## Accepted v1 risks

Use Kova only in projects you trust. The planned product deliberately has **no workspace-trust prompt**: opening a workspace can start commands from `.kova/mcp.json`; hooks execute configured commands at tool lifecycle points. Commands will be visible in the UI and Output channel. Agent writes to executable configuration require explicit approval in every mode. This behavior is a specification decision, not an implemented feature of this scaffold.

Command classification is heuristic, not a sandbox. MCP servers and hooks are local programs with the user's operating-system privileges. File containment protects built-in tools; it cannot sandbox those programs. Editor undo and Git provide rollback; v1 has no checkpoint system. Small-model tool selection and token estimates remain fallible. See [ADR 008](docs/adr/008-accepted-risks.md).

The package name, Marketplace identity and logo still need availability checks before publication. No Marketplace publishing or licensing decision is made in this phase.
