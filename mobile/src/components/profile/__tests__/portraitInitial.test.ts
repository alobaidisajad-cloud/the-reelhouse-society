/**
 * The letter on a portrait with no photograph is the first of the name the
 * member's file shows, on every screen that draws one (the file's plate, the
 * portrait you are about to change, the Cinema DNA card): one member, one letter.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { portraitInitial } from '../portraitInitial';

const ROOT = join(__dirname, '..', '..', '..', '..');

describe('portraitInitial', () => {
  it('takes the name the file shows: persona, else display name, else handle', () => {
    expect(portraitInitial({ persona: 'midnight usher', display_name: 'Ada', username: 'ada' })).toBe('M');
    expect(portraitInitial({ persona: '', display_name: 'ada lovelace', username: 'zed' })).toBe('A');
    expect(portraitInitial({ persona: null, display_name: null, username: 'kane' })).toBe('K');
  });

  it('never leaves a portrait blank', () => {
    expect(portraitInitial(null)).toBe('?');
    expect(portraitInitial({})).toBe('?');
  });

  it('takes the whole first character a reader sees, however it is built', () => {
    expect(portraitInitial({ persona: '🎬 Midnight Usher' })).toBe('🎬'); // one code point beyond the 16-bit range
    expect(portraitInitial({ persona: '🇮🇶 Sajad' })).toBe('🇮🇶'); // a flag: two regional letters
    expect(portraitInitial({ persona: '👨‍👩‍👧 the family' })).toBe('👨‍👩‍👧'); // people joined by zero-width joiners
    expect(portraitInitial({ persona: '👍🏽 fan' })).toBe('👍🏽'); // a skin tone rides on the hand
    expect(portraitInitial({ persona: '1️⃣ first' })).toBe('1️⃣'); // a keycap
    expect(portraitInitial({ persona: '🏴󠁧󠁢󠁳󠁣󠁴󠁿 Scot' })).toBe('🏴󠁧󠁢󠁳󠁣󠁴󠁿'); // a flag of tags
    expect(portraitInitial({ display_name: 'élise' })).toBe('É'); // an accent written after its letter
    expect(portraitInitial({ display_name: 'élise' })).toBe('É');
  });

  it('puts one letter in the circle even where its capital is two', () => {
    expect(portraitInitial({ persona: 'ßpiel' })).toBe('ß');
  });

  it('is the one rule: every screen that draws the letter asks it, and none works it out alone', () => {
    const askers = [
      'app/user/[username].tsx',
      'src/features/profile/EditProfileScreen.tsx',
      'src/components/profile/CinemaDNACard.tsx',
    ];
    for (const file of askers) {
      const text = readFileSync(join(ROOT, file), 'utf8');
      expect([file, text.includes('portraitInitial(')]).toEqual([file, true]);
      expect([file, /\.charAt\(0\)\.toUpperCase\(\)/.test(text)]).toEqual([file, false]);
    }
  });

  it('is never read aloud: the name beside it says who it is (decorativeTextProps hides nothing; UNSPOKEN does)', () => {
    const sites: [string, RegExp][] = [
      ['app/user/[username].tsx', /<Text[^>]*\{\.\.\.UNSPOKEN\}[^>]*style=\{s\.plateInitial\}/],
      ['src/features/profile/EditProfileScreen.tsx', /<Text[^>]*\{\.\.\.UNSPOKEN\}[^>]*style=\{st\.avatarInitial\}/],
      ['src/components/profile/CinemaDNACard.tsx', /<Text[^>]*\{\.\.\.UNSPOKEN\}[^>]*style=\{s\.avatarInitial\}/],
    ];
    for (const [file, re] of sites) expect([file, re.test(readFileSync(join(ROOT, file), 'utf8'))]).toEqual([file, true]);
  });
});
