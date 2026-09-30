import type { CancellationToken } from '../common/CancellationToken.js';
import type { Skill, SkillMetadata } from './Skill.js';
import type { SkillRepository } from './SkillRepository.js';

export class SkillLoader {
  constructor(private readonly repository: SkillRepository) {}
  metadata(id: string, raw: string): SkillMetadata {
    if (raw.length > 16_000 || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))
      throw new Error('Invalid skill ID or oversized skill.');
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
    if (!frontmatter) throw new Error('Skill requires YAML frontmatter.');
    const fields: Record<string, string> = {};
    for (const line of (frontmatter[1] ?? '').split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const pair = /^(name|description):\s*(.+)$/.exec(line);
      if (!pair || fields[pair[1] ?? ''])
        throw new Error('Skill supports unique name/description text fields only.');
      const value = pair[2] ?? '';
      if (/^[!&*]/.test(value)) throw new Error('Skill frontmatter supports plain text only.');
      fields[pair[1] ?? ''] = value.startsWith('"')
        ? (JSON.parse(value) as string)
        : value.startsWith("'") && value.endsWith("'")
          ? value.slice(1, -1).replaceAll("''", "'")
          : value;
    }
    if (
      fields.name !== id ||
      typeof fields.description !== 'string' ||
      !fields.description.trim() ||
      fields.description.length > 500
    )
      throw new Error('Skill name must match its folder and description must be a short string.');
    return {
      id,
      name: id,
      description: fields.description,
      relativePath: `.kova/skills/${id}/SKILL.md`,
    };
  }
  async load(
    workspaceId: string,
    skillId: string,
    cancellation: CancellationToken,
  ): Promise<Skill> {
    const raw = await this.repository.read(workspaceId, skillId, cancellation);
    const metadata = this.metadata(skillId, raw);
    return {
      metadata,
      instructions: raw.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim(),
    };
  }
}
