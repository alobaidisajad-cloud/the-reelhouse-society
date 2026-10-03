/**
 * theDeskCountsAsTheReaderDoes.test.tsx — an essay's minutes, one rule.
 * ─────────────────────────────────────────────────────────────────────────────
 * readTime.ts is the one home of "how long an essay takes": 200 words a minute,
 * for the reader, the series page, the writing room and the Lobby. The dossier
 * desk (the writing room's design record) counted 220 of its own, so the same
 * 1,100 words read 5 MIN on the desk and 6 MIN everywhere else.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import { DossierDesk } from '../paper/PaperDesk';
import { readTimeForWords } from '../readTime';

const noop = () => {};
const allText = (r: ReturnType<typeof render>) => r.container.queryAll((n) => n.type === 'Text')
  .map((n) => n.children.filter((c): c is string => typeof c === 'string').join(''));

describe('the dossier desk', () => {
  it.each([1100, 299, 300, 25000])('prints the minutes the reader will (%i words)', (words) => {
    const r = render(<DossierDesk title="The Long Silence" body="Body" words={words} onBack={noop} onFile={noop} />);
    const rail = allText(r).find((t) => t.includes('WORDS ·'));
    expect(rail).toBeDefined();
    expect(rail!.endsWith(` · ${readTimeForWords(words)}`)).toBe(true);
  });

  it('the rule is the reader’s: 1,100 words is six minutes, not five', () => {
    const r = render(<DossierDesk title="T" body="B" words={1100} onBack={noop} onFile={noop} />);
    expect(allText(r)).toContain('1,100 WORDS · 6 MIN');
  });
});
