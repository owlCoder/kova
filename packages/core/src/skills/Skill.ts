export interface SkillMetadata {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly relativePath: string;
}

export interface Skill {
  readonly metadata: SkillMetadata;
  readonly instructions: string;
}
