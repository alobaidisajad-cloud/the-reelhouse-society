/**
 * The letter on a portrait with no photograph is the first of the name the
 * member's file shows, on both screens that draw it (the file's plate, the
 * portrait you are about to change): one member, one letter.
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

  it('takes the whole first character a reader sees (every script: aCharacterIsNeverCut)', () => {
    expect(portraitInitial({ persona: '🇮🇶 Sajad' })).toBe('🇮🇶'); // a flag: two regional letters
    expect(portraitInitial({ display_name: 'élise' })).toBe('É'); // an accent written after its letter
  });

  it('puts one letter in the circle even where its capital is two', () => {
    expect(portraitInitial({ persona: 'ßpiel' })).toBe('ß');
  });

  it('is asked by both screens that show the member file: its plate and the portrait you are about to change', () => {
    // No screen works a letter out alone: aLetterIsTakenWhole sweeps the app for that.
    for (const file of ['app/user/[username].tsx', 'src/features/profile/EditProfileScreen.tsx']) {
      expect([file, readFileSync(join(ROOT, file), 'utf8').includes('portraitInitial(')]).toEqual([file, true]);
    }
    // The Cinema DNA card names its member by handle, so its letter is the handle's.
    expect(readFileSync(join(ROOT, 'src/components/profile/CinemaDNACard.tsx'), 'utf8')).toMatch(/initialOf\(user\?\.username/);
  });

  it('is never read aloud: the name beside it says who it is (decorativeTextProps hides nothing; UNSPOKEN does)', () => {
    const sites: [string, RegExp][] = [
      ['app/user/[username].tsx', /<Text[^>]*\{\.\.\.UNSPOKEN\}[^>]*style=\{s\.plateInitial\}/],
      ['src/features/profile/EditProfileScreen.tsx', /<Text[^>]*\{\.\.\.UNSPOKEN\}[^>]*style=\{st\.avatarInitial\}/],
      ['src/components/profile/CinemaDNACard.tsx', /<Text[^>]*\{\.\.\.UNSPOKEN\}[^>]*style=\{s\.avatarInitial\}/],
      // A Lounge message: its author's handle is printed above the words.
      ['app/lounge/[id].tsx', /<Text style=\{s\.authorAvatarLetter\} \{\.\.\.UNSPOKEN\}>\{initialOf\(msg\.username\)\}<\/Text>/],
    ];
    for (const [file, re] of sites) expect([file, re.test(readFileSync(join(ROOT, file), 'utf8'))]).toEqual([file, true]);
  });
});
