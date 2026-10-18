/** Editable starting points. Inserting a template never sends it or changes the agent mode. */
export const promptTemplates = [
  {
    id: 'explore',
    icon: 'code',
    title: 'Explore the code',
    description: 'Understand how it fits together',
    text: 'Explore this project and explain its architecture. Read the relevant files before answering.',
  },
  {
    id: 'review',
    icon: 'review',
    title: 'Review changes',
    description: 'Find what needs a closer look',
    text: 'Review the current Git diff for bugs, regressions and missing tests. Report concrete findings with file references.',
  },
  {
    id: 'plan',
    icon: 'plan',
    title: 'Plan something new',
    description: 'Turn an idea into a clear next step',
    text: 'Help me plan a change. Ask what I want to build, inspect the relevant code, then outline a practical implementation.',
  },
  {
    id: 'test',
    icon: 'test',
    title: 'Strengthen tests',
    description: 'Cover behavior that matters',
    text: 'Inspect the existing tests and identify important behavior that is not covered. Propose focused regression tests and explain how to run them.',
  },
  {
    id: 'performance',
    icon: 'zap',
    title: 'Find bottlenecks',
    description: 'Measure before making changes',
    text: 'Inspect this project for performance bottlenecks. Explain the evidence, suggest a measurement plan, and prioritize improvements by likely impact.',
  },
  {
    id: 'docs',
    icon: 'file',
    title: 'Improve documentation',
    description: 'Make the next step easier to follow',
    text: 'Read the README and relevant code. Identify missing setup steps, outdated examples and unclear explanations, then propose concrete documentation improvements.',
  },
] as const;
