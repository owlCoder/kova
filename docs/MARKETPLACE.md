# Release and Marketplace

Extension: `owlcoder.kova-local`, version `0.2.0`, MIT. The package name is `kova-local` because `kova` was rejected as already registered in the Marketplace. The displayed product name remains Kova. Chat opens in the sidebar by default, with an optional movable editor tab. The color logo is used for the package icon and Webview. The Activity Bar uses an SVG luminance mask of the supplied monochrome logo, allowing its color to follow the theme. Both supplied PNG logos are included unchanged.

The VSIX is prepared for distribution and has not been published to the Marketplace. Repository visibility and Marketplace publication are separate operations.

## Build and verify

```sh
npm ci
npm run check
npm run package
npm run verify:package
npm run smoke:vsix
```

The package is written to `dist/kova-local-0.2.0.vsix`. Build, verification and smoke scripts derive this filename from `packages/vscode/extension.package.json`. Packaging removes older archives with the same package name from `dist`; the production extension directory is rebuilt from scratch.

For local installations, uninstall the previous development extension `owlcoder.kova` before installing `owlcoder.kova-local`. They use the same commands and view IDs and must not run together. Existing `kova.*` settings and workspace `.kova` configuration continue to apply.

The verifier checks the manifest, sidebar and editor commands, original logo hashes, bundled runtime, license notices and absence of development files. CI runs deterministic checks, builds the VSIX and uploads it as an artifact. Local smoke checks require installed VS Code and Ollama.

## Publish

Confirm that the Marketplace account has access to publisher `owlcoder`, then upload the reviewed VSIX through the [publisher management portal](https://marketplace.visualstudio.com/manage). Credentials do not belong in the repository or chat. Automatic publication is not configured.

Native integration is verified on macOS. Run native Windows/Linux checks before claiming support there. Known limitations are recorded in [implementation evidence](IMPLEMENTATION.md) and [accepted risks](adr/008-accepted-risks.md).

References: [publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension), [extension manifest](https://code.visualstudio.com/api/references/extension-manifest), [Webview panels](https://code.visualstudio.com/api/extension-guides/webview).
