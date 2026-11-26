const labels: Readonly<Record<string, string>> = {
  read_file: 'Read',
  write_file: 'Write',
  edit_file: 'Edit',
  list_directory: 'List',
  search_files: 'Search',
  run_command: 'Run',
  get_git_diff: 'Git diff',
  update_todos: 'Plan',
};

/** Short, verb-style tool names in the transcript; unknown tools keep their own name. */
export function toolLabel(name: string): string {
  if (labels[name]) return labels[name];
  const mcp = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(name);
  if (mcp) return `${mcp[1]} · ${mcp[2]}`;
  return name
    .split('_')
    .filter(Boolean)
    .map((part, index) => (index ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join(' ');
}
