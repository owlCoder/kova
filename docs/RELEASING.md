# GitHub releases

Kova publishes native desktop installers and a VS Code VSIX through [GitHub Releases](https://github.com/owlCoder/kova/releases). Marketplace publication is a separate, manual process described in [MARKETPLACE.md](MARKETPLACE.md). There is no automatic updater or release-publishing workflow.

## Prepare a version

1. Update the root package, desktop package and extension manifest versions together. Regenerate the lockfile with npm 11 if the package metadata changes.
2. Update `CHANGELOG.md`, README asset names and versioned installation examples. Keep package architecture, signing status and verification limits accurate.
3. Run `npm ci` and `npm run check`. Build and verify both hosts. Perform the applicable native smoke checks in [TESTING.md](TESTING.md); do not describe an installer build as manual UI verification.
4. Commit and push the exact source to release. Confirm the **Kova checks** workflow succeeds for that commit and produces `kova-vsix`.
5. Confirm **Desktop builds** succeeds for the same commit on all three runners. If only documentation changed and the path filter did not start it, dispatch `desktop.yml` manually against the intended ref.

## Collect artifacts

Download artifacts from the verified workflow runs using `gh run download <run-id>`. The artifact names are `kova-vsix`, `kova-desktop-macOS`, `kova-desktop-Windows` and `kova-desktop-Linux`. Check the run's `headSha` against the intended release commit.

Include only the intended version's DMG, ZIP, EXE, AppImage, DEB and VSIX. The current runner matrix produces macOS arm64, Windows x64 and Linux x64. Put the six files in one clean release directory and generate `SHA256SUMS` over their exact bytes, using bare asset filenames. On macOS, for example:

```sh
shasum -a 256 Kova-* kova-local-*.vsix > SHA256SUMS
shasum -a 256 -c SHA256SUMS
```

Do not reuse a checksum file or package from another build. Keep native dependency notices in the packaged distributions. Desktop packages currently have no signing/notarization credentials; disclose this in the release notes.

## Publish and verify

Write release notes describing the shipped behavior, installation choices, checks performed and material limitations. Create a draft release with `gh release create`, targeting the verified commit and using `--notes-file` for the body. Upload all six packages and `SHA256SUMS`.

Before publishing, verify the tag target, asset names, sizes and hashes. Then publish the draft and mark it as latest. Check that the public release is not a draft or prerelease, its downloads are available, and the README's latest-release link resolves correctly. Avoid moving a published tag or replacing assets silently; publish a new version for subsequent code changes.
