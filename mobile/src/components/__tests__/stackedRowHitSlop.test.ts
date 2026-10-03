/**
 * stackedRowHitSlop.test.ts — neighbours must not steal each other's taps.
 *
 * Where two touch areas (box + hitSlop) overlap, both platforms give the touch
 * to the LATER sibling: iOS walks subviews in reverse (RCTViewComponentView.mm,
 * `reverseObjectEnumerator`), Android from the last child down
 * (TouchTargetHelper.kt). So on the axis where two controls are neighbours,
 * each may claim at most HALF the real gap between them.
 *
 * Most controls are MEASURED where the tests draw them: mockups/tools/layout.cjs
 * and the CI capture job call an overlap a STEAL. RULES holds only what no
 * render draws beside its neighbour, each saying why; MEASURED_NOW keeps the
 * moved rules' files in mockups/touch-measured.txt.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { readCode } from '@/test-utils/readCode';

const ROOT = join(__dirname, '..', '..', '..');

type Axis = 'x' | 'y';
type Side = 'top' | 'bottom' | 'left' | 'right';
interface Rule {
  file: string;
  style: string;
  /** The measured gap between neighbours, per axis. Absent = no neighbour there. */
  gap: Partial<Record<Axis, number>>;
  /** The sides that have a neighbour, when the others face open space. */
  only?: Side[];
  /** Keys the rule when the control has no style prop to match on. */
  match?: string;
  note: string;
}

/** Each `gap` is read from the stylesheet: a container gap, a margin, a divider. */
const RULES: Rule[] = [
  // Not drawn beside a neighbour: the thumbnails appear once the TMDB images
  // arrive, which the composer's drawings do not wait for.
  { file: 'src/components/log/LogForm.tsx', style: 'pThumb', gap: { x: 8 },
    note: 'poster thumbs, list gap 8 — Curatorial Control moved to the docket' },
  // Not drawn: the calendar opens from CHANGE, which no drawing presses.
  { file: 'src/components/NitrateCalendar.tsx', style: 'dayCell', gap: { x: 0, y: 2 },
    note: 'date grid: columns flush, dayRow marginBottom 2' },
  // Not drawn: the Lounge's owner panels.
  { file: 'src/components/lounge/AtTheDoorPanel.tsx', style: 'declineBtn', gap: { x: 10, y: 22 },
    note: 'DECLINE beside ADMIT, row gap 10; rows 11+11 apart' },
  { file: 'src/components/lounge/AtTheDoorPanel.tsx', style: 'admitBtn', gap: { x: 10, y: 22 },
    note: 'ADMIT beside DECLINE' },
  { file: 'src/components/lounge/LoungeSettingsPanel.tsx', style: 'memberAction', gap: { x: 8 },
    note: 'mute/ban pair, actionRow gap 8' },
  { file: 'src/components/lounge/ActionSheet.tsx', style: 'actionBtn', gap: { y: 0 },
    note: 'REPLY / COPY / REPORT / BLOCK, hairline apart' },
  // Drawn, but behind the sheet's entrance fade — the audit skips what cannot
  // yet be seen, and the rows are drawn at their first frame.
  { file: 'src/components/layout/ConciergeButton.tsx', style: 'actionRow', gap: { y: 0 },
    note: 'Log a Film / Curate a Stack, hairline apart' },
  // Partly: SAVE is drawn (a visitor's deck); EDIT is the owner's, which no
  // drawing of the record shows.
  { file: 'src/components/log/LogActionDeck.tsx', style: 'deckBtn', gap: { x: 0 },
    note: 'four flex:1 actions, flush' },
  // Not drawn beside a neighbour: the member's own desk (it is theirs alone).
  { file: 'app/user/[username].tsx', style: 'deskRow', gap: { y: 0 },
    note: 'the desk, hairline apart' },
  // Not drawn: the triptych's film search, inside its sheet.
  { file: 'src/components/profile/ProfileTriptych.tsx', style: 'resultItem', gap: { y: 8 },
    note: 'film search results, marginBottom 8 — a mis-tap pins the wrong film' },
  { file: 'src/components/profile/AvatarCropSheet.tsx', style: 'actionCard', gap: { x: 16 },
    note: 'camera / library, gap 16' },
  // Not drawn: the admin screen's case actions.
  { file: 'app/(admin)/tribunal.tsx', style: 'actionBtn', gap: { x: 8, y: 8 },
    note: 'DISMISS / BAN / PERMANENT EXILE' },
  // Partly: the bar's disc is drawn beside the Lounge key; its twin, inside the
  // open sheet, stands alone in its layer.
  { file: 'src/components/layout/ConciergeButton.tsx', style: 'discShadow', gap: { x: 6 }, only: ['right'],
    note: 'brass ＋ has the Lounge key 6pt to its RIGHT; open screen edge to its left' },
  // The one critique row, for logs and stacks: its foot control (WITHDRAW or
  // REPORT) and the NEXT critique's byline face each other across the hairline,
  // 14pt of padding each side of it.
  { file: 'src/components/critique/CritiqueRow.tsx', style: 'commActionBtn', gap: { y: 28 }, only: ['bottom'],
    note: 'WITHDRAW / REPORT, 28pt above the next byline — a mis-press opens the wrong member' },
  { file: 'src/components/critique/CritiqueRow.tsx', style: 'commentByline', gap: { y: 28 }, only: ['top'],
    note: 'the byline, 28pt below the last critique’s WITHDRAW / REPORT' },
  // Not drawn: the share sheet is a stand-in wherever it would open.
  { file: 'src/components/ShareToLoungeModal.tsx', match: 'LOUNGE_SLOP', gap: { y: 6 }, style: '(lounge rows)',
    note: 'loungeItem marginBottom 6 — the later row wins, so the film went to the wrong room' },
  // Not drawn: the notices sheet.
  { file: 'app/(modals)/notifications-modal.tsx', match: 'HITSLOP_DISMISS', gap: { x: 20, y: 20 }, style: '(dismiss, inside the row)',
    note: 'a CHILD of the notice row: 28pt control, 10 per side reaches the 48dp floor and no further' },
];

/**
 * Rules now measured by the capture job, which fails when a file in
 * mockups/touch-measured.txt stops being measured. Dropping one takes a
 * deletion there, and one here.
 */
const MEASURED_NOW: [file: string, what: string][] = [
  ['src/components/log/AuteurToolkit.tsx', 'the autopsy notches, 2pt apart'],
  ['src/components/moderation/ContentActionSheet.tsx', 'moderation options, hairline apart'],
  ['src/components/feed/ActionDeck.tsx', 'the card deck, four flush'],
  ['app/stacks/[id].tsx', 'the stack action bar'],
  ['src/components/dispatch/paper/PaperCritiques.tsx', 'the reader’s docked marks'],
  ['src/components/dispatch/paper/PaperPost.tsx', 'the stamp bar under every entry'],
  ['app/user/[username].tsx', 'holdings, LATELY, the two acts, the link chips'],
  ['src/components/profile/ProfileHelpers.tsx', 'the four figures'],
  ['src/components/profile/ProfileTriptych.tsx', 'the altarpiece panels and the plate sheet'],
  ['src/components/profile/ProfileListsTab.tsx', 'the stack grid'],
  ['src/components/reels/ReelsHeader.tsx', 'the two tabs'],
  ['app/dispatch/compose.tsx', 'the writing room’s toolbar'],
  ['src/components/profile/Achievements.tsx', 'the badge grid'],
  ['src/components/darkroom/DarkroomMoodBar.tsx', 'the mood strip'],
  ['src/components/log/LogSearchEngine.tsx', 'the composer’s search results'],
  ['src/components/moderation/ReportSheet.tsx', 'the report reasons'],
];

/** TopNavBar's icons are an Animated Pressable, which the scanner cannot see: checked apart. */
const NAV_CLUSTER_GAP = 6;

const AXIS_SIDES: Record<Axis, [string, string]> = { x: ['left', 'right'], y: ['top', 'bottom'] };

/** Walks the tag tracking brace depth, so `() =>` cannot end it early. */
function scanTags(src: string, name: string) {
  const out: { attrs: string; line: number }[] = [];
  const open = `<${name}`;
  let i = 0;
  while ((i = src.indexOf(open, i)) !== -1) {
    const after = src[i + open.length];
    if (after && /[A-Za-z0-9_]/.test(after)) { i += open.length; continue; }
    let depth = 0, j = i + open.length, inStr: string | null = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (inStr) { if (c === inStr && src.charCodeAt(j - 1) !== 92) inStr = null; continue; }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    out.push({ attrs: src.slice(i + open.length, j), line: src.slice(0, i).split('\n').length });
    i = j;
  }
  return out;
}

/** Brace-matches the style value out — these styles are often the 2nd array entry. */
function styleValue(attrs: string) {
  const at = attrs.indexOf('style=');
  if (at === -1) return '';
  const k = attrs.indexOf('{', at);
  if (k === -1) return '';
  let depth = 0;
  for (let j = k; j < attrs.length; j++) {
    if (attrs[j] === '{') depth++;
    else if (attrs[j] === '}') { depth--; if (depth === 0) return attrs.slice(k, j + 1); }
  }
  return '';
}

/**
 * The slop as written, 15 for a side left out. PressableScale drops that
 * default on an axis 48pt or more, so this can read high, never low. A named
 * constant (`hitSlop={ROW_SLOP}`) is followed to its declaration in `src`.
 */
function effectiveSlop(attrs: string, src = ''): Record<string, number> {
  const m = attrs.match(/hitSlop=\{([\s\S]*?)\}\s*(?:[\w[]|\/?>|$)/);
  const sides = { top: 15, bottom: 15, left: 15, right: 15 };
  if (!m) return sides;                                  // no prop at all
  let body = m[1];
  const named = body.match(/^\s*([A-Z_][A-Z0-9_]*)\s*$/);
  if (named) {
    const decl = src.match(new RegExp(`\\b${named[1]}\\s*=\\s*\\{([^}]*)\\}`));
    // An unresolvable constant must NOT quietly read as the default — that is
    // a pass for a control nobody measured.
    if (!decl) throw new Error(`hitSlop constant ${named[1]} could not be resolved`);
    body = decl[1];
  }
  if (/^\s*null\s*$/.test(body)) return { top: 0, bottom: 0, left: 0, right: 0 };
  const num = body.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  if (num) { const v = Number(num[1]); return { top: v, bottom: v, left: v, right: v }; }
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    const s = body.match(new RegExp(side + '\\s*:\\s*(\\d+(?:\\.\\d+)?)'));
    if (s) sides[side] = Number(s[1]);                   // omitted sides KEEP 15
  }
  return sides;
}

describe('the rules that moved to measurement stay measured', () => {
  const required = new Set(readFileSync(join(ROOT, 'mockups/touch-measured.txt'), 'utf8')
    .split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));

  it.each(MEASURED_NOW)('%s — %s', (file) => {
    expect(required.has(file)).toBe(true);
  });
});

describe('neighbouring controls do not overlap each other’s touch targets', () => {
  for (const rule of RULES) {
    const label = `${rule.file} :: ${rule.style}`;

    it(`${label} — slop ≤ half the gap (${rule.note})`, () => {
      const src = readCode(rule.file);
      // Most controls are found by their style name. A row that carries no
      // style at all — the critique wrapper is a bare PressableScale around a
      // styled View — is keyed on `match` against the whole tag instead.
      const nameRe = new RegExp(`\\b${rule.match ?? rule.style}\\b`);
      const tags = scanTags(src, 'PressableScale')
        .filter((t) => nameRe.test(rule.match ? t.attrs : styleValue(t.attrs)));

      // A rule that matches nothing would pass while proving nothing.
      expect(tags.length).toBeGreaterThan(0);

      const offenders: string[] = [];
      for (const t of tags) {
        const slop = effectiveSlop(t.attrs, src);
        for (const [axis, gap] of Object.entries(rule.gap) as [Axis, number][]) {
          const budget = gap / 2;
          for (const side of AXIS_SIDES[axis]) {
            if (rule.only && !rule.only.includes(side as Side)) continue;
            if (slop[side] > budget) {
              offenders.push(
                `L${t.line} ${side}=${slop[side]} exceeds ${budget} (gap ${gap} on ${axis}) — ` +
                `overlaps its neighbour by ${(slop[side] * 2 - gap).toFixed(1)}pt`
              );
            }
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});

const SWEEP_DIRS = ['src/components/profile', 'src/features/profile'];
const SWEEP_EXTRA = ['app/user/[username].tsx'];

/**
 * THE SWEEP. RULES checks only what someone listed; this checks every control
 * drawn inside a `.map(` on the member file. Such a control has a copy of itself
 * for a neighbour, so it must DECLARE its hitSlop (null counts) instead of taking
 * the default. It does not guess gaps from source: a guess at layout once judged
 * a chip's vertical slop against its row's horizontal gap.
 */
describe('the sweep: no repeated control may inherit the default halo', () => {
  const files: string[] = [];
  for (const dir of SWEEP_DIRS) {
    const walk = (d: string) => {
      for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
        if (e.name === '__tests__') continue;
        const rel = `${d}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (rel.endsWith('.tsx')) files.push(rel);
      }
    };
    walk(dir);
  }
  files.push(...SWEEP_EXTRA);

  /**
   * The spans of every `.map(` call in the file — from its opening paren to
   * the matching close. A control is REPEATED if and only if it sits inside
   * one. Proximity is not good enough: an empty-state button written just
   * below the loop that builds a poster grid is a single button, and a
   * look-behind window reads it as one of many.
   */
  function mapSpans(src: string): [number, number][] {
    const spans: [number, number][] = [];
    let i = 0;
    while ((i = src.indexOf('.map(', i)) !== -1) {
      const open = i + 4;
      let depth = 0, inStr: string | null = null, close = -1;
      for (let j = open; j < src.length; j++) {
        const c = src[j];
        if (inStr) { if (c === inStr && src.charCodeAt(j - 1) !== 92) inStr = null; continue; }
        if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) { close = j; break; } }
      }
      if (close === -1) break;
      spans.push([open, close]);
      i = open;
    }
    return spans;
  }

  it('every repeated control on the member file declares its own hitSlop', () => {
    const bare: string[] = [];
    let repeated = 0;

    for (const f of files) {
      const src = readCode(f);
      const spans = mapSpans(src);
      for (const tag of ['PressableScale', 'Pressable', 'TouchableOpacity']) {
        for (const t of scanTags(src, tag)) {
          const idx = src.split('\n').slice(0, t.line - 1).join('\n').length;
          if (!spans.some(([a, b]) => idx > a && idx < b)) continue;   // not repeated
          repeated++;
          if (!/hitSlop\s*=/.test(t.attrs)) bare.push(`${f}:${t.line} <${tag}`);
        }
      }
    }

    // A sweep that finds nothing proves nothing. The floor is low because shared
    // components (RoomChip) are out of this scan's reach; the next test checks them.
    expect(repeated).toBeGreaterThan(4);
    expect(bare).toEqual([]);
  });

  /**
   * The balanced body of the first arrow function at or after `from`: the first
   * `=>` followed by `{` or `(`. An arrow inside a TYPE (`(f: T) => void`) is
   * followed by a type name, and is skipped.
   */
  function arrowBody(src: string, from: number): [number, number] | null {
    let at = from;
    for (;;) {
      const arrow = src.indexOf('=>', at);
      if (arrow === -1) return null;
      const rest = src.slice(arrow + 2);
      const off = rest.search(/\S/);
      if (off === -1) return null;
      const open = arrow + 2 + off;
      const close = ({ '{': '}', '(': ')' } as Record<string, string>)[src[open]];
      if (!close) { at = arrow + 2; continue; }   // a type's arrow — keep looking
      let d = 0;
      for (let j = open; j < src.length; j++) {
        if (src[j] === src[open]) d++;
        else if (src[j] === close) { d--; if (d === 0) return [open, j]; }
      }
      return null;
    }
  }

  // THE SECOND HALF: a shared component that is repeated (a tag inside a `.map(`
  // or a FlashList render… callback) declares its halo in its own definition.
  it('every REPEATED profile component declares its controls’ halos', () => {
    /** Component tags rendered in a repeated position, anywhere in the sweep. */
    const repeatedTags = new Set<string>();
    for (const f of files) {
      const src = readCode(f);
      const spans = mapSpans(src);
      // A `render…` callback, whose result FlashList repeats: its BODY, not its parameters.
      for (const m of src.matchAll(/\brender[A-Z]\w*\s*[=:]/g)) {
        const body = arrowBody(src, m.index!);
        if (body) spans.push(body);
      }
      for (const [a, b] of spans) {
        for (const t of src.slice(a, b).matchAll(/<([A-Z]\w*)/g)) repeatedTags.add(t[1]);
      }
    }

    /** The component's own body, not its file: a lone button beside it is not repeated. */
    function bodyOf(src: string, name: string): [number, number] | null {
      // `function Name(params) { … }` — including inside a React.memo wrapper.
      let m = new RegExp(`\\bfunction\\s+${name}\\s*\\(`).exec(src);
      let open = -1;
      if (m) {
        let d = 0, j = m.index + m[0].length - 1;
        for (; j < src.length; j++) {
          if (src[j] === '(') d++;
          else if (src[j] === ')') { d--; if (d === 0) break; }
        }
        open = src.indexOf('{', j);
      } else {
        // Otherwise an arrow function assigned to a const of that name.
        m = new RegExp(`\\bconst\\s+${name}\\s*=`).exec(src);
        return m ? arrowBody(src, m.index) : null;
      }
      if (open === -1) return null;
      const close = ({ '{': '}', '(': ')' } as Record<string, string>)[src[open]];
      if (!close) return null;
      let d = 0;
      for (let j = open; j < src.length; j++) {
        if (src[j] === src[open]) d++;
        else if (src[j] === close) { d--; if (d === 0) return [open, j]; }
      }
      return null;
    }

    const bare: string[] = [];
    const unresolved: string[] = [];
    const checkedIn: string[] = [];
    for (const f of files) {
      const src = readCode(f);
      for (const name of repeatedTags) {
        if (!new RegExp(`\\b(?:function|const)\\s+${name}\\b`).test(src)) continue;
        const span = bodyOf(src, name);
        // A definition we cannot locate must NOT quietly read as checked —
        // that is a pass for a control nobody looked at.
        if (!span) { unresolved.push(`${f} :: ${name}`); continue; }
        const body = src.slice(span[0], span[1]);
        const before = src.slice(0, span[0]).split('\n').length - 1;
        checkedIn.push(`${f} :: ${name}`);
        for (const tag of ['PressableScale', 'Pressable', 'TouchableOpacity']) {
          for (const t of scanTags(body, tag)) {
            if (!/hitSlop\s*=/.test(t.attrs)) bare.push(`${f}:${before + t.line} <${tag}> in ${name}`);
          }
        }
      }
    }
    expect(unresolved).toEqual([]);
    const defining = checkedIn;

    // Floors: if either count collapses, the scan stopped reaching something.
    expect(repeatedTags.size).toBeGreaterThan(15);
    expect(defining.length).toBeGreaterThan(5);
    expect(bare).toEqual([]);
  });
});

describe('the top bar’s own icon cluster', () => {
  const NAV_BAR = 'src/components/layout/TopNavBar.tsx';
  const METRICS = 'src/components/layout/navMetrics.ts';

  /** Effective slop of the bar's single shared NavIconButton. */
  function navSlop() {
    const body = readCode(NAV_BAR).match(/hitSlop=\{\{([^}]*)\}\}/);
    expect(body).not.toBeNull();
    return (n: string) => {
      const m = body![1].match(new RegExp(`${n}\\s*:\\s*(\\d+)`));
      return m ? Number(m[1]) : 15; // omitted sides keep PressableScale's 15
    };
  }

  it('claims at most half the cluster gap sideways', () => {
    // The gap is read from the stylesheet rather than assumed: respace the
    // cluster and this test moves with it instead of enshrining today's number.
    const gap = Number((readCode(NAV_BAR).match(/sideCluster:\s*\{[\s\S]*?gap:\s*(\d+)/) || [])[1]);
    expect(gap).toBe(NAV_CLUSTER_GAP);

    const side = navSlop();
    // Both sides: the buttons share one component, and each has a neighbour on
    // one side or the other.
    expect(side('left')).toBeLessThanOrEqual(gap / 2);
    expect(side('right')).toBeLessThanOrEqual(gap / 2);
  });

  it('still clears 44pt across, slop included', () => {
    const size = Number((readCode(METRICS).match(/NAV_BTN_SIZE\s*=\s*(\d+)/) || [])[1]);
    expect(size).toBeGreaterThan(0); // a failed parse must not pass vacuously

    const side = navSlop();
    // Narrowing the slop must not quietly push the target under the minimum.
    expect(size + side('left') + side('right')).toBeGreaterThanOrEqual(44);
  });
});
