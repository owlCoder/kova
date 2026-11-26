import { CancellationSource } from '../../../core/src/common/CancellationSource.js';
import type { SessionInitializerHooks } from './SessionInitializerHooks.js';

/**
 * Serializes one workspace initialization: builds the tool runtime for the
 * current root, discovers skills and refreshes models, at most once at a time.
 */
export class SessionInitializer {
  private task: Promise<void> | null = null;
  private cancellation: CancellationSource | null = null;
  constructor(private readonly hooks: SessionInitializerHooks) {}
  get pending(): Promise<void> | null {
    return this.task;
  }
  cancel(): void {
    this.cancellation?.cancel();
  }
  initialize(): Promise<void> {
    if (this.hooks.busy()) return Promise.resolve();
    if (this.task) return this.task;
    const cancellation = new CancellationSource();
    this.cancellation = cancellation;
    const task = this.run(cancellation);
    this.task = task;
    const clear = () => {
      if (this.task === task) {
        this.task = null;
        this.cancellation = null;
      }
    };
    void task.finally(clear).catch(() => {});
    return task;
  }
  private async run(source: CancellationSource): Promise<void> {
    const root = this.hooks.root();
    if (root && !this.hooks.hasRuntime()) {
      this.hooks.setServices(await this.hooks.createServices(root, source));
    }
    await this.hooks.initializeRuntime(source);
    const skills = root ? await this.hooks.discoverSkills(root, source) : [];
    this.hooks.setSkills(skills);
    await this.hooks.refreshModels();
  }
}
