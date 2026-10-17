import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../webview/src/styles/tokens.css', import.meta.url),
  'utf8',
);
const palettes = [...source.matchAll(/:root[^{}]*\{([^}]+)\}/g)].map((match) =>
  Object.fromEntries(
    [...match[1]!.matchAll(/--([\w-]+):\s*(#[a-f\d]{6});/gi)].map((item) => [item[1], item[2]!]),
  ),
);
function luminance(hex: string): number {
  const linear = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}
function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}
describe('readable workspace palettes', () => {
  for (const [index, theme] of ['dark', 'light'].entries()) {
    it(`${theme} keeps secondary text readable and primary controls distinct`, () => {
      const palette = palettes[index]!;
      for (const background of ['bg', 'sidebar', 'panel', 'surface', 'elevated'])
        for (const foreground of ['text', 'muted', 'faint'])
          expect(
            contrast(palette[foreground]!, palette[background]!),
            `${foreground} on ${background}`,
          ).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette['on-accent']!, palette.accent!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.accent!, palette.bg!)).toBeGreaterThanOrEqual(3);
    });
  }
});
