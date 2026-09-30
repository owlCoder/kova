# Skills, MCP and hooks

Status: **Implemented**. Configured commands execute as documented; use only trusted projects.

## Skills

Discover only `.kova/skills/*/SKILL.md`. Bound metadata scanning to that directory and validate realpaths. Frontmatter requires a stable name matching the directory ID and a short description; no duplicate IDs, executable YAML tags or unknown executable properties. The per-skill body cap is 16,000 characters and discovery cap is 100 entries. Invalid/oversized entries produce visible diagnostics and remain inactive.

```md
---
name: review-pull-request
description: Review a change against requirements, architecture and tests.
---

# Review Pull Request

Inspect the current Git diff. Check requirements, dependency direction and tests.
Report concrete findings with file paths and reasons. Ask before state-changing work.
```

Repository discovers metadata; SkillLoader loads one selected body into context and emits SkillLoaded. Skill selection is explicit in v1. A skill is procedural context and cannot alter permissions, execute a hook, change protected config or approve a tool. No `.claude`, `.agents` or `.ai` compatibility sources initially.

## Stdio MCP

Canonical `.kova/mcp.json`:

```json
{
  "servers": {
    "ers": {
      "transport": "stdio",
      "command": "dotnet",
      "args": [
        "run",
        "--project",
        "src/EquipmentReservation.Mcp",
        "--configuration",
        "Release",
        "--no-build"
      ],
      "toolRisks": {
        "get_project_structure": "ReadOnly",
        "get_git_diff": "ReadOnly",
        "run_unit_tests": "ProcessExecution"
      }
    }
  }
}
```

`toolRisks` is an optional local operator-reviewed extension to the specification example; without it, risk defaults to ProcessExecution. Remote annotations alone cannot designate a read-only tool. For a reviewed test tool, Manual/Edit/Auto still require approval unless a future explicit process policy is added; v1 command allowlisting applies to run_command, not arbitrary MCP behavior.

Validate config: only stdio, nonempty command, string argv, at most 8 servers, safe unique config IDs, bounded config/schema data. Run from the selected root with shell disabled for server startup. No explicit inline environment-secret configuration in v1. Command/argv are visible. Use MCP SDK handshake, pagination, list discovery and call normalization in the adapter. Naming is a deterministic encoded tuple of configured server ID + remote tool name, mapped to a short provider-safe name; keep the reverse mapping and reject any collision/overlong schema. Do not rely on serverInfo.name for uniqueness.

Expose at most 64 discovered tools across the session. Count schemas against context; a budget overflow identifies the offending configured tool/server and requires fewer enabled tools or more budget, rather than silently dropping pinned definitions. A failed server emits a lifecycle error and does not prevent built-in chat/tools. Register tools only after successful initialization/discovery. Remove tools on disconnect; use a captured per-run registry view to avoid name races, with disconnected calls returning structured errors. Support tool-list refresh between runs, without injecting new definitions midway through a run.

McpClient returns `Tool` adapters. `prepare` does not call remote tools. `execute` invokes tools/call only after normal risk/policy/hooks/guardrails/approval. Tool content becomes bounded untrusted text/JSON data; unsupported image/resource/input-required payloads return a structured unsupported-result diagnostic, no browser/auth flow. Cancellation/timeout never replays calls automatically because side effects may have happened. Stop closes transports/processes and emits McpServerStopped. No HTTP/SSE or remote MCP support in v1.

The pinned SDK dependency is @modelcontextprotocol/client 2.2.0, isolated behind the adapter. Its wire behavior is verified against a real-process legacy fixture and the actual .NET ERS server. Reference: [official SDK](https://github.com/modelcontextprotocol/typescript-sdk), [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools).

## Command hooks

Canonical `.kova/hooks.json`:

```json
{
  "BeforeToolExecution": [
    {
      "id": "audit-before",
      "command": "node",
      "args": ["scripts/kova-audit.mjs"],
      "timeoutMs": 5000
    }
  ],
  "AfterToolExecution": []
}
```

CommandHook runs through ProcessRunner outside run_command policy, as user-configured code. Use executable + argv, active-root cwd and shell disabled. Maximum 20 hooks/event, default timeout 5 seconds, maximum 30 seconds, bounded stdin/output. JSON stdin contains lifecycle, tool name/ID, normalized relative path labels, risk and bounded status metadata; omit full file contents, previews, environment secrets and unrestricted argument/output dumps. Tool arguments passed to hooks are observational sanitized data only, never accepted back as replacement input.

Exit 0 with JSON stdout `{ "decision": "continue" | "veto", "message"?: string }` reports observation or veto. Any nonzero exit, timeout, crash or invalid JSON/output fails a pre-hook closed. A post-hook failure or veto is shown and logged but never changes the execution result. Every configured hook requires a positive timeout (maximum 30 seconds). Stdout never expresses approval or new tool arguments. A hook can run arbitrary local code itself, an explicitly accepted trust risk; it is not executed through run_command or recursively through the tool loop.

At each idle run start compare hashes of both config files, reload changed hooks and only changed MCP servers, and show configuration reloaded; approved agent edits to config do not silently start new processes during the editing run. No extra workspace trust prompt is added. UI shows executable/argv, bounded reason/status and duration for every hook run. Output logs executable/argv, hook ID, outcome and duration; it excludes hook reason text, raw stdin, process output and secret file contents.

## ERS teaching example

The actual ERS integration is documented in [the teaching walkthrough](../examples/ers/README.md). Its get_project_structure/get_git_diff tools are reviewed ReadOnly, run_unit_tests remains approval-gated, and ErsGuardrailAdapter calls the original .NET guardrail executable. Canonical configs and the review skill are installed in the supplied nested ERS example.
