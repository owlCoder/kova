# Contributing to Kova

Thanks for helping improve Kova. Useful contributions include reproducible bug reports, focused fixes, documentation, translations, accessibility work and testing on native platforms.

## Before you start

Search [existing issues](https://github.com/owlCoder/kova/issues) before opening a report. For a substantial feature or architecture change, open an issue describing the problem and proposed behavior before investing in an implementation. Small fixes can go directly to a pull request. Keep discussion respectful, specific and focused on the work.

Report security vulnerabilities through [private reporting](SECURITY.md), not public issues. Remove API keys, private code, conversation content and personal paths from all reports and screenshots. Do not commit local profiles, credentials, `.env` files or generated installers.

## Development setup

1. Fork the repository and clone your fork.
2. Install **Node.js 24** and **npm 11**. The repository's `.nvmrc` selects Node 24.
3. Run `npm ci` from the repository root. Preserve the committed lockfile; dependency changes should be intentional.
4. Run `npm run check` before making changes to confirm your baseline.
5. Create a focused branch, then run `npm run desktop:dev` or press **F5** in VS Code to start the extension development host.

The integrated terminal uses a native dependency. Linux needs Python 3, `make` and a C/C++ compiler; macOS needs Xcode Command Line Tools if a source build is required. Windows source builds may require Visual Studio C++ Build Tools. Platform prebuilds are used when available.

No paid API account is needed for deterministic tests. Use Ollama for local model testing or the isolated synthetic desktop fixture for UI work. Never point a test at a private project without understanding its tools, hooks and MCP configuration.

## Changes and checks

`npm run check` runs TypeScript checks, ESLint, Prettier and Vitest. Use `npm run format` to apply formatting. Add or adjust behavioral tests for runtime changes, and include regression coverage for a reproduced bug when useful. Documentation-only changes do not need artificial tests.

For extension packaging:

```sh
npm run package
npm run verify:package
# Native, isolated VS Code installation check:
npm run smoke:vsix
```

For desktop changes:

```sh
npm run desktop:build
npm run desktop:verify
# Interactive fixture; follow the instructions and quit to verify:
npm run desktop:smoke
```

The smoke fixture uses a disposable profile/project and a local synthetic provider. It does not test a live cloud service. UI changes should be checked in dark and light themes, with keyboard navigation, larger text and all three interface languages. Terminal changes should be checked against a packaged app as well as development mode. See [testing](docs/TESTING.md) for the full acceptance criteria.

## Architecture and style

- Keep the dependency direction documented in [Architecture](docs/ARCHITECTURE.md). Core must stay independent of Node.js, Electron, VS Code, React and provider SDKs.
- Keep runtime TypeScript/TSX source files at or below 500 lines. Architecture checks also enforce at most one public behavioral class/interface per file; use focused modules.
- Keep host/interface messages in the data-only protocol. Validate IPC at the host boundary; do not expose filesystem, credentials or shell access directly to the renderer.
- Preserve cancellation, single-use approvals, protected paths and stale-write checks. Do not weaken a guardrail or architecture test to make a change pass.
- Keep translation catalogs aligned and use shared theme tokens. Avoid hardcoded desktop colors that break light mode or extension theme inheritance.
- Update relevant docs and the changelog for user-visible behavior. Avoid unrelated dependency upgrades and generated files in a feature patch.

## Pull requests

Describe the problem, the resulting behavior and the checks you ran. Include before/after screenshots for visual changes and say which OS, host and provider were tested. Call out limitations honestly; fixture coverage is different from a live provider or native UI check.

CI must pass before merge. Releases and Marketplace publication are maintainer tasks; do not include publishing credentials in a pull request. Contributions are made under the repository's [MIT License](LICENSE).
