import { readdir } from 'node:fs/promises';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { SkillRepository } from '../../../core/src/skills/SkillRepository.js';
import type { SkillMetadata } from '../../../core/src/skills/Skill.js';
import { SkillLoader } from '../../../core/src/skills/SkillLoader.js';
import { BoundedTextFile } from '../adapters/BoundedTextFile.js';
import { NodeWorkspacePathGuard } from '../adapters/NodeWorkspacePathGuard.js';

export class WorkspaceSkillRepository implements SkillRepository {
  private readonly guard: NodeWorkspacePathGuard;
  constructor(
    private readonly root: string,
    private readonly diagnostic: (message: string) => void = () => {},
  ) {
    this.guard = new NodeWorkspacePathGuard(root);
  }
  async read(_workspaceId: string, id: string, cancellation: CancellationToken): Promise<string> {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error('Invalid skill ID.');
    const path = await this.guard.resolve(
      this.root,
      `.kova/skills/${id}/SKILL.md`,
      'Read',
      cancellation,
    );
    const { content: body } = await new BoundedTextFile().read(
      path.canonicalPath,
      cancellation,
      32_000,
    );
    cancellation.throwIfCancellationRequested();
    return body;
  }
  async discover(
    _workspaceId: string,
    cancellation: CancellationToken,
  ): Promise<readonly SkillMetadata[]> {
    const result: SkillMetadata[] = [];
    let directory: string;
    try {
      directory = (await this.guard.resolve(this.root, '.kova/skills', 'Read', cancellation))
        .canonicalPath;
    } catch {
      return [];
    }
    for (const entry of (await readdir(directory, { withFileTypes: true })).slice(0, 100)) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      try {
        result.push(
          new SkillLoader(this).metadata(
            entry.name,
            await this.read(this.root, entry.name, cancellation),
          ),
        );
      } catch (error) {
        cancellation.throwIfCancellationRequested();
        this.diagnostic(
          `Skill ${entry.name.slice(0, 64)}: ${error instanceof Error ? error.message : 'Invalid skill.'}`,
        );
      }
    }
    return result;
  }
}
