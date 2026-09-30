import type { CancellationToken } from '../common/CancellationToken.js';
import type { SkillMetadata } from './Skill.js';

export interface SkillRepository {
  discover(workspaceId: string, cancellation: CancellationToken): Promise<readonly SkillMetadata[]>;
  read(workspaceId: string, skillId: string, cancellation: CancellationToken): Promise<string>;
}
