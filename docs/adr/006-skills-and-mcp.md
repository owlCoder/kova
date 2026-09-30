# ADR 006: Selected skills and stdio MCP tools

Status: **Accepted with review changes, 2026-09-30**

## Context

Skills are procedural context, while MCP exposes executable tools. Small models cannot afford every skill body and arbitrarily many tool definitions in every request.

## Decision

Discover bounded metadata only in `.kova/skills/*/SKILL.md`. Explicit user selection loads one skill body; no implicit keyword execution, additional compatibility directories or executable frontmatter. Skills are not tools. Reject duplicate IDs/invalid metadata/outside-root symlinks.

Read `.kova/mcp.json`, start only stdio servers, discover tools and adapt each to `Tool`. Use namespaced deterministic names, reject collisions, cap discovery and count schemas against context. Use the maintained split v2 TypeScript MCP client package (`@modelcontextprotocol/client`) in the adapter milestone; no SDK types cross into Core.

Remote risk annotations are untrusted hints. Default MCP risk is ProcessExecution; an optional local `toolRisks` mapping in the protected config can explicitly designate reviewed read-only tools. No unannotated remote tool is exposed in Plan. Server command/argv are emitted visibly when started. Stop unregisters its tools and terminates resources. No HTTP/SSE transport, prompts/resources browser, downloads or remote-execution feature in v1.

## Consequences

Some read-only MCP tools need local risk configuration to be usable in Plan. That conservative extension avoids treating an untrusted remote annotation as policy authority. Local MCP servers can themselves access the network or files outside the workspace; Kova's built-in path guard does not sandbox them. See [integrations](../INTEGRATIONS.md).

References: [official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [MCP tool definitions and annotation trust](https://modelcontextprotocol.io/specification/2026-07-28/server/tools).
