import type { ContextBuildRequest } from './ContextBuildRequest.js';
import type { ContextBuildResult } from './ContextBuildResult.js';

export interface ContextBuilder {
  build(request: ContextBuildRequest): ContextBuildResult;
}
