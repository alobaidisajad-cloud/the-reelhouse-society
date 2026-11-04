/**
 * animation-parking.test.ts — the looping-animation contract
 * ──────────────────────────────────────────────────────────
 * A `withRepeat(..., -1, ...)` runs until the component unmounts. Screens in a
 * tab navigator do NOT unmount when you switch tabs, so an unparked infinite
 * loop keeps driving the UI thread for the rest of the session, on a tab nobody
 * is looking at. Battery and jank, invisibly.
 *
 * This has been fixed component-by-component three times now (MarqueeBoard,
 * PulseCardItem, FilmTicker, Buster, ShimmerRule...) and each time the NEXT one
 * was missed, because the fix chased the instances instead of the class. So the
 * enumeration lives here as a test: every infinite loop must either park, or be
 * named below with a reason.
 *
 * To park a component, use whichever fits:
 *   • useIsFocused()   — a screen or a component owned by one
 *   • useFocusEffect() — same, effect-shaped (ProjectorBeam)
 *   • AppState         — a global overlay with no screen of its own
 *   • an isActive / paused / isVisible prop — a child whose parent knows better
 *
 * ── KNOWN BLIND SPOT — read before trusting a pass ──
 * This scan is FILE-level. It can prove a file contains no pause mechanism at
 * all; it cannot prove that each individual loop uses the one it finds. A file
 * that imports useFocusEffect for something unrelated reads as clean even if
 * its animation is ungated.
 *
 * That is not hypothetical. app/(tabs)/darkroom.tsx passed this test for its
 * entire life while its skeleton pulse ran with `[]` deps and cancelled only on
 * unmount — which a tab screen never does — because the file happened to import
 * useFocusEffect to reset a scroll bridge. The leak sat inside a green test.
 *
 * So: a pass here means "nothing is obviously unparked", not "every loop is
 * parked". When you touch a file with an infinite animation, read the effect.
 */
import fs from 'fs';
import path from 'path';
import { files as universe } from '@/test-utils/universe';

const ROOT = path.join(__dirname, '..', '..', '..');

/**
 * Components with an infinite loop that does NOT park yet, each with the reason
 * it is tolerated. This list may only ever SHRINK — the stale-entry test below
 * fails if a component here has since been parked, so polishing a page forces
 * its entries off the list rather than letting them rot.
 */
const KNOWN_UNPARKED: Record<string, string> = {
    // Renders once at cold start, ABOVE the navigator in app/_layout.tsx —
    // useIsFocused() would throw there (no navigation context). Honours reduce
    // motion and unmounts itself when the app is ready. Correct as-is.
    'src/components/Preloader.tsx': 'mounts outside the navigator; one-shot, self-unmounting',

    // ── Pending their own page's polish pass ──────────────────────────────
    // Each is a genuine session-length loop. They are scheduled with the page
    // they live on; delete the entry when that page is polished.
    'src/components/log/LogSearchEngine.tsx': 'pending Log-modal polish',
    'src/components/person/PersonOrnaments.tsx': 'pending Person polish',
    'src/components/profile/NitrateCalendarGrid.tsx': 'pending Profile polish',
    'src/components/profile/ProfileArchiveTab.tsx': 'pending Profile polish',
    'src/components/profile/ProfileLedgerTab.tsx': 'pending Profile polish',
    'src/components/profile/ProfileListsTab.tsx': 'pending Profile polish',
    'src/components/profile/ProfilePhysicalTab.tsx': 'pending Profile polish',
    'src/components/profile/ProfileTriptych.tsx': 'pending Profile polish',
    'src/components/profile/ProfileWatchlistTab.tsx': 'pending Profile polish',
    'src/features/settings/SettingsScreen.tsx': 'pending Settings polish',
};

/** `withRepeat(x, -1, ...)` — the `-1` is what makes it run forever. */
function hasInfiniteRepeat(src: string): boolean {
    if (!src.includes('withRepeat')) return false;
    return /(^|,)\s*-1\s*[,)]/m.test(src);
}

/**
 * Any of the four sanctioned ways to stop a loop when nobody is watching; a
 * hook takes the focus as `isFocused` from the screen that owns it.
 */
function hasPauseMechanism(src: string): boolean {
    return /useIsFocused|useFocusEffect|AppState|isActive|paused|isVisible|\bisFocused\b/.test(src);
}

const files = universe('appCode');
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join('/');
const looping = files.filter((f) => hasInfiniteRepeat(fs.readFileSync(f, 'utf8')));

describe('infinite animations park when nobody is watching', () => {
    it('finds the looping components at all (guards against the scan silently breaking)', () => {
        expect(looping.length).toBeGreaterThan(10);
    });

    it('every infinite loop either parks or is a named exception', () => {
        const offenders = looping
            .filter((f) => !hasPauseMechanism(fs.readFileSync(f, 'utf8')))
            .map(rel)
            .filter((r) => !(r in KNOWN_UNPARKED));

        expect(offenders).toEqual([]);
    });

    it('no stale exceptions — a component that now parks must leave the list', () => {
        const stale = Object.keys(KNOWN_UNPARKED).filter((r) => {
            const full = path.join(ROOT, r);
            if (!fs.existsSync(full)) return true; // deleted or renamed
            const src = fs.readFileSync(full, 'utf8');
            return hasInfiniteRepeat(src) && hasPauseMechanism(src);
        });

        expect(stale).toEqual([]);
    });

    it('the Lobby, which has been polished, has no unparked loops left', () => {
        const lobbySurface = looping
            .map(rel)
            .filter((r) => r.startsWith('src/components/home/') || r === 'app/(tabs)/index.tsx');

        const unparked = lobbySurface.filter(
            (r) => !hasPauseMechanism(fs.readFileSync(path.join(ROOT, r), 'utf8'))
        );

        expect(unparked).toEqual([]);
    });

    // Named individually rather than by file, because the file-level scan above
    // is exactly what missed the Darkroom skeleton for so long. Each of these
    // is a loop that was verified by reading the effect, not by grepping.
    // The redesign took the loops out: the tiles are still while the sheet develops, and the
    // safelight is a picture. Nothing in the room may loop again.
    it('the Darkroom and the Lounge loop nothing', () => {
        const rooms = [
            'app/(tabs)/darkroom.tsx', 'app/(tabs)/lounge.tsx',
            ...['DarkroomCards', 'DarkroomFilterPanel', 'DarkroomHeader', 'DarkroomHero', 'DarkroomMoodBar', 'DarkroomStates'].map((f) => `src/components/darkroom/${f}.tsx`),
            ...['JoinedLoungeCard', 'PublicLoungeCard', 'LoungeHeader', 'EmptyMyLounges', 'LoungeGate'].map((f) => `src/components/lounge/${f}.tsx`),
            'src/components/atmosphere/HungLight.tsx',
        ];
        expect(rooms.length).toBeGreaterThan(13);
        const looping = rooms.filter((f) => /withRepeat\(|Animated\.loop\(/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
        expect(looping).toEqual([]);
    });
});
