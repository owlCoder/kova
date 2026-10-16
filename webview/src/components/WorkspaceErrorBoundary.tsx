import { Component, type ReactNode } from 'react';
import { Icon } from './Icon.js';

export class WorkspaceErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="view-error">
        <Icon name="warning" size={30} />
        <h1>The workspace view needs a refresh.</h1>
        <p>Your conversation remains in the host. Reload the view to reconnect.</p>
        <button className="primary" onClick={() => window.location.reload()}>
          Reload workspace
        </button>
      </main>
    );
  }
}
