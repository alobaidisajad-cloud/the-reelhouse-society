/**
 * theSocietyOpensOverYou.test.ts — the Society rises over the room; it does not
 * close it.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every rope in the app opened the Society page by dismissing the current
 * screen first whenever `router.canGoBack()` was true. That rule was written
 * for the log and the writing desk, which are PRESENTED — and UIKit will not
 * present a second modal over a first. But `canGoBack()` is also true of every
 * pushed screen. So a member who tapped "take a seat" in a salon had the salon
 * closed behind the Society, and came back to the corridor. Same on the
 * archive, same on the profile editor.
 *
 * The decision is now made on what the screen IS. These tests pin both
 * directions, and pin that the list of presented screens cannot drift from the
 * layout that actually presents them.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockCanGoBack = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    back: (...a: unknown[]) => mockBack(...a),
    push: (...a: unknown[]) => mockPush(...a),
    canGoBack: () => mockCanGoBack(),
  },
}));

// Below the router stand-in so it reads top to bottom; jest hoists the mock
// either way — the same arrangement ConciergeButton.test.tsx uses.
// eslint-disable-next-line import/first
import { MODAL_PATHS, isModalPath } from '@/src/constants/modalRoutes';
// eslint-disable-next-line import/first
import { noteCurrentPath, openSociety, societyHref } from '@/src/utils/openSociety';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

const HREF = societyHref('the-lounge', 'archivist', '/lounge/abc');

beforeEach(() => {
  jest.useFakeTimers();
  mockBack.mockReset();
  mockPush.mockReset();
  mockCanGoBack.mockReset().mockReturnValue(true);
  noteCurrentPath(null);
});
afterEach(() => jest.useRealTimers());

describe('the Society opens over you', () => {
  describe('from an ordinary screen', () => {
    it('does NOT close a salon behind the Society — the defect, exactly', () => {
      // History behind the salon, which is what fooled canGoBack().
      noteCurrentPath('/lounge/2b1c0f7e-1111-4111-8111-111111111111');
      openSociety(HREF);
      jest.runAllTimers();
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith(HREF);
    });

    it('nor the archive, nor the profile editor', () => {
      for (const path of ['/dispatch/archive', '/edit-profile', '/film/603', '/lounge']) {
        mockBack.mockReset(); mockPush.mockReset();
        noteCurrentPath(path);
        openSociety(HREF);
        jest.runAllTimers();
        expect(`${path} back=${mockBack.mock.calls.length} push=${mockPush.mock.calls.length}`)
          .toBe(`${path} back=0 push=1`);
      }
    });
  });

  describe('from a presented screen', () => {
    it('dismisses FIRST, then travels — never a modal presented over a modal', () => {
      noteCurrentPath('/log-modal');
      openSociety(HREF);
      // The push must not happen in the same tick as the dismissal.
      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
      jest.runAllTimers();
      expect(mockPush).toHaveBeenCalledWith(HREF);
    });

    it('the writing desk is presented too, though it is not under (modals)', () => {
      noteCurrentPath('/dispatch/compose');
      openSociety(HREF);
      jest.runAllTimers();
      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledTimes(1);
    });

    it('but never dismisses when there is nothing behind it to return to', () => {
      // A presented screen opened as the first thing on a cold start would
      // otherwise be dismissed into nothing, and the push would be lost with it.
      mockCanGoBack.mockReturnValue(false);
      noteCurrentPath('/log-modal');
      openSociety(HREF);
      jest.runAllTimers();
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith(HREF);
    });
  });

  it('before the path is known, it travels rather than dismissing a screen blind', () => {
    noteCurrentPath(null);
    openSociety(HREF);
    jest.runAllTimers();
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(HREF);
  });

  it('a trailing slash or a query does not turn a presented screen into a pushed one', () => {
    expect(isModalPath('/log-modal/')).toBe(true);
    expect(isModalPath('/membership?reason=the-vault')).toBe(true);
    expect(isModalPath('/lounge/abc')).toBe(false);
    expect(isModalPath('')).toBe(false);
  });

  it('the Society is told why they came and where they were', () => {
    expect(societyHref('the-vault', 'archivist')).toBe('/membership?reason=the-vault&rank=archivist');
    expect(societyHref('essays', 'auteur', '/dispatch/compose'))
      .toBe('/membership?reason=essays&rank=auteur&returnTo=%2Fdispatch%2Fcompose');
  });

  describe('the list of presented screens is the layout’s, not a copy of it', () => {
    it('matches every `presentation:` the root stack actually declares', () => {
      /**
       * A screen made modal in _layout.tsx and not added here would be treated
       * as pushed — and a rope on it would present the Society over a modal,
       * which is the iOS strand this whole mechanism exists to avoid. So the
       * list is derived from the layout and compared, both directions.
       */
      const layout = read('app/_layout.tsx');
      const declared = [...layout.matchAll(/<Stack\.Screen\s+name="([^"]+)"[^>]*presentation:\s*'([a-zA-Z]+)'/g)]
        .filter((m) => m[2] !== 'card')
        .map((m) => '/' + m[1].replace(/\([^)]+\)\//g, ''))
        .sort();
      // Tripwire: the scan must find the screens we know are presented, or an
      // empty list would "match" an empty list.
      expect(declared).toEqual(expect.arrayContaining(['/log-modal', '/membership', '/dispatch/compose']));
      expect(declared).toEqual([...MODAL_PATHS].sort());
    });
  });

  describe('there is one traveller', () => {
    it('the rope no longer decides for itself', () => {
      const hook = code(read('src/hooks/useClearance.ts'));
      expect(hook).toMatch(/openSociety\(societyHref\(featureId, rank, returnTo\)\)/);
      // The old rule, exactly. If it comes back, the salon closes again.
      expect(hook).not.toMatch(/router\.canGoBack\(\)/);
      expect(hook).not.toMatch(/router\.back\(\)/);
    });

    it('and neither does the refusal', () => {
      const door = code(read('src/utils/tierDoor.ts'));
      expect(door).toMatch(/openSociety\(societyHref\(/);
      expect(door).not.toMatch(/router\./);
    });

    it('the path is tracked by one component in the root layout', () => {
      const layout = code(read('app/_layout.tsx'));
      expect(layout).toMatch(/<PathTracker \/>/);
      expect(layout).toMatch(/noteCurrentPath\(pathname\)/);
    });
  });
});
