import type { RiskLevel } from '../permissions/RiskLevel.js';

export interface McpServerConfiguration {
  readonly transport: 'stdio';
  readonly command: string;
  readonly args: readonly string[];
  /** Local operator override; remote annotations alone cannot reduce risk. */
  readonly toolRisks?: Readonly<Record<string, RiskLevel>>;
}

export interface McpConfiguration {
  readonly servers: Readonly<Record<string, McpServerConfiguration>>;
}
