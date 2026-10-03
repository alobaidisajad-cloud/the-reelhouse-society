/**
 * readCode must remove comments and ONLY comments — the cases a regex got
 * wrong are the reason it exists.
 */
import { readCode, stripComments } from '../readCode';

describe('stripComments', () => {
  it('removes line and block comments, and keeps the code around them', () => {
    const out = stripComments('const a = 1; // one\n/* two */ const b = 2;', 'x.ts');
    expect(out).not.toMatch(/one|two/);
    expect(out).toMatch(/const a = 1;/);
    expect(out).toMatch(/const b = 2;/);
  });

  it('keeps every line break, so line numbers still point at the file', () => {
    const text = 'a;\n/* one\n two\n three */\nb;\n';
    expect(stripComments(text, 'x.ts').split('\n')).toHaveLength(text.split('\n').length);
    expect(stripComments(text, 'x.ts').split('\n')[4]).toBe('b;');
  });

  it('never glues the code either side of a comment together', () => {
    expect(stripComments('a/*x*/b', 'x.ts')).toMatch(/^a +b$/);
  });

  it('leaves a // inside a string, a template and a regex alone', () => {
    const text = "const u = 'https://example.com'; const t = `see //here ${u}`; const r = /a\\/\\/b/;";
    expect(stripComments(text, 'x.ts')).toBe(text);
  });

  it('leaves a // written as words in JSX text alone, but removes a JSX comment', () => {
    const text = 'const x = <Text>{a}// not a comment {/* gone */}</Text>;';
    const out = stripComments(text, 'x.tsx');
    expect(out).toContain('// not a comment');
    expect(out).not.toContain('gone');
  });

  it('reads a generic arrow in text with no file name, which TSX would take for a tag', () => {
    const text = 'const f = <T>(x: T): T => x; // gone\nconst s = "// kept";';
    const out = stripComments(text);
    expect(out).not.toContain('gone');
    expect(out).toContain('"// kept"');
  });

  it('reads a real file of the app', () => {
    const code = readCode('src/components/text/index.tsx');
    expect(code).toMatch(/export const Text/);
    expect(code).not.toMatch(/\/\*\*/);
  });
});
