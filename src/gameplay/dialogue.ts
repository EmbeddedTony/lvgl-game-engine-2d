import type { GameNode } from '../model';

/** Reserve the lower touch controls when there is room for at least one text row.
 * Small displays fall back to the full viewport and retain an in-panel advance button.
 * Keep the arithmetic in sync with lge_story.c. Nodes have resolved screen positions. */
export function dialogueBottom(
  height: number,
  nodes: readonly GameNode[],
  choices: number,
): number {
  let bottom = height - 8;
  for (const n of nodes)
    if (n.visible && n.layer === 'ui' && n.inputAction && n.y >= height / 2 && n.y < height)
      bottom = Math.min(bottom, Math.floor(n.y) - 8);
  return bottom >= 122 + choices * 20 ? bottom : height - 8;
}

/** Same conservative whole-character/word pagination as the C runtime. No font metrics or heap on MCU. */
export function dialoguePages(
  text: string,
  width: number,
  height: number,
  choices: number,
): string[] {
  const columns = Math.min(60, Math.max(4, Math.floor((width - 32) / 8)));
  const rows = Math.min(6, Math.max(1, Math.floor((height - 112 - choices * 20) / 18)));
  const chars = Array.from(text),
    pages: string[] = [];
  let at = 0;
  do {
    let out = '',
      line = 0,
      col = 0,
      bytes = 0;
    while (at < chars.length) {
      const c = chars[at];
      if (c === '\n') {
        at++;
        if (line + 1 >= rows) break;
        out += '\n';
        line++;
        col = 0;
        continue;
      }
      if (c === ' ' && col === 0) {
        at++;
        continue;
      }
      let word = 0;
      if (c !== ' ' && (at === 0 || chars[at - 1] === ' ' || chars[at - 1] === '\n')) {
        while (at + word < chars.length && ![' ', '\n'].includes(chars[at + word])) word++;
      }
      if (col >= columns || (word > 0 && word <= columns && col > 0 && col + word > columns)) {
        if (line + 1 >= rows) break;
        out += '\n';
        line++;
        col = 0;
        continue;
      }
      const size = new TextEncoder().encode(c).length;
      if (bytes + size > 1000) break;
      out += c;
      bytes += size;
      col++;
      at++;
    }
    pages.push(out.trimEnd());
  } while (at < chars.length);
  return pages;
}
