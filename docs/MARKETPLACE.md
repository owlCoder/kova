# Marketplace release preparation

Release candidate: `owlcoder.kova`, version `0.1.0`, MIT. The publisher ID and license were supplied by the user. The color logo is the package icon and Webview branding; the monochrome logo is the Activity Bar icon. Original assets are preserved.

## Prepared

- Production README and setup copy, commands/settings descriptions, versioned changelog and MIT license.
- Marketplace manifest with category, keywords, banner, repository and publisher metadata.
- Reproducible bundled VSIX, package content validation, third-party license notices and isolated installation/activation checks.
- CI architecture/type/lint/format/behavior checks, production build and packaged VSIX artifact.
- Local model, native editor, real MCP/hook/guardrail and ERS acceptance evidence in IMPLEMENTATION.md.

## Before uploading

Verify that the signed-in Marketplace account owns publisher `owlcoder` and has publishing access. No credentials are stored in this repository or requested in chat. Use the publisher portal or secure automated identity setup from the official publishing guide.

The GitHub repository is currently private. Marketplace binary distribution can be prepared independently, but its repository link will require GitHub access until the owner makes it public. This task does not change repository visibility. The package README contains no images or documentation links that depend on that private repository.

Validate the release on Windows/Linux before claiming native support there. Review the known local-process and model limitations recorded in IMPLEMENTATION.md. Marketplace publisher/name availability and branding rights remain owner checks; this preparation makes no trademark claim.

## Build and inspect

```sh
npm ci
npm run check
npm run package
npm run verify:package
```

The VSIX is `dist/kova-0.1.0.vsix`. Inspect it and install it in a separate VS Code profile. This task prepares a package and does not publish it.

For manual release, upload the reviewed VSIX at the publisher management portal after the owner authorizes publication. A workflow for automatic publication is deliberately absent until publisher authentication and release authorization are configured.

References: [official publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension), [manifest](https://code.visualstudio.com/api/references/extension-manifest), [Activity Bar icons](https://code.visualstudio.com/api/references/contribution-points#contributes.viewsContainers).
