/**
 * ENTER ANSWERS EVERY FIELD (P4.40).
 *
 * On a hardware keyboard, Full Keyboard Access, or a phone's own return key, Enter
 * in a form's field did nothing in about a dozen places: the salon's name, the
 * series' name, the security code, the tribunal's hours, the profile's username
 * and display name. A member who types moves on with Enter, or files with it.
 * Every one-line field now says what Enter does (onSubmitEditing: the next field,
 * or the form's own act; onEndEditing: what is typed is applied), read from each
 * file's code (comments removed), or is listed here with why. A field of many
 * lines takes Enter as a new line, and is not one of these.
 */
import { readCode } from '@/test-utils/readCode';
import { files, rel } from '@/test-utils/universe';

/** One-line fields where Enter only closes the keyboard, and why that is right. Keyed file + label. */
const CLOSES: Record<string, string> = {
  'app/(modals)/list-modal.tsx Search films to add to stack': 'a search: its results come as it is typed',
  'app/(tabs)/lounge.tsx Search salons': 'a search: its results come as it is typed',
  'src/components/dispatch/paper/PaperDesk.tsx Search for a film': 'a search: its results come as it is typed',
  'src/components/dispatch/paper/PaperMore.tsx Search the archive for a film': 'a search: its results come as it is typed',
  'src/components/log/LogSearchEngine.tsx Search for a film to log': 'a search: its results come as it is typed',
  'src/components/profile/FollowRequestsPanel.tsx Search follow requests': 'a search: its results come as it is typed',
  'src/components/profile/ProfileTriptych.tsx `Search films for ${MOUNT_NAME[sheet.index]': 'a search: its results come as it is typed',
  'src/components/profile/RoomParts.tsx a11y': 'a room\'s search: its results come as it is typed',
  'src/components/log/LogForm.tsx Watched with companion': 'an aside mid-form: the next field is the Vault, which a rank may lock, so Enter puts the keyboard away',
  'src/components/dispatch/paper/PaperComposer.tsx Where this came from': 'the source line under the wire\'s body: the desk files with FILE, never on a keystroke',
  'src/features/profile/LinksEditor.tsx Link URL': 'a link\'s last field: the next link is one the member adds, so Enter puts the keyboard away',
};

/** A field component that hands its caller's props to its TextInput: its callers are read instead. */
const PASSES_THROUGH = ['src/components/ControlledInput.tsx'];
const CALLED_AS = /^<(ControlledInput|ControlledUsernameInput)\s/;

/** Each `<Tag …>` element of a file, its props as written. */
function tagsIn(code: string, open: RegExp): string[] {
  const out: string[] = [];
  for (let i = code.search(open); i >= 0; ) {
    let j = i;
    let depth = 0;
    for (; j < code.length; j++) {
      const c = code[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    out.push(code.slice(i, j));
    const next = code.slice(j).search(open);
    i = next < 0 ? -1 : j + next;
  }
  return out;
}

const labelOf = (tag: string) => (tag.match(/accessibilityLabel=["{]([^"}]*)/) || [])[1] ?? '';
const oneLine = (tag: string) => !/\bmultiline\b(?!=\{false\})/.test(tag);
const answers = (tag: string) => /\bon(Submit|End)Editing=/.test(tag);

const census = files('appCode', { ext: ['.tsx'] }).map(rel).flatMap((f) => {
  const code = readCode(f);
  const fields = PASSES_THROUGH.includes(f) ? [] : tagsIn(code, /<TextInput\s(?!\s*\|)/);
  const called = tagsIn(code, /<Controlled(Username)?Input\s/).filter((t) => CALLED_AS.test(t));
  return [...fields, ...called].filter(oneLine).map((tag) => ({ key: `${f} ${labelOf(tag)}`, answered: answers(tag) }));
});

describe('Enter answers every one-line field', () => {
  it('reads the app: the sign-in form and the profile\'s fields among them', () => {
    expect(census.length).toBeGreaterThan(25);
    expect(census.some((c) => c.key === 'app/(modals)/login.tsx Password')).toBe(true);
    expect(census.some((c) => c.key === 'src/features/profile/EditProfileScreen.tsx Username')).toBe(true);
  });

  it('every one says what Enter does, or is listed with why it only puts the keyboard away', () => {
    expect(census.filter((c) => !c.answered && !(c.key in CLOSES)).map((c) => c.key)).toEqual([]);
  });

  it('lists none that is gone, or that answers Enter now', () => {
    const stale = Object.keys(CLOSES).filter((k) => !census.some((c) => c.key === k && !c.answered));
    expect(stale).toEqual([]);
  });
});
