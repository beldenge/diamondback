/**
 * Town / NITE / TARGET scene strings in Dust *scripts* are
 * column-letter + 1-based row (`scene g15` = x=6, y=14 = filmed O7).
 *
 * SET Pascal names in `scenes.json` are the transpose: row-letter +
 * 1-based column (`Scene O7` at the same cell). Jail handlers live in
 * `Scene G12.txt` (script name) while the filmed facade is L7.
 *
 * Do not look up `scene g15` with `sceneByName` on a 225-cell graph —
 * that matches Pascal `Scene G15` at (14, 6).
 */

const LETTERS = "abcdefghijklmno";

export function isTownGridSize(sceneCount: number): boolean {
  return sceneCount >= 200;
}

export function parseScriptScene(
  name: string,
): { x: number; y: number } | undefined {
  const match = name
    .trim()
    .toLowerCase()
    .match(/^(?:scene\s+)?([a-o])(\d{1,2})$/);
  if (!match) {
    return undefined;
  }
  const x = LETTERS.indexOf(match[1]!);
  const y = Number(match[2]) - 1;
  if (x < 0 || y < 0 || y > 14) {
    return undefined;
  }
  return { x, y };
}

/** Script-convention name for a filmed town pose (`(6,14)` → `scene g15`). */
export function scriptSceneName(x: number, y: number): string {
  const letter = LETTERS[x] ?? "a";
  return `scene ${letter}${y + 1}`;
}

export function pascalSceneName(x: number, y: number): string {
  const letter = LETTERS[y] ?? "a";
  return `scene ${letter}${x + 1}`;
}
