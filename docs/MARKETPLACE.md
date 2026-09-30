# Release and Marketplace

Extension: `owlcoder.kova-local`, version `0.3.0`, MIT. The package name remains `kova-local` because `kova` was already registered in the Marketplace. The displayed product name is **Kova — Local-first AI Coding Agent**.

Kova is local-first rather than Ollama-only. Marketplace copy must make the provider boundary explicit:

- Ollama remains the default and requires no account or API key; the default demo model is `qwen3:4b`.
- DeepSeek is optional and uses an API key stored in VS Code `SecretStorage`.
- OpenAI-compatible endpoints are optional and may use a bearer key or run locally without authentication.
- Selecting an API provider sends the request context needed by that run to the endpoint configured by the user. Kova does not silently switch away from Ollama.

The package icon uses the color logo. The Activity Bar uses the SVG luminance mask generated from the supplied monochrome logo so it follows the active VS Code theme.

## Marketplace metadata

The canonical Marketplace manifest is `packages/vscode/extension.package.json`.

- Identifier: `owlcoder.kova-local`
- Version: `0.3.0`
- Display name: `Kova — Local-first AI Coding Agent`
- Categories: Machine Learning, Other
- Provider keywords: Ollama, Qwen/Qwen3, DeepSeek, OpenAI-compatible
- Repository/homepage/issues: the public `owlCoder/kova` repository

README and CHANGELOG are copied into the VSIX during the build and become the Marketplace long description and release history, so provider behavior and privacy wording must stay accurate there.

## Build and verify

```sh
npm ci
npm run check
npm run package
npm run verify:package
npm run smoke:vsix
```

The package is written to `dist/kova-local-0.3.0.vsix`. Build, verification and smoke scripts derive the name/version from `packages/vscode/extension.package.json`. Packaging removes older archives with the same package name from `dist`, and the production extension directory is rebuilt from scratch.

The verifier checks required package files, manifest identity, provider settings, API-key commands, the absence of plaintext API-key settings, bundled runtime, logo integrity, license notices and the absence of development/secret files.

For local installations, uninstall the previous development extension `owlcoder.kova` before installing `owlcoder.kova-local`. They use the same commands and view IDs and must not run together. Existing `kova.*` settings and workspace `.kova` configuration continue to apply.

## Publish from a workstation

A publish command builds and verifies a fresh archive before invoking `@vscode/vsce`:

```sh
VSCE_PAT=... npm run publish:vsix
```

`VSCE_PAT` is read from the process environment by `vsce`; do not pass it as a command-line argument, commit it, paste it into settings, or store it in a repository file.

The Marketplace account represented by the PAT must have permission to publish under `owlcoder`. The publish command uses the already-built VSIX through `vsce publish --packagePath`, so the reviewed archive is the archive that is uploaded.

## Publish from GitHub Actions

The repository contains `.github/workflows/publish.yml`. It is intentionally `workflow_dispatch` only: publishing never occurs on an ordinary push to `main`.

1. Add `VSCE_PAT` as an encrypted repository secret.
2. Confirm `packages/vscode/extension.package.json` has the intended new version and CHANGELOG entry.
3. Confirm the normal **Kova checks** workflow is green on `main`.
4. Manually run **Publish Marketplace extension**.
5. Confirm the Marketplace page shows the expected version, README, changelog, icon and provider metadata.

The workflow has read-only repository permissions. The PAT is exposed only to the publish step through the environment.

## Release checklist

Before publishing a new version:

- `npm run check` is green.
- `npm run package` and `npm run verify:package` are green.
- `npm run smoke:vsix` passes on a release machine.
- Ollama/Qwen3 local chat is checked.
- DeepSeek API-key setup and one streamed response are checked with a non-production key.
- Generic OpenAI-compatible behavior is checked against at least one compatible endpoint when that path changed.
- README provider/privacy wording matches the implementation.
- No API keys, `.env` files, workspace `.kova` data, source maps, tests or source trees are present in the VSIX.
- Native Windows/Linux checks are run before claiming those platforms as verified.

References: [publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension), [continuous integration and publishing](https://code.visualstudio.com/api/working-with-extensions/continuous-integration), [extension manifest](https://code.visualstudio.com/api/references/extension-manifest).
