# Release and Marketplace

Extension: `owlcoder.kova-local`, version `0.3.1`, MIT. The package name remains `kova-local` because `kova` was already registered in the Marketplace. The displayed product name is **Kova — Local-first AI Coding Agent**.

Kova is local-first rather than Ollama-only. Marketplace copy must make the provider boundary explicit:

- Ollama remains the default and requires no account or API key; the default demo model is `qwen3:4b`.
- DeepSeek is optional and uses an API key stored in VS Code `SecretStorage`.
- OpenAI-compatible endpoints are optional and may use a bearer key or run locally without authentication.
- Selecting an API provider sends the request context needed by that run to the endpoint configured by the user. Kova does not silently switch away from Ollama.

The package icon uses the color logo. The Activity Bar uses the SVG luminance mask generated from the supplied monochrome logo so it follows the active VS Code theme.

## Marketplace metadata

The canonical Marketplace manifest is `packages/vscode/extension.package.json`.

- Identifier: `owlcoder.kova-local`
- Version: `0.3.1`
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

The package is written to `dist/kova-local-0.3.1.vsix`. Build, verification and smoke scripts derive the name/version from `packages/vscode/extension.package.json`. Packaging removes older archives with the same package name from `dist`, and the production extension directory is rebuilt from scratch.

The verifier checks required package files, manifest identity, provider settings, API-key commands, the absence of plaintext API-key settings, bundled runtime, logo integrity, license notices and the absence of development/secret files.

For local installations, uninstall the previous development extension `owlcoder.kova` before installing `owlcoder.kova-local`. They use the same commands and view IDs and must not run together. Existing `kova.*` settings and workspace `.kova` configuration continue to apply.

## Publish manually

Marketplace publication is intentionally manual. After the release checks are green:

1. Confirm `packages/vscode/extension.package.json` has the intended version and `CHANGELOG.md` contains the matching entry.
2. Run `npm run package` and `npm run verify:package` from a clean checkout.
3. Optionally run `npm run smoke:vsix` on the release machine.
4. Open the Visual Studio Marketplace publisher management portal and select publisher `owlcoder`.
5. Upload `dist/kova-local-0.3.1.vsix`.
6. Confirm the Marketplace page shows the expected version, README, changelog, icon and provider metadata.

No `VSCE_PAT`, repository secret or automatic publish workflow is required for this release process.

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

References: [publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension), [extension manifest](https://code.visualstudio.com/api/references/extension-manifest).
