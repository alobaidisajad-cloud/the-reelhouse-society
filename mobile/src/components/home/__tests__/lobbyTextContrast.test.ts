/**
 * lobbyTextContrast.test.ts — the Lobby's readable-text floor
 * ───────────────────────────────────────────────────────────
 * `colors.fog` is the muted-text colour, and almost every use of it is drawn at
 * partial opacity. Opacity composites toward the background, so the opacity IS
 * the contrast decision — and it was being made by eye.
 *
 * Three Lobby sections (SocialPulse, FeaturedCritique, FilmStripRow) each held a
 * byte-identical copy of `sectionLoreSub` at opacity 0.5, which measures 2.44:1
 * on ink: below even the 3:1 floor WCAG allows for LARGE text, on 10pt italic.
 * Those lines say what each section is, so they are content, and they now sit at
 * 0.8 (4.59:1, clears AA for small text).
 *
 * This test holds the floor at 3:1 for any fog TEXT on the Lobby surface.
 * Decoration may sit below it, but only by being named in EXCEPTIONS with a
 * reason, so dropping a 0.4 italic into a section is a failing test rather than
 * a thing someone notices on a bright screen six months from now.
 *
 * Deliberately NOT applied app-wide yet: the same pattern exists on other pages
 * (search, profile, reels, list-modal) and each is scheduled with its own polish
 * pass. Widen the SURFACE list as those land.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const SURFACE = ['src/components/home', 'app/(tabs)/index.tsx'];

/** Text that is allowed under the floor, with why. */
const EXCEPTIONS: Record<string, string> = {
    // The closing flourish under the footer mark. Decoration, not content, and
    // the footer is built around a fade to black — 0.6 = 3.02:1, deliberately
    // legible-but-quiet rather than prominent.
    'lobbyFooterWhisper': 'closing flourish; decoration, held at 3.02:1 on purpose',
};

const INK: [number, number, number] = [0x0a, 0x09, 0x06];
const FOG: [number, number, number] = [0x9e, 0x94, 0x88];

const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]: number[]) =>
    0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

export function contrast(fg: number[], bg: number[]): number {
    const [l1, l2] = [luminance(fg), luminance(bg)];
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
/** Opacity composites toward the background before contrast is measured. */
const over = (fg: number[], bg: number[], a: number) => fg.map((c, i) => c * a + bg[i] * (1 - a));

const fogRatioAt = (alpha: number) => contrast(over(FOG, INK, alpha), INK);

function filesUnder(target: string): string[] {
    const full = path.join(ROOT, target);
    if (!fs.existsSync(full)) return [];
    if (fs.statSync(full).isFile()) return [full];
    const out: string[] = [];
    for (const e of fs.readdirSync(full, { withFileTypes: true })) {
        if (e.isDirectory()) {
            if (e.name === '__tests__') continue;
            out.push(...filesUnder(path.join(target, e.name)));
        } else if (e.name.endsWith('.tsx')) {
            out.push(path.join(full, e.name));
        }
    }
    return out;
}

/** Pull out `name: { ... }` style blocks, brace-balanced so nested objects
 *  (shadowOffset) do not truncate the block early. */
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

const offenders: { file: string; name: string; alpha: number; ratio: number }[] = [];
for (const target of SURFACE) {
    for (const file of filesUnder(target)) {
        const src = fs.readFileSync(file, 'utf8');
        for (const { name, body } of styleBlocks(src)) {
            if (!/color:\s*colors\.fog/.test(body)) continue;
            const om = body.match(/opacity:\s*([0-9.]+)/);
            if (!om) continue; // no opacity == fully opaque, 6.68:1
            const alpha = parseFloat(om[1]);
            const ratio = fogRatioAt(alpha);
            if (ratio < 3.0 && !(name in EXCEPTIONS)) {
                offenders.push({ file: path.relative(ROOT, file), name, alpha, ratio });
            }
        }
    }
}

describe('Lobby muted text stays readable', () => {
    it('the contrast maths is right (fog on ink, fully opaque)', () => {
        expect(contrast(FOG, INK)).toBeCloseTo(6.68, 1);
    });

    it('opacity composites before measuring — 0.5 really is 2.44:1', () => {
        expect(fogRatioAt(0.5)).toBeCloseTo(2.44, 1);
        expect(fogRatioAt(0.8)).toBeCloseTo(4.59, 1);
    });

    it('finds fog text at all (guards against the scan silently breaking)', () => {
        const seen = SURFACE.flatMap(filesUnder).filter((f) =>
            /color:\s*colors\.fog/.test(fs.readFileSync(f, 'utf8'))
        );
        expect(seen.length).toBeGreaterThan(2);
    });

    it('no fog text on the Lobby sits under 3:1 unless named', () => {
        expect(offenders).toEqual([]);
    });

    it('the section lore lines specifically clear AA for small text', () => {
        for (const f of ['SocialPulse.tsx', 'FeaturedCritique.tsx', 'FilmStripRow.tsx']) {
            const src = fs.readFileSync(path.join(ROOT, 'src/components/home', f), 'utf8');
            const block = styleBlocks(src).find((b) => b.name === 'sectionLoreSub');
            expect(block).toBeDefined();
            const alpha = parseFloat(block!.body.match(/opacity:\s*([0-9.]+)/)![1]);
            expect(fogRatioAt(alpha)).toBeGreaterThanOrEqual(4.5);
        }
    });
});
