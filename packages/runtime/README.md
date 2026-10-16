# @kova/runtime

Portable Node adapters, workspace tools, provider transports/presets, skills, project rules, MCP/hooks and presentation projection shared by Electron and VS Code. Imports Core contracts and adapter packages; it cannot import either host or React. `NodeWorkspaceRuntime` accepts reader/writer ports so VS Code can retain editor semantics while desktop uses atomic filesystem writes.
