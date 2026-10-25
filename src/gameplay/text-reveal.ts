/** Bounded, allocation-free reveal cursor. Time is simulation time, never a UI timer. */
export const DEFAULT_TEXT_SPEED = 30;
export const MAX_TEXT_SPEED = 120;
export interface TextReveal {
  /** UTF-16 boundary in preview; the C runtime keeps the equivalent UTF-8 byte boundary. */
  end: number;
  credit: number;
  speed: number;
}
export function createTextReveal(text: string, speed = DEFAULT_TEXT_SPEED): TextReveal {
  return { end: speed === 0 ? text.length : 0, credit: 0, speed };
}
export const isTextRevealing = (text: string, reveal: TextReveal) => reveal.end < text.length;
export function revealAllText(text: string, reveal: TextReveal) {
  reveal.end = text.length;
  reveal.credit = 0;
}
export function stepTextReveal(text: string, reveal: TextReveal, seconds: number) {
  if (!isTextRevealing(text, reveal) || !Number.isFinite(seconds) || seconds <= 0) return;
  reveal.credit = Math.min(text.length, reveal.credit + seconds * reveal.speed);
  let count = Math.floor(reveal.credit + 0.0001);
  reveal.credit = Math.max(0, reveal.credit - count);
  while (count-- > 0 && reveal.end < text.length)
    reveal.end += text.codePointAt(reveal.end)! > 0xffff ? 2 : 1;
  if (!isTextRevealing(text, reveal)) reveal.credit = 0;
}
