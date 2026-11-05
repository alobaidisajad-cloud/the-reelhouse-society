/**
 * aSlurIsStruckForWhoAsked.test.tsx — a member who turned on "Hide slurs"
 * reads members' writing with the eight slurs struck out, the sentence
 * kept; everyone else reads every word as written. Swear words, and words that
 * only hold a slur's letters, are never struck.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { slurSpans, inkedOut, STRUCK_CLOSES, STRUCK_OPENS } from '@/src/utils/slurs';
import { StyleSheet } from 'react-native';
import { markStruck, useStruck } from '../StruckWords';
import { Text } from '../text';
import { softBreak } from '@/src/utils/softBreak';
import { colors } from '@/src/theme/theme';
import { useAuthStore } from '@/src/stores/auth';

const STRUCK = [
  'nigger', 'NIGGERS', "nigger's", 'nigga', 'niggas', 'n1gg3r', 'niiiigger', 'Nigger’s', 'faggot', 'fagots', 'wetback',
  'kike', 'kikes', 'spic', 'spics', 'chink', 'chinks', 'tranny', 'trannies', 'retard', 'retarded', 'retards', 'Retard’s',
];
const KEPT = [
  'snigger', 'sniggering', 'niggardly', 'Niger', 'Nigeria', 'Nigerian', 'spick and span', 'spices', 'spice', 'spicy',
  'retardant', 'chinking', 'fuck', 'shit', 'bitch', 'cunt', 'pussy', 'slut', 'whore', 'asshole', 'kiked?',
];
const struckOf = (words: string) => slurSpans(words).map(([a, b]) => words.slice(a, b));

describe('the words struck', () => {
  it.each(STRUCK)('%s is struck, whole, as written', (word) => {
    expect(struckOf(`a line with ${word} in it`)).toEqual([word.replace(/['’]+$/, '')]);
  });

  it.each(KEPT)('%s is kept', (words) => {
    expect(struckOf(`a line with ${words} in it`)).toEqual([]);
  });

  it('strikes each in a line, its quotes and the words around it kept', () => {
    const words = 'He said “Nigger’s” twice, then: retard.';
    expect(struckOf(words)).toEqual(['Nigger’s', 'retard']);
    expect(inkedOut(words).map((p) => p.text).join('')).toBe(words);
  });

  it('keeps in step with letters that lower to two, and those outside one unit', () => {
    expect(struckOf('İstanbul, and a retard')).toEqual(['retard']);
    expect(struckOf('🎬 retard 🎬')).toEqual(['retard']);
  });

  it('strikes nothing in no words', () => {
    expect(slurSpans('')).toEqual([]);
    expect(inkedOut('')).toEqual([{ text: '', struck: false }]);
  });
});

describe('the page', () => {
  const as = (hide: boolean | undefined) =>
    useAuthStore.setState({ user: { id: 'me', username: 'me', role: 'free', preferences: hide === undefined ? {} : { hide_slurs: hide } } as never });
  afterEach(() => useAuthStore.setState({ user: null }));
  const LINE = 'A film for every retard in the room.';
  /** Members' words as a screen draws them: through useStruck, into the app's Text, through softBreak. */
  function Words({ words }: { words: string }) {
    const struck = useStruck();
    return <Text testID="words">{softBreak(struck(words))}</Text>;
  }

  it('a member who asked reads the slur typed over in brass x, the sentence kept, and hears "struck"', () => {
    as(true);
    const r = render(<Words words={LINE} />);
    const strike = r.getByText('xxxxxx');
    expect(StyleSheet.flatten(strike.props.style)).toMatchObject({ color: colors.sepia });
    expect(r.queryByText(/retard/)).toBeNull();
    expect(r.getByTestId('words').props.accessibilityLabel).toBe('A film for every struck in the room.');
    // The marks are never drawn.
    expect(JSON.stringify(r.toJSON())).not.toMatch(new RegExp(`[${STRUCK_OPENS}${STRUCK_CLOSES}]`));
  });

  it.each([[false], [undefined]])('a member who did not ask (%s) reads every word, drawn as it was', (hide) => {
    as(hide);
    const r = render(<Words words={LINE} />);
    expect(r.getByText(LINE)).toBeTruthy();
    expect(r.queryByText('xxxxxx')).toBeNull();
    expect(r.getByTestId('words').props.accessibilityLabel).toBeUndefined();
  });

  it('a line with no slur is drawn and said as written, the switch on', () => {
    as(true);
    const r = render(<Words words={'"What the fuck is this?" A spicy third act.'} />);
    expect(r.getByText('"What the fuck is this?" A spicy third act.')).toBeTruthy();
    expect(r.getByTestId('words').props.accessibilityLabel).toBeUndefined();
  });

  it('strikes each slur in a line, keeping its apostrophe, and nothing typed by a member is read as struck', () => {
    expect(markStruck('Two: Nigger’s and kikes.')).toBe(`Two: ${STRUCK_OPENS}xxxxxx’x${STRUCK_CLOSES} and ${STRUCK_OPENS}xxxxx${STRUCK_CLOSES}.`);
    expect(markStruck('Fine.')).toBe('Fine.');
  });
});
