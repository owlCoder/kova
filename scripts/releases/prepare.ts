import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdtemp, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertReleaseInput,
  assertTrustedRun,
  releaseAssets,
  releaseNotes,
  type ReleaseRun,
} from './releasePlan.ts';

type Release = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  target_commitish: string;
  assets: { name: string; size: number; state: string; digest: string | null }[];
};

const execute = promisify(execFile);
const repository = process.env.GITHUB_REPOSITORY ?? '';
const commit = process.env.KOVA_RELEASE_COMMIT ?? '';
const checks = process.env.KOVA_CHECKS_RUN ?? '';
const desktop = process.env.KOVA_DESKTOP_RUN ?? '';
assertReleaseInput(repository, commit, [checks, desktop]);
if (process.env.GITHUB_REF !== 'refs/heads/main')
  throw new Error('Dispatch this workflow from main.');

const gh = async (...args: string[]) =>
  (await execute('gh', args, { maxBuffer: 1_000_000 })).stdout.trim();
const api = async <T>(path: string): Promise<T> =>
  JSON.parse(await gh('api', `repos/${repository}/${path}`));
const source = async (path: string) => (await execute('git', ['show', `${commit}:${path}`])).stdout;
// Run only this checked-out workflow's trusted code; never execute code from an input commit.
await execute('git', ['merge-base', '--is-ancestor', commit, 'origin/main']);
const [checkRun, desktopRun] = await Promise.all([
  api<ReleaseRun>(`actions/runs/${checks}`),
  api<ReleaseRun>(`actions/runs/${desktop}`),
]);
assertTrustedRun(checkRun, repository, commit, 'ci');
assertTrustedRun(desktopRun, repository, commit, 'desktop');
const manifests = await Promise.all(
  ['package.json', 'packages/desktop/package.json', 'packages/vscode/extension.package.json'].map(
    async (path) => JSON.parse(await source(path)),
  ),
);
const version = String(manifests[0].version);
if (manifests.some((item) => item.version !== version))
  throw new Error('Release manifest versions must match.');
const expected = releaseAssets(version);
const tag = `v${version}`;
const findRelease = async (): Promise<Release | undefined> => {
  try {
    const { databaseId } = JSON.parse(
      await gh('release', 'view', tag, '--repo', repository, '--json', 'databaseId'),
    );
    if (!Number.isSafeInteger(databaseId)) throw new Error('Invalid release identity.');
    return api<Release>(`releases/${databaseId}`);
  } catch (error) {
    if (!(error instanceof Error) || !/release not found|HTTP 404/i.test(error.message))
      throw error;
    return undefined;
  }
};
let existingRelease = await findRelease();
if (
  existingRelease &&
  (existingRelease.tag_name !== tag ||
    !existingRelease.draft ||
    existingRelease.target_commitish !== commit ||
    existingRelease.prerelease)
)
  throw new Error('Refusing to modify a published release or a draft from another commit.');
const directory = await mkdtemp(join(tmpdir(), 'kova-release-'));
const notesPath = join(directory, 'release-notes.md');
const packages = join(directory, 'packages');
await Promise.all(
  [
    [checks, 'kova-vsix'],
    [desktop, 'kova-desktop-macOS'],
    [desktop, 'kova-desktop-Windows'],
    [desktop, 'kova-desktop-Linux'],
  ].map(([run, name]) =>
    gh('run', 'download', run!, '--repo', repository, '-n', name!, '-D', packages),
  ),
);
for (const [original, name] of [
  [`Kova-${version}-linux-x86_64.AppImage`, `Kova-${version}-linux-x64.AppImage`],
  [`Kova-${version}-linux-amd64.deb`, `Kova-${version}-linux-x64.deb`],
]) {
  const names = await readdir(packages);
  if (names.includes(original!) && names.includes(name!))
    throw new Error('Conflicting Linux release filenames.');
  if (names.includes(original!)) await rename(join(packages, original!), join(packages, name!));
}
const actual = (await readdir(packages)).sort();
if (JSON.stringify(actual) !== JSON.stringify([...expected].sort()))
  throw new Error('Unexpected or missing release files.');
const extension = JSON.parse(
  (
    await execute('unzip', [
      '-p',
      join(packages, `kova-local-${version}.vsix`),
      'extension/package.json',
    ])
  ).stdout,
);
if (extension.version !== version) throw new Error('VSIX version does not match the source.');
const hash = async (path: string) => {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
};
const digests = new Map<string, string>();
for (const name of expected) digests.set(name, await hash(join(packages, name)));
await writeFile(
  join(packages, 'SHA256SUMS'),
  expected.map((name) => `${digests.get(name)}  ${name}\n`).join(''),
);
digests.set('SHA256SUMS', await hash(join(packages, 'SHA256SUMS')));
await writeFile(
  notesPath,
  releaseNotes(version, await source('CHANGELOG.md'), repository, commit, checks, desktop),
);
if (!existingRelease) {
  await gh(
    'release',
    'create',
    tag,
    '--repo',
    repository,
    '--draft',
    '--target',
    commit,
    '--title',
    `Kova ${version}`,
    '--notes-file',
    notesPath,
  );
  existingRelease = await findRelease();
}
if (!existingRelease) throw new Error('Created draft could not be located.');
const release = existingRelease;
if (release.assets.some((asset) => !digests.has(asset.name)))
  throw new Error('Unexpected existing draft assets.');
for (const [name, digest] of digests) {
  const size = (await stat(join(packages, name))).size;
  const existing = release.assets.find((asset: { name: string }) => asset.name === name);
  if (
    existing &&
    (existing.state !== 'uploaded' ||
      existing.size !== size ||
      existing.digest !== `sha256:${digest}`)
  )
    throw new Error(`Existing draft asset does not match: ${name}`);
}
const missing = [...digests.keys()].filter(
  (name) => !release.assets.some((asset: { name: string }) => asset.name === name),
);
if (missing.length)
  await gh(
    'release',
    'upload',
    tag,
    '--repo',
    repository,
    ...missing.map((name) => join(packages, name)),
  );
const uploaded = await findRelease();
if (
  !uploaded ||
  uploaded.tag_name !== tag ||
  !uploaded.draft ||
  uploaded.target_commitish !== commit ||
  uploaded.assets.length !== digests.size
)
  throw new Error('Draft identity or asset count changed during upload.');
for (const [name, digest] of digests) {
  const asset = uploaded.assets.find((asset) => asset.name === name);
  if (
    !asset ||
    asset.state !== 'uploaded' ||
    asset.size !== (await stat(join(packages, name))).size ||
    asset.digest !== `sha256:${digest}`
  )
    throw new Error(`Uploaded asset does not match: ${name}`);
  console.log(`PASS uploaded size and SHA-256: ${name}`);
}
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## Kova ${version} draft ready\n\nSeven assets verified against source commit \`${commit}\`.\n\n[Review the draft](https://github.com/${repository}/releases). Publish after the native UI review.\n`,
  );
console.log(`Draft ${tag} is ready. Publishing is a separate action.`);
