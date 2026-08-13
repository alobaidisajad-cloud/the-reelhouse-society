/**
 * textContrast.test.ts — the readable-text floor
 * ──────────────────────────────────────────────
 * Muted text in this app is a base colour drawn at partial opacity, and opacity
 * composites toward the background — so the opacity IS the contrast decision.
 * It was being made by eye, and it drifted badly in both pages audited so far:
 *
 *   Lobby  — three byte-identical copies of `sectionLoreSub` at 0.5 (2.44:1),
 *            below even the 3:1 WCAG allows for LARGE text, on 10pt italic.
 *   Reel   — the search glyph and the duplicate stacks count at 2.60 / 2.44,
 *            the end-of-feed marker and the inactive filter chips at 3.04.
 *
 * This holds a 3:1 floor for text on the surfaces listed below. Anything under
 * it must be named in EXCEPTIONS with a reason, so dropping a 0.4 italic into a
 * card is a failing test rather than something noticed on a bright screen six
 * months later.
 *
 * ── Why blocks with their own backgroundColor are skipped ──
 * Three times during these audits a sweep flagged text that turned out to be
 * fine, because it measured against ink when the text actually sits on its own
 * fill: the AUTEUR badge (ink on gold, 8.90:1), the CONFIDENTIAL stamp, and the
 * ABANDONED stamp. A style that paints its own background is measured against
 * that background, which this scan cannot resolve — so it is skipped rather
 * than guessed at. Verify those by hand when you touch them.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');

/** Surfaces that have been through a polish pass. Widen as pages land. */
const SURFACE = [
    'src/components/home',
    'src/components/reels',
    'src/components/feed',
    'src/components/darkroom',
    'src/components/auth',
    'app/(tabs)/index.tsx',
    'app/(tabs)/reels.tsx',
    'app/(tabs)/darkroom.tsx',
    'app/(modals)/login.tsx',
];

/** Styles that live apart from the components using them. */
const EXTRA_STYLE_FILES = ['src/theme/authStyles.ts'];

/** Text allowed under the floor, with why. */
const EXCEPTIONS: Record<string, string> = {
    lobbyFooterWhisper: 'closing flourish; decoration, held at 3.02:1 on purpose',
    posterEmptyMark: 'the ✦ drawn inside an empty poster frame — an ornament, not text',
    posterPlaceholder: 'the ✦ standing in for a missing rail poster — an ornament, not text',
    tickerDot: 'the ✦ separating titles on the wire ticker — an ornament, not text',
    posterPlaceholderGlyph: 'the ✦ above an undeveloped plate — an ornament over the title, and it sits on ash, not ink',
};

const INK: number[] = [0x0a, 0x09, 0x06];

const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const luminance = (c: number[]) => 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2]);
export function contrast(fg: number[], bg: number[]): number {
    const [l1, l2] = [luminance(fg), luminance(bg)];
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const over = (fg: number[], bg: number[], a: number) => fg.map((c, i) => c * a + bg[i] * (1 - a));
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** The palette, read from the theme so a colour change can never desync this. */
const PALETTE: Record<string, string> = {};
for (const m of fs
    .readFileSync(path.join(ROOT, 'src/theme/theme.ts'), 'utf8')
    .matchAll(/^\s*(\w+):\s*'(#[0-9A-Fa-f]{6})'/gm)) {
    PALETTE[m[1]] = m[2];
}

function filesUnder(target: string): string[] {
    const full = path.join(ROOT, target);
    if (!fs.existsSync(full)) return [];
    if (fs.statSync(full).isFile()) return [full];
    const out: string[] = [];
    for (const e of fs.readdirSync(full, { withFileTypes: true })) {
        if (e.isDirectory()) {
            if (e.name === '__tests__') continue;
            out.push(...filesUnder(path.join(target, e.name)));
        } else if (e.name.endsWith('.tsx')) out.push(path.join(full, e.name));
    }
    return out;
}

/** Brace-balanced so a nested object (shadowOffset) cannot truncate a block. */
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

type Row = { file: string; name: string; ratio: number; alpha: number; size: number };

function scan(): Row[] {
    const rows: Row[] = [];
    // login.tsx keeps its StyleSheet in src/theme/authStyles.ts, so scanning
    // only the component files would have missed the whole auth palette —
    // including the terms-of-service line, which measured 3.04:1.
    for (const target of [...SURFACE, ...EXTRA_STYLE_FILES]) {
        for (const file of filesUnder(target)) {
            const src = fs.readFileSync(file, 'utf8');
            for (const { name, body } of styleBlocks(src)) {
                if (/backgroundColor:/.test(body)) continue;      // see header note
                const cm = body.match(/(?<!background)(?<!border)(?<!shadow)\bcolor:\s*colors\.(\w+)/);
                // Ink ON ink would be invisible, so a style that paints text in
                // `ink` is by definition sitting on a fill — a badge, a stamp, a
                // pill — that this scan cannot resolve. Measuring it against ink
                // produced a 1.00:1 "failure" for the AUTEUR badge (really
                // 8.90:1), the LOGGED tick and the filter-count badge. The
                // colour itself is the tell, so it is a rule rather than three
                // hand-written exceptions.
                if (cm && cm[1] === 'ink') continue;
                const sm = body.match(/fontSize:\s*([0-9.]+)/);
                if (!cm || !sm || !PALETTE[cm[1]]) continue;
                const om = body.match(/opacity:\s*([0-9.]+)/);
                const alpha = om ? parseFloat(om[1]) : 1;
                rows.push({
                    file: path.relative(ROOT, file).split(path.sep).join('/'),
                    name,
                    alpha,
                    size: parseFloat(sm[1]),
                    ratio: contrast(over(hex(PALETTE[cm[1]]), INK, alpha), INK),
                });
            }
        }
    }
    return rows;
}

const rows = scan();
const ratioOf = (file: string, style: string) =>
    rows.find((r) => r.file.endsWith(file) && r.name === style)?.ratio;

describe('muted text stays readable', () => {
    it('the contrast maths is right', () => {
        expect(contrast(hex(PALETTE.fog), INK)).toBeCloseTo(6.68, 1);
        expect(contrast(over(hex(PALETTE.fog), INK, 0.5), INK)).toBeCloseTo(2.44, 1);
    });

    it('finds text at all (guards against the scan silently breaking)', () => {
        expect(rows.length).toBeGreaterThan(30);
    });

    it('no text on a polished surface sits under 3:1 unless named', () => {
        const offenders = rows
            .filter((r) => r.ratio < 3.0 && !(r.name in EXCEPTIONS))
            .map((r) => `${r.file} › ${r.name} @ ${r.alpha} = ${r.ratio.toFixed(2)}:1`);
        expect(offenders).toEqual([]);
    });

    it('the Lobby section lore clears AA for small text', () => {
        for (const f of ['SocialPulse.tsx', 'FeaturedCritique.tsx', 'FilmStripRow.tsx']) {
            expect(ratioOf(f, 'sectionLoreSub')).toBeGreaterThanOrEqual(4.5);
        }
    });

    // ── A fixed lineHeight is a ceiling the font can grow through ──
    // React Native does NOT scale `lineHeight` with Dynamic Type. So a style
    // with lineHeight/fontSize below the scaling cap will, at large accessibility
    // sizes, render glyphs taller than the line box holding them — clipped
    // descenders on the most prominent text in the app. adjustsFontSizeToFit does
    // not save it: that fits text to WIDTH and ignores lineHeight entirely.
    //
    // Found the hard way. heroTitle was fixed for this in the Darkroom pass, and
    // the same fault was then written back in thirty lines later on the new
    // undeveloped-negative plate. marqueeTitle (1.21) and cardTitle (1.26) had
    // been carrying it on pages already called finished.
    //
    // The rule: a style is safe only when the cap it DECLARES is <= its
    // lineHeight/fontSize ratio. With no cap the multiplier is unbounded, so a
    // fixed lineHeight is always a ceiling the font can grow through.
    //
    // The first version of this test asserted `ratio < 1.2` and passed while
    // cardTitle (ratio 1.26) sat uncapped — the comparison was backwards, and a
    // mutation run is what exposed it. Do not "simplify" this back to a ratio
    // threshold; the cap is the variable that matters.
    it('no display text can grow through its own line box', () => {
        const CAPS: Record<string, number> = {
            decorativeTextProps: 1,     // allowFontScaling: false
            displayTextProps: 1.2,
            scaledTextProps: 1.35,
        };
        const offenders: string[] = [];
        for (const target of SURFACE) {
            for (const file of filesUnder(target)) {
                const src = fs.readFileSync(file, 'utf8');
                // Styles may live in another file — login.tsx imports its whole
                // StyleSheet from authStyles.ts, so resolving only same-file
                // blocks would make this guard silently skip the auth screen
                // rather than check it.
                const styles = new Map([
                    ...styleBlocks(src),
                    ...EXTRA_STYLE_FILES.flatMap((f) =>
                        fs.existsSync(path.join(ROOT, f))
                            ? styleBlocks(fs.readFileSync(path.join(ROOT, f), 'utf8'))
                            : []
                    ),
                ].map((b) => [b.name, b.body] as [string, string]));

                // Walk each <Text …> tag so the cap is read from the SAME usage
                // that shrinks — a spread elsewhere in the file proves nothing.
                for (const tag of src.matchAll(/<(?:Animated\.)?Text([^>]*)>/g)) {
                    const attrs = tag[1];
                    if (!/adjustsFontSizeToFit/.test(attrs)) continue;

                    // EVERY style reference in the tag, not the first one. An
                    // earlier version matched only `style={s.name}` and was blind
                    // to `style={[s.a, cond && s.b]}` — four such usages exist on
                    // these surfaces, and any one of them could have grown a
                    // fixed lineHeight without this noticing.
                    const refs = [...attrs.matchAll(/\b(?:st|s|t)\.(\w+)\b/g)].map((m) => m[1]);
                    const declared = Object.keys(CAPS).find((k) => attrs.includes(k));
                    const cap = declared ? CAPS[declared] : Infinity;

                    for (const ref of new Set(refs)) {
                        const body = styles.get(ref);
                        if (!body) continue;
                        const fsz = body.match(/fontSize:\s*([0-9.]+)/);
                        const lh = body.match(/lineHeight:\s*([0-9.]+)/);
                        if (!fsz || !lh) continue;   // no fixed lineHeight == no ceiling

                        const ratio = parseFloat(lh[1]) / parseFloat(fsz[1]);
                        if (cap > ratio) {
                            offenders.push(
                                `${path.basename(file)} › ${ref} — line box holds ${ratio.toFixed(2)}x, ` +
                                `text may reach ${declared ?? 'UNCAPPED'}`
                            );
                        }
                    }
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it('the Darkroom text that was raised stays raised', () => {
        expect(ratioOf('DarkroomMoodBar.tsx', 'moodSub')).toBeGreaterThanOrEqual(4.5);
        expect(ratioOf('DarkroomFilterPanel.tsx', 'yearRangeDash')).toBeGreaterThanOrEqual(4.0);
        expect(ratioOf('darkroom.tsx', 'paginationRetrieving')).toBeGreaterThanOrEqual(4.5);
        expect(ratioOf('darkroom.tsx', 'emptySub')).toBeGreaterThanOrEqual(4.5);
    });

    it('the Reel text that was raised stays raised', () => {
        expect(ratioOf('ReelsCards.tsx', 'filterChipText')).toBeGreaterThanOrEqual(4.5);
        expect(ratioOf('ReelsFeedList.tsx', 'footerText')).toBeGreaterThanOrEqual(4.5);
        expect(ratioOf('AutopsyView.tsx', 'backFiledBy')).toBeGreaterThanOrEqual(4.5);
        expect(ratioOf('AutopsyView.tsx', 'stripTurn')).toBeGreaterThanOrEqual(4.5);
        expect(ratioOf('MemberRegistry.tsx', 'subtitle')).toBeGreaterThanOrEqual(4.5);
        expect(ratioOf('reels.tsx', 'emptySub')).toBeGreaterThanOrEqual(4.5);
    });
});
