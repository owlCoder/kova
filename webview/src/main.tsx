import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { WorkspaceErrorBoundary } from './components/WorkspaceErrorBoundary.js';
import './index.css';
import './styles/workbench.css';
import './styles/controls.css';
import './styles/finish.css';
import './styles/session-tools.css';

const root = document.getElementById('root');
if (root)
  createRoot(root).render(
    <WorkspaceErrorBoundary>
      <App />
    </WorkspaceErrorBoundary>,
  );
