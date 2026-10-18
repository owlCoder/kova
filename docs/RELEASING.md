# Releasing Kova

A release uses successful main-branch CI runs at one exact source commit. The **Prepare release** workflow transfers the installers directly from Actions artifacts to a GitHub draft, generates checksums and verifies every uploaded digest. It does not publish the release or upload to the VS Code Marketplace; see [MARKETPLACE.md](MARKETPLACE.md) for that separate process.

## Prepare the source

1. Finish implementation and the applicable native UI checks in [TESTING.md](TESTING.md), then choose a stable version.
2. Update the root and desktop `package.json`, `packages/vscode/extension.package.json`, the root/desktop versions in `package-lock.json`, and current download examples in the documentation.
3. Add that version's section to `CHANGELOG.md`. Keep the changes concrete and include meaningful limitations.
4. Run `npm ci` and `npm run check`, package/verify the VSIX and desktop, and exercise the installed interfaces with a local fixture provider. `node scripts/desktop/smoke.mjs --history` seeds a long conversation for history/search checks.
5. Commit and push to `main`. Wait for **Kova checks** and every **Desktop builds** job to succeed at that commit. If a path filter did not start the desktop workflow, dispatch `desktop.yml` manually against `main` and confirm its source SHA matches.

Current targets are ARM64 macOS, x64 Windows and x64 Linux. Desktop packages remain unsigned and not notarized; updates are manual. New native target architectures must be added explicitly to the asset plan.

## Assemble the draft

Use **Actions → Prepare release → Run workflow**, select `main`, and supply the full source SHA and the two successful run IDs. With GitHub CLI, replace the uppercase values:

```sh
gh workflow run release.yml --ref main \
  -f commit=FULL_COMMIT_SHA \
  -f checks_run=CHECKS_RUN_ID \
  -f desktop_run=DESKTOP_RUN_ID
```

The workflow runs trusted code from the dispatched main ref. It checks source ancestry, workflow identities, source SHA, repository identity, trusted event, main branch and successful completion before downloading packages. It never checks out or executes code from an input commit or an artifact. Inputs are passed through environment variables and validated before CLI use. Only the draft job receives repository-content write permission; no personal access token is required. These choices follow [GitHub's workflow security guidance](https://docs.github.com/en/actions/reference/security/secure-use).

The root, desktop and extension manifest versions must match. The workflow normalizes Linux filenames, rejects unexpected files and checks the packaged VSIX version. It creates `SHA256SUMS`, uploads six packages plus the checksum file, and compares uploaded sizes and SHA-256 digests with the local build artifacts.

A rerun can finish an incomplete draft when its commit and existing assets match exactly. It refuses to overwrite a published release, a draft from another commit, unexpected assets or a conflicting uploaded file. It accepts main-branch pushes and explicit desktop rebuilds dispatched on main. It refuses artifacts from PRs, forks, failed runs or another workflow. Concurrency serializes preparation for each source commit.

## Review and publish

Review the workflow summary and draft on GitHub. Check that the release notes describe the final behavior and include relevant native UI verification. Confirm all seven assets are present, the tag target is the tested commit, and the draft job verified their hashes. Download/install a platform package when a packaging change needs a native regression check.

Publish through GitHub's draft UI, or with `gh release edit vVERSION --draft=false --latest` after replacing `VERSION`. This is a separate action from draft preparation. Then confirm the public download links, latest-release pointer and tag target. Do not move an existing published tag; release fixes under a new version.

## Integrity and boundaries

`SHA256SUMS` verifies file integrity. It does not replace publisher signing or macOS notarization. The release job assembles artifacts; it does not certify paid AI providers or replace manual interactive testing on each operating system. Packages include dependency license notices. Marketplace publication and automatic app updates remain separate work.
