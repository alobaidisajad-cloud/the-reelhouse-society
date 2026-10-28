/**
 * A PILE OF MARKS IS KEPT TO FOUR, AND EVERY SCRIPT KEEPS ITS OWN (P4.31).
 *
 * Combining marks stacked on one letter (Zalgo) paint far above and below their line, over the
 * rows around them: a critique, a salon line, a member's name. The house Text, which draws every
 * word, keeps at most four marks on any one character, so words stored before and words written
 * on the website are kept too. The scripts that write with marks carry fewer, and are drawn
 * exactly as written: fully vowelled Arabic, Hebrew with its points and cantillation, Vietnamese
 * written decomposed, Thai with its vowels and tones.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import { marksKept, Text } from '@/src/components/text';

const ARABIC = 'بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
const HEBREW = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים';
const VIETNAMESE = 'Tiếng Việt có dấu, ở đây.'.normalize('NFD');
const THAI = 'กี่น้ำใจ ผู้ใหญ่';
const ZALGO = `Z${'̀́̂̃̄̅̆̇̈̉'.repeat(3)}algo`;

/** The most combining marks any one character of `words` carries. */
const mostMarks = (words: string) => Math.max(0, ...(words.match(/\p{M}+/gu) ?? []).map((run) => [...run].length));

describe('every script keeps its own marks', () => {
  it.each([['Arabic, fully vowelled', ARABIC], ['Hebrew, pointed and cantillated', HEBREW],
    ['Vietnamese, decomposed', VIETNAMESE], ['Thai, its vowels and tones', THAI]])('%s, drawn exactly as written', (_name, words) => {
    // The fixture does carry marks: two or more on some character, up to the four kept.
    expect(mostMarks(words)).toBeGreaterThanOrEqual(2);
    expect(mostMarks(words)).toBeLessThanOrEqual(4);
    const r = render(<Text>{words}</Text>);
    expect(r.getByText(words)).toBeTruthy();
    expect(marksKept(words)).toBe(words);
  });
});

describe('a pile is kept to four', () => {
  it('draws a letter with thirty marks with its first four', () => {
    expect(mostMarks(ZALGO)).toBe(30);
    const kept = `Z${'̀́̂̃'}algo`;
    const r = render(<Text>{ZALGO}</Text>);
    expect(r.getByText(kept)).toBeTruthy();
    expect(r.queryByText(ZALGO)).toBeNull();
  });

  it('keeps it in each of a Text\'s strings, beside the words around it', () => {
    const name = 'kane';
    const r = render(<Text>{'@'}{name}{' wrote '}{ZALGO}</Text>);
    expect(r.getByText(`@kane wrote Z${'̀́̂̃'}algo`)).toBeTruthy();
  });
});
