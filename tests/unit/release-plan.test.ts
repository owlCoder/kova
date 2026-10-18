import { describe, expect, it } from 'vitest';
import {
  assertReleaseInput,
  assertTrustedRun,
  releaseAssets,
  releaseNotes,
} from '../../scripts/releases/releasePlan.js';
const repository = 'owlCoder/kova',
  commit = 'a'.repeat(40);
const run = {
  head_sha: commit,
  head_branch: 'main',
  event: 'push',
  path: '.github/workflows/ci.yml',
  conclusion: 'success',
  status: 'completed',
  repository: { full_name: repository },
  head_repository: { full_name: repository },
};
describe('verified release preparation', () => {
  it('accepts only numeric run IDs and full source identities', () => {
    expect(() => assertReleaseInput(repository, commit, ['12', '13'])).not.toThrow();
    for (const ids of [['12; echo injected', '13'], ['$(secret)', '13'], ['12']])
      expect(() => assertReleaseInput(repository, commit, ids)).toThrow();
    expect(() => assertReleaseInput('../other', commit, ['12', '13'])).toThrow();
    expect(() => assertReleaseInput(repository, 'main', ['12', '13'])).toThrow();
  });
  it('rejects PR/fork artifacts, failed builds, mismatched commits and different workflows', () => {
    expect(() => assertTrustedRun(run, repository, commit, 'ci')).not.toThrow();
    for (const patch of [
      { event: 'pull_request' },
      { head_branch: 'feature' },
      { conclusion: 'failure' },
      { head_sha: 'b'.repeat(40) },
      { path: '.github/workflows/other.yml' },
      { head_repository: { full_name: 'someone/fork' } },
      { repository: { full_name: 'someone/fork' } },
    ])
      expect(() => assertTrustedRun({ ...run, ...patch }, repository, commit, 'ci')).toThrow();
  });
  it('accepts a manual desktop rebuild on main while keeping CI checks restricted to pushes', () => {
    expect(() =>
      assertTrustedRun(
        { ...run, event: 'workflow_dispatch', path: '.github/workflows/desktop.yml' },
        repository,
        commit,
        'desktop',
      ),
    ).not.toThrow();
    expect(() =>
      assertTrustedRun({ ...run, event: 'workflow_dispatch' }, repository, commit, 'ci'),
    ).toThrow();
  });
  it('generates six stable packages and notes only from the selected changelog section', () => {
    expect(releaseAssets('0.8.0')).toHaveLength(6);
    expect(() => releaseAssets('../escape')).toThrow();
    const text = releaseNotes(
      '0.8.0',
      '# Changelog\n\n## 0.8.0\n\n- New context tools.\n\n## 0.7.0\n\n- Older change.',
      repository,
      commit,
      '12',
      '13',
    );
    expect(text).toContain('New context tools.');
    expect(text).not.toContain('Older change');
    expect(text).toContain('unsigned and not notarized');
    expect(text).toContain('/actions/runs/12');
    expect(() => releaseNotes('0.9.0', text, repository, commit, '12', '13')).toThrow('CHANGELOG');
  });
});
