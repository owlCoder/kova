import type { PreparedToolCall } from '../tools/PreparedToolCall.js';
import type { RiskLevel } from './RiskLevel.js';

export interface ToolRiskClassifier {
  classify(prepared: PreparedToolCall): RiskLevel;
}
