/**
 * Minimal unified-diff parser and applier for the apply_patch tool.
 * Strict: hunks must apply at their computed position without fuzz; any
 * mismatch throws and the file is left untouched.
 */

export interface ParsedHunk {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  /** Raw hunk lines including their prefix (' ', '-', '+') or a '\' marker line. */
  readonly lines: readonly string[];
}

export interface ParsedPatchFile {
  /** Target path from the +++ line; 'delete' when it is /dev/null. */
  readonly path: string | null;
  readonly sourcePath: string | null;
  readonly hunks: ParsedHunk[];
}

export const PATCH_LIMITS = {
  maxPatchCharacters: 256 * 1024,
  maxFiles: 20,
  maxHunks: 2000,
  maxLines: 20000,
} as const;

const stripPrefix = (raw: string): string | null => {
  if (raw === '/dev/null') return null;
  const value = raw.trim();
  return value.startsWith('a/') || value.startsWith('b/') ? value.slice(2) : value;
};

export function parseUnifiedPatch(patch: string): ParsedPatchFile[] {
  if (patch.length > PATCH_LIMITS.maxPatchCharacters)
    throw new Error(`Patch exceeds ${PATCH_LIMITS.maxPatchCharacters} characters`);
  const lines = patch.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length > PATCH_LIMITS.maxLines)
    throw new Error(`Patch exceeds ${PATCH_LIMITS.maxLines} lines`);
  const files: ParsedPatchFile[] = [];
  let current: ParsedPatchFile | null = null;
  let hunk: ParsedHunk | null = null;
  const hunkLines: string[] = [];
  const flushHunk = () => {
    if (!current || !hunk) return;
    const oldCount = hunkLines.filter((l) => l.startsWith(' ') || l.startsWith('-')).length;
    const newCount = hunkLines.filter((l) => l.startsWith(' ') || l.startsWith('+')).length;
    if (oldCount !== hunk.oldCount || newCount !== hunk.newCount)
      throw new Error(
        `Hunk @@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@ line counts do not match its body`,
      );
    current.hunks.push({ ...hunk, lines: hunkLines.splice(0) });
  };
  for (const line of lines) {
    if (line.startsWith('--- ')) {
      flushHunk();
      const sourcePath = stripPrefix(line.slice(4));
      current = { path: null, sourcePath, hunks: [] };
      files.push(current);
      hunk = null;
      continue;
    }
    if (line.startsWith('+++ ')) {
      if (!current) throw new Error('Patch has +++ without a preceding ---');
      current = { ...current, path: stripPrefix(line.slice(4)) };
      files[files.length - 1] = current;
      hunk = null;
      continue;
    }
    if (line.startsWith('diff --git') || line.startsWith('index ')) continue;
    if (line.startsWith('@@')) {
      flushHunk();
      if (!current) throw new Error('Hunk header outside of a file section');
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!match) throw new Error(`Malformed hunk header: ${line.slice(0, 60)}`);
      hunk = {
        oldStart: Number(match[1]),
        oldCount: match[2] === undefined ? 1 : Number(match[2]),
        newStart: Number(match[3]),
        newCount: match[4] === undefined ? 1 : Number(match[4]),
        lines: [],
      };
      continue;
    }
    if (hunk) {
      if (
        line.startsWith(' ') ||
        line.startsWith('-') ||
        line.startsWith('+') ||
        line.startsWith('\\')
      )
        hunkLines.push(line);
      else if (line === '') hunkLines.push(' ');
      else throw new Error(`Unexpected line in hunk: ${line.slice(0, 60)}`);
      continue;
    }
    // Tolerate leading garbage (commit messages, mail headers) before the first ---.
  }
  flushHunk();
  const result = files.filter((file) => file.path !== null || file.sourcePath !== null);
  if (!result.length) throw new Error('Patch contains no file sections');
  if (result.length > PATCH_LIMITS.maxFiles)
    throw new Error(`Patch touches more than ${PATCH_LIMITS.maxFiles} files`);
  const hunkTotal = result.reduce((sum, file) => sum + file.hunks.length, 0);
  if (hunkTotal > PATCH_LIMITS.maxHunks)
    throw new Error(`Patch exceeds ${PATCH_LIMITS.maxHunks} hunks`);
  for (const file of result) {
    if (file.path === null) throw new Error('Deleting whole files is not supported');
    if (file.sourcePath === null && file.hunks.length === 0)
      throw new Error(`Create patch for ${file.path} has no hunks`);
  }
  return result;
}

/** Applies parsed hunks to file content; throws PatchMismatch on any mismatch. */
export function applyHunks(content: string, hunks: readonly ParsedHunk[]): string {
  const hadTrailingNewline = content.endsWith('\n');
  const lines = content === '' ? [] : content.split('\n');
  if (content.endsWith('\n')) lines.pop();
  let offset = 0;
  let noNewlineAtEnd = false;
  for (const hunk of hunks) {
    const position = hunk.oldStart === 0 ? 0 : hunk.oldStart - 1 + offset;
    const expected: string[] = [];
    const replacement: string[] = [];
    for (const line of hunk.lines) {
      if (line.startsWith('\\')) {
        noNewlineAtEnd = true;
        continue;
      }
      if (line.startsWith('-')) expected.push(line.slice(1));
      else if (line.startsWith('+')) replacement.push(line.slice(1));
      else {
        expected.push(line.slice(1));
        replacement.push(line.slice(1));
      }
    }
    if (position < 0 || position + expected.length > lines.length)
      throw new Error(
        `PatchMismatch: hunk @@ -${hunk.oldStart},${hunk.oldCount} @@ does not fit at line ${position + 1}`,
      );
    for (let index = 0; index < expected.length; index++)
      if (lines[position + index] !== expected[index])
        throw new Error(
          `PatchMismatch: context differs at line ${position + index + 1} (expected ${JSON.stringify(expected[index])}, found ${JSON.stringify(lines[position + index])})`,
        );
    lines.splice(position, expected.length, ...replacement);
    offset += replacement.length - expected.length;
  }
  const result = lines.join('\n');
  if (lines.length === 0) return '';
  return hadTrailingNewline && !noNewlineAtEnd ? result + '\n' : result;
}
