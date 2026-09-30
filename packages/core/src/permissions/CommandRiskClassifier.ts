import type { CommandAssessment } from './CommandAssessment.js';

export interface CommandRiskClassifier {
  classify(command: string): CommandAssessment;
}
