export interface DiffRow {
  readonly left: string | null;
  readonly right: string | null;
  readonly kind: 'same' | 'added' | 'removed';
}

/**
 * Line-based LCS diff between the old and new file text. Rows pair unchanged
 * lines side by side; added rows have no left cell, removed rows no right cell.
 */
export function diffLines(
  before: string | null,
  after: string,
  maxRows = 400,
): { rows: DiffRow[]; truncated: boolean } {
  const leftLines = before === null || before === '' ? [] : before.split('\n');
  const rightLines = after === '' ? [] : after.split('\n');
  const n = leftLines.length;
  const m = rightLines.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        leftLines[i] === rightLines[j]
          ? table[(i + 1) * width + j + 1]! + 1
          : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (leftLines[i] === rightLines[j]) {
      rows.push({ left: leftLines[i]!, right: rightLines[j]!, kind: 'same' });
      i++;
      j++;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      rows.push({ left: leftLines[i]!, right: null, kind: 'removed' });
      i++;
    } else {
      rows.push({ left: null, right: rightLines[j]!, kind: 'added' });
      j++;
    }
  }
  while (i < n) {
    rows.push({ left: leftLines[i]!, right: null, kind: 'removed' });
    i++;
  }
  while (j < m) {
    rows.push({ left: null, right: rightLines[j]!, kind: 'added' });
    j++;
  }
  const truncated = rows.length > maxRows;
  return { rows: truncated ? rows.slice(0, maxRows) : rows, truncated };
}
