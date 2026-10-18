export interface ReleaseRun {
  readonly head_sha: string;
  readonly head_branch: string;
  readonly event: string;
  readonly path: string;
  readonly conclusion: string | null;
  readonly status: string;
  readonly repository: { readonly full_name: string };
  readonly head_repository: { readonly full_name: string } | null;
}

export function assertReleaseInput(
  repository: string,
  commit: string,
  runIds: readonly string[],
): void {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[\w.-]+$/.test(repository) ||
    !/^[a-f0-9]{40}$/.test(commit) ||
    runIds.length !== 2 ||
    runIds.some((id) => !/^\d+$/.test(id))
  )
    throw new Error('Use a repository, full commit SHA and two numeric workflow run IDs.');
}

export function assertTrustedRun(
  run: ReleaseRun,
  repository: string,
  commit: string,
  workflow: 'ci' | 'desktop',
): void {
  if (
    run.repository.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    run.head_sha !== commit ||
    run.head_branch !== 'main' ||
    !(run.event === 'push' || (workflow === 'desktop' && run.event === 'workflow_dispatch')) ||
    run.path !== `.github/workflows/${workflow}.yml` ||
    run.status !== 'completed' ||
    run.conclusion !== 'success'
  )
    throw new Error(
      `Release requires a successful trusted main-branch run of ${workflow}.yml at the exact commit.`,
    );
}

export function releaseAssets(version: string): readonly string[] {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Use a stable numeric release version.');
  return [
    `Kova-${version}-linux-x64.AppImage`,
    `Kova-${version}-linux-x64.deb`,
    `Kova-${version}-mac-arm64.dmg`,
    `Kova-${version}-mac-arm64.zip`,
    `Kova-${version}-win-x64.exe`,
    `kova-local-${version}.vsix`,
  ];
}

export function releaseNotes(
  version: string,
  changelog: string,
  repository: string,
  commit: string,
  checks: string,
  desktop: string,
): string {
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start < 0) throw new Error('Add the release version to CHANGELOG.md first.');
  const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  const changes = lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim();
  if (!changes) throw new Error('Release notes must describe the changes.');
  return (
    `Kova ${version}\n\n${changes}\n\n## Downloads\n\n` +
    releaseAssets(version)
      .map((name) => `- \`${name}\``)
      .join('\n') +
    `\n\n\`SHA256SUMS\` covers all six packages. Install the VSIX through **Extensions: Install from VSIX…**. ` +
    `Desktop updates are manual; desktop packages are unsigned and not notarized. macOS builds target Apple Silicon, Windows and Linux builds target x64.\n\n` +
    `## Verification\n\nBuilt from [\`${commit.slice(0, 7)}\`](https://github.com/${repository}/commit/${commit}) using ` +
    `[Kova checks](https://github.com/${repository}/actions/runs/${checks}) and ` +
    `[Desktop builds](https://github.com/${repository}/actions/runs/${desktop}). ` +
    `Both workflows must pass at this exact commit before draft creation. Uploaded asset sizes and SHA-256 digests are verified.\n\n` +
    `The Windows/Linux interactive UI still needs manual verification. Provider tests use local fixtures and do not certify paid APIs. ` +
    `Approved commands, terminal programs, hooks and MCP servers run with your user privileges, outside an OS sandbox.\n\n` +
    `[README](https://github.com/${repository}#readme) · [Changelog](https://github.com/${repository}/blob/v${version}/CHANGELOG.md)\n\nMIT licensed; dependency notices are included.\n`
  );
}
