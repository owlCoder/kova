import type { CancellationToken } from '../common/CancellationToken.js';
import type { Skill } from './Skill.js';

export interface SkillLoader {
  load(workspaceId: string, skillId: string, cancellation: CancellationToken): Promise<Skill>;
}
