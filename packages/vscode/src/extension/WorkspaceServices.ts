import type { WorkspaceRuntime } from '../adapters/WorkspaceRuntime.js';
import type { WorkspaceSkillRepository } from '../../../runtime/src/skills/WorkspaceSkillRepository.js';
import type { WorkspaceProjectInstructions } from '../../../runtime/src/adapters/WorkspaceProjectInstructions.js';

export interface WorkspaceServices {
  readonly runtime: WorkspaceRuntime;
  readonly skills: WorkspaceSkillRepository;
  readonly instructions: WorkspaceProjectInstructions;
}
