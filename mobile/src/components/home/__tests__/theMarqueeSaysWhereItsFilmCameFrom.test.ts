/**
 * theMarqueeSaysWhereItsFilmCameFrom.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Lobby's marquee said its film was "As decreed by the Programming
 * Committee". Two things were wrong with that line: the words were not the
 * house's own, and nobody decreed anything — the film is the world's weekly
 * trending #1. The line now says so, and these pin both halves: the borrowed
 * phrase is gone from every shipped file of both apps, and the marquee's film
 * is still the one the line describes.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MOBILE = join(__dirname, '..', '..', '..', '..');
const WEB = join(MOBILE, '..', 'src');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '__tests__'].includes(e.name)) walk(p, out); }
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
};

describe('the marquee says where its film came from', () => {
  const files = [...walk(join(MOBILE, 'app')), ...walk(join(MOBILE, 'src')), ...walk(WEB)];

  it('no shipped text borrows the "Programming Committee"', () => {
    // Comments are blanked: the note recording the fix names the phrase.
    const offenders = files.filter((f) => /programming committee/i.test(strip(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });

  it('the scan reads both apps — not passing on an empty list', () => {
    expect(files.length).toBeGreaterThan(300);
    expect(files.some((f) => f.includes(join('src', 'pages')))).toBe(true);
  });

  it('the line says the world’s weekly bill, and the Lobby hands it the world’s weekly #1', () => {
    const board = strip(readFileSync(join(MOBILE, 'src/components/home/MarqueeBoard.tsx'), 'utf8'));
    expect(board).toMatch(/Top of the world’s bill this week/);
    const lobby = strip(readFileSync(join(MOBILE, 'app/(tabs)/index.tsx'), 'utf8'));
    expect(lobby).toMatch(/const heroFilm = trending\[0\]/);
    expect(lobby).toMatch(/<MarqueeBoard film=\{heroFilm\} \/>/);
    const tmdb = strip(readFileSync(join(MOBILE, 'src/lib/tmdb.ts'), 'utf8'));
    expect(tmdb).toMatch(/trending: async \(timeWindow = 'week'\)/);
  });
});
