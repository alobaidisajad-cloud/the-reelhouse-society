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
 *   • AppState         — a global overlay with no screen of its own (FilmGrainOverlay)
 *   • an isActive / paused / isVisible prop — a child whose parent knows better
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');
const SCAN_DIRS = ['src', 'app'];

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

    // Loading placeholders. They unmount the moment data arrives, so the loop is
    // bounded by the fetch rather than by the session. Worth parking eventually,
    // but not a session-length leak.
    'src/components/SkeletonPulse.tsx': 'transient — unmounts when data lands',
    'src/components/SkeletonShimmer.tsx': 'transient — unmounts when data lands',

    // ── Pending their own page's polish pass ──────────────────────────────
    // Each is a genuine session-length loop. They are scheduled with the page
    // they live on; delete the entry when that page is polished.
    'src/components/darkroom/DarkroomCards.tsx': 'pending Darkroom polish',
    'src/components/darkroom/DarkroomHeader.tsx': 'pending Darkroom polish',
    'src/components/dispatch/NightlyTransmission.tsx': 'pending Dispatch polish',
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

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
            walk(full, out);
        } else if (entry.name.endsWith('.tsx')) {
            out.push(full);
        }
    }
    return out;
}

/** `withRepeat(x, -1, ...)` — the `-1` is what makes it run forever. */
function hasInfiniteRepeat(src: string): boolean {
    if (!src.includes('withRepeat')) return false;
    return /(^|,)\s*-1\s*[,)]/m.test(src);
}

/** Any of the four sanctioned ways to stop a loop when nobody is watching. */
function hasPauseMechanism(src: string): boolean {
    return /useIsFocused|useFocusEffect|AppState|isActive|paused|isVisible/.test(src);
}

const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
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
});
