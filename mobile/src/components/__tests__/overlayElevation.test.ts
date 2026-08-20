/**
 * overlayElevation.test.ts — an overlay must out-rank what it covers
 * ──────────────────────────────────────────────────────────────────
 * On iOS, siblings paint in JSX order: a gradient written after a card sits on
 * top of it. On ANDROID they paint in ELEVATION order, so a card with
 * `elevation: 8` covers a later sibling that declares none — and an overlay
 * meant to soften an edge simply does not exist on that platform.
 *
 * It is a silent failure. Nothing errors, nothing looks wrong in a simulator,
 * and the effect is missing only on the platform you were not looking at.
 *
 * Found the hard way, twice. The Darkroom's mood-row fade shipped invisible on
 * Android because moodCard spreads effects.shadowSurface (elevation: 10). The
 * Lounge's salon-strip fade then repeated it against cards at elevation 8 — the
 * second only caught while auditing the first.
 *
 * The rule: an absolutely-positioned overlay declares an elevation. What it
 * covers is a sibling relationship this scan cannot see, so it does not try to
 * guess the right NUMBER — it only insists the author thought about it.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');
const SCAN = ['src/components', 'src/theme', 'app'];

/** Style names that describe a covering layer rather than content. */
const OVERLAY = /(Fade|Scrim|Overlay|Veil)$/;

/**
 * Overlays that need no elevation, with the reason CHECKED rather than assumed.
 * The precise rule is "out-rank your elevated siblings", which a file-level scan
 * cannot evaluate — so the test asks for an elevation and these record why one
 * is unnecessary. Do not add to this list without looking at the siblings.
 */
const EXEMPT: Record<string, string> = {
    // VERIFIED in the Stacks pass, 2026-08-20. app/stacks/[id].tsx declares NO
    // elevation anywhere — grep it — and navScrim's only sibling inside navBar
    // is navInner, the row holding the back arrow and the owner's actions.
    // Neither is elevated, so paint order falls through to JSX order: the scrim
    // is written first and the controls sit on top of it, which is the whole
    // point. Elevating it would raise the ground above the things standing on
    // it — the same reason the composer's chromeScrim is exempt below.
    navScrim: 'a backdrop, and its only sibling is the button row it sits behind',
    joinedNameOverlay: 'sits among images and gradients inside the salon card — no elevated sibling',
    videoPlayOverlay: 'nothing in FilmMediaCarousel declares an elevation',
    topFade: 'nothing in ProfileBackdrop declares an elevation',
    // VERIFIED in the Person pass, 2026-08-15. The two elevated styles in
    // personStyles.ts (portraitGlow, auteurHuntMastery) live in entirely
    // different subtrees. defOverlay's only siblings inside defPosterWrap are
    // the poster Image and nothing else — neither carries elevation — so paint
    // order falls through to JSX order and the overlay sits on top on both
    // platforms. Safe as written.
    defOverlay: 'verified: its only sibling is the poster, and neither is elevated',
    // VERIFIED in the composer pass. LogAtmosphere.tsx: chromeScrim's siblings
    // inside the `film` layer are the blurred Image, the main fade and the
    // texture view — none declares an elevation, so paint order falls through
    // to JSX order on both platforms and it lands where it is written.
    //
    // It also must NOT be elevated. This layer is a BACKDROP: the whole point is
    // that it sits beneath the chrome and the document. Giving it an elevation
    // would raise it above its siblings on Android — the exact inversion this
    // test exists to prevent, applied backwards.
    chromeScrim: 'verified: a backdrop layer — no elevated siblings, and must stay beneath the sheet',
};

function walk(dir: string, out: string[] = []): string[] {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === '__tests__') continue;
            walk(full, out);
        } else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) {
            out.push(full);
        }
    }
    return out;
}

/** Brace-balanced so a nested object cannot truncate a block. */
function styleBlocks(src: string): { name: string; body: string }[] {
    const blocks: { name: string; body: string }[] = [];
    const re = /(\w+):\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
        let depth = 1;
        let i = re.lastIndex;
        while (i < src.length && depth > 0) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') depth--;
            i++;
        }
        blocks.push({ name: m[1], body: src.slice(re.lastIndex, i - 1) });
    }
    return blocks;
}

const files = SCAN.flatMap((d) => walk(path.join(ROOT, d)));

describe('absolute overlays declare an elevation', () => {
    const overlays: { file: string; name: string; body: string }[] = [];
    for (const file of files) {
        const src = fs.readFileSync(file, 'utf8');
        for (const { name, body } of styleBlocks(src)) {
            if (!OVERLAY.test(name)) continue;
            if (!/position:\s*'absolute'/.test(body)) continue;
            overlays.push({ file: path.relative(ROOT, file).split(path.sep).join('/'), name, body });
        }
    }

    it('finds the overlays at all (guards against the scan silently breaking)', () => {
        expect(overlays.length).toBeGreaterThan(0);
    });

    it('every one sets elevation, so Android cannot paint content over it', () => {
        // Comments are stripped FIRST. The first version of this check matched
        // `elevation:` anywhere in the block — including inside the comments
        // explaining why the elevation was added ("joinedCard sits at
        // elevation 8"). It passed on a fade whose elevation had been deleted,
        // because the prose describing the fix satisfied the test. A mutation
        // run is the only reason that was caught.
        const declaresElevation = (body: string) =>
            /elevation:\s*\d+/.test(body.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''));

        const offenders = overlays
            .filter((o) => !declaresElevation(o.body) && !(o.name in EXEMPT))
            .map((o) => `${o.file} › ${o.name} — absolute overlay with no elevation`);
        expect(offenders).toEqual([]);
    });
});
