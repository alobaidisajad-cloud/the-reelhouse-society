/**
 * authRouting.test.ts — a button must open the form it promises
 * ─────────────────────────────────────────────────────────────
 * `/login` opens the sign-IN form unless the route carries
 * `action: 'signup'`. Most callers want exactly that: they are "you must be
 * signed in to do that" gates, reached from a tap on a save or a log button.
 *
 * Two were not. The Lobby's "✦ SEEK ADMISSION ✦" and the Reel's
 * "✦ REQUEST MEMBERSHIP" are the app's two front doors for people who have no
 * account at all, and both pushed a bare '/login' — so the largest button on
 * each gate asked a brand-new visitor to identify themselves as an existing
 * member, and the real signup sat behind a small link at the bottom of that
 * form. The Reel's copy makes it plainest: "Join the Society to access The
 * Reel", over a button that opened sign-in.
 *
 * The second one was found only because the first fix prompted a sweep of every
 * caller — the instance was fixed a full page before the class was.
 *
 * This scans the source for tappables whose LABEL promises membership and
 * checks the route beneath each one, so a third gate cannot quietly repeat it.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');
const SCAN = ['app', 'src'];

/** Copy that offers to create an account, rather than to sign in. */
const PROMISES_MEMBERSHIP = /SEEK ADMISSION|REQUEST MEMBERSHIP|REQUEST ADMISSION|JOIN THE SOCIETY/i;

/** Copy that correctly means "sign in" — these must NOT carry action:signup. */
const PROMISES_SIGN_IN = /IDENTIFY YOURSELF|ALREADY A MEMBER/i;

function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === '__tests__') continue;
            walk(full, out);
        } else if (e.name.endsWith('.tsx')) out.push(full);
    }
    return out;
}

/**
 * Every tappable, with the copy inside it.
 *
 * Not just PressableScale. Every /login route in the app happens to use that
 * one today, so scanning only for it would pass — but Pressable appears in
 * eleven files, and a future gate written with it would slip past this guard
 * silently. The alternation lists PressableScale first so the \b does not
 * truncate it.
 */
const TAPPABLES = ['PressableScale', 'Pressable', 'TouchableOpacity', 'TouchableHighlight'];

function tappables(src: string): { block: string }[] {
    const out: { block: string }[] = [];
    const re = new RegExp(`<(${TAPPABLES.join('|')})\\b`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
        const end = src.indexOf(`</${m[1]}>`, m.index);
        if (end === -1) continue;
        out.push({ block: src.slice(m.index, end) });
    }
    return out;
}

const files = SCAN.flatMap((d) => walk(path.join(ROOT, d)));

describe('a gate opens the form its label promises', () => {
    it('finds tappables at all (guards against the scan silently breaking)', () => {
        const total = files.reduce((n, f) => n + tappables(fs.readFileSync(f, 'utf8')).length, 0);
        expect(total).toBeGreaterThan(20);
    });

    it('every membership CTA routes to signup', () => {
        const offenders: string[] = [];
        for (const file of files) {
            const src = fs.readFileSync(file, 'utf8');
            for (const { block } of tappables(src)) {
                if (!PROMISES_MEMBERSHIP.test(block)) continue;
                if (!/['"]\/login['"]|pathname:\s*['"]\/login['"]/.test(block)) continue;  // not a login route
                if (!/action:\s*['"]signup['"]/.test(block)) {
                    offenders.push(`${path.relative(ROOT, file).split(path.sep).join('/')} — promises membership, opens sign-in`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it('sign-in CTAs are not accidentally routed to signup', () => {
        const offenders: string[] = [];
        for (const file of files) {
            const src = fs.readFileSync(file, 'utf8');
            for (const { block } of tappables(src)) {
                if (!PROMISES_SIGN_IN.test(block)) continue;
                if (!/['"]\/login['"]|pathname:\s*['"]\/login['"]/.test(block)) continue;
                if (/action:\s*['"]signup['"]/.test(block)) {
                    offenders.push(`${path.relative(ROOT, file).split(path.sep).join('/')} — says sign in, opens signup`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});
