import type { RiskLevel } from './RiskLevel.js';

export interface CommandAssessment {
  readonly risk: RiskLevel;
  readonly originalCommand: string;
  readonly executable: string | null;
  readonly args: readonly string[];
  readonly containsShellSyntax: boolean;
  /** null if parsing is ambiguous or shell syntax occurs. Exact executable + argv match. */
  readonly allowlistKey: string | null;
  readonly reasons: readonly string[];
}
