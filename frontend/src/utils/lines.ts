export function currentLineIndex(value: string, selectionStart: number): number {
  const upToCursor = value.slice(0, selectionStart);
  return upToCursor.split('\n').length - 1;
}

export function toggleDoneOnLine(value: string, lineIndex: number): string {
  const lines = value.split('\n');
  const line = lines[lineIndex];
  lines[lineIndex] = line.startsWith('x ') ? line.slice(2) : 'x ' + line;
  return lines.join('\n');
}

export function duplicateLine(value: string, lineIndex: number): string {
  const lines = value.split('\n');
  lines.splice(lineIndex + 1, 0, lines[lineIndex]);
  return lines.join('\n');
}
