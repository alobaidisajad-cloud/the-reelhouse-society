/**
 * EVERY DRAG HAS A TAP — the register, as a test (P4.36).
 *
 * A stack could be ordered only by a hold and a drag: a member who cannot hold and drag (a tremor,
 * a switch, a stylus) could not order it at all. Every drag or pan in the app (a hold that drags,
 * PanResponder, Gesture.Pan) has a visible single-tap way to do the same, named here with what it
 * is; a new site fails until it is added with its tap, and a site whose tap is gone fails too.
 * Read from each file's code, comments removed.
 */
import { readCode } from '@/test-utils/readCode';
import { files, rel } from '@/test-utils/universe';

/** A drag or pan, as the code spells one. */
const DRAG = /onLongPress=\{(?:[^}]*\bdrag\b)|PanResponder\.create\(|Gesture\.Pan\(\)/g;

/** A sheet closed by a swipe down is closed by a tap on its backdrop too. */
const BACKDROP_TAP = /style=\{\w+\.(?:\w*[bB]ackdrop)\}\s*onPress=\{(?:onClose|handleClose|handleDismiss)\}/;

const REGISTER: Record<string, { sites: number; tap: RegExp; why: string }> = {
  'app/(modals)/list-modal.tsx': {
    sites: 1,
    tap: /onPress=\{sealed \? undefined : \(\) => onTake\(item\.id\)\}[\s\S]*accessibilityLabel=\{`Move \$\{item\.title\} up`\}[\s\S]*accessibilityLabel=\{`Move \$\{item\.title\} down`\}/,
    why: 'a hold drags a film; a tap takes it up, and its arrows move it a step',
  },
  'src/components/log/NoteSheet.tsx': { sites: 1, tap: BACKDROP_TAP, why: 'swiped down to close, or its backdrop tapped' },
  'src/components/lounge/ActionSheet.tsx': { sites: 1, tap: BACKDROP_TAP, why: 'swiped down to close, or its backdrop tapped' },
  'src/components/lounge/CreateLoungeSheet.tsx': { sites: 1, tap: BACKDROP_TAP, why: 'swiped down to close, or its backdrop tapped' },
  'src/components/moderation/ContentActionSheet.tsx': { sites: 1, tap: BACKDROP_TAP, why: 'swiped down to close, or its backdrop tapped' },
  'src/components/moderation/ReportSheet.tsx': { sites: 1, tap: BACKDROP_TAP, why: 'swiped down to close, or its backdrop tapped' },
};

const census: Record<string, number> = {};
const code: Record<string, string> = {};
for (const f of files('appCode', { ext: ['.ts', '.tsx'] }).map(rel)) {
  const text = readCode(f);
  const n = (text.match(DRAG) ?? []).length;
  if (n) { census[f] = n; code[f] = text; }
}

describe('every drag has a tap', () => {
  it('finds the drags (the scan has not gone blind)', () => {
    expect(Object.keys(census).length).toBeGreaterThanOrEqual(6);
  });

  it('drags only where the register says, as many times as it says', () => {
    expect(census).toEqual(Object.fromEntries(Object.entries(REGISTER).map(([f, { sites }]) => [f, sites])));
  });

  it('keeps each one\'s tap', () => {
    const lost = Object.entries(REGISTER).filter(([f, { tap }]) => !tap.test(code[f] ?? '')).map(([f]) => f);
    expect(lost).toEqual([]);
  });

  it('says NO to a sheet whose backdrop is not a tap that closes it', () => {
    expect(BACKDROP_TAP.test('<PressableScale style={s.sheetBackdrop} onPress={handleClose} />')).toBe(true);
    expect(BACKDROP_TAP.test('<View style={s.sheetBackdrop} />')).toBe(false);
    expect(BACKDROP_TAP.test('<PressableScale style={s.sheetBackdrop} onPress={noop} />')).toBe(false);
  });
});
