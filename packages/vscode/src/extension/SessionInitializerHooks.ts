import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { SkillMetadata } from '../../../core/src/skills/Skill.js';
import type { WorkspaceServices } from './WorkspaceServices.js';

export interface SessionInitializerHooks {
  readonly root: () => string | null;
  readonly busy: () => boolean;
  readonly disposed: () => boolean;
  readonly hasRuntime: () => boolean;
  readonly createServices: (
    root: string,
    cancellation: CancellationToken,
  ) => Promise<WorkspaceServices>;
  readonly setServices: (services: WorkspaceServices) => void;
  readonly initializeRuntime: (cancellation: CancellationToken) => Promise<void>;
  readonly discoverSkills: (
    root: string,
    cancellation: CancellationToken,
  ) => Promise<readonly SkillMetadata[]>;
  readonly setSkills: (skills: readonly SkillMetadata[]) => void;
  readonly refreshModels: () => Promise<void>;
}
