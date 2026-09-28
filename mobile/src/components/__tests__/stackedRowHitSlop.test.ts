/**
 * stackedRowHitSlop.test.ts — neighbours must not steal each other's taps.
 * ─────────────────────────────────────────────────────────────
 * PressableScale defaults to 15pt of hitSlop on EVERY side, and every side you
 * omit from a partial object also defaults to 15. That default exists so a
 * small icon clears 44pt. Between NEIGHBOURS it is destructive: two adjacent
 * controls each grow 15pt into the other, their targets overlap, and both
 * platforms hand the touch to whichever sibling comes LATER.
 *
 * That last part is not a guess — it is in the platform source:
 *   iOS      RCTView.m           `[sortedSubviews reverseObjectEnumerator]`
 *   Android  TouchTargetHelper.kt `for (i in childrenCount - 1 downTo 0)`
 * and both expand the test rect by hitSlop before checking containment.
 *
 * THE RULE: on whichever axis two controls are neighbours, each may claim at
 * most HALF the real gap between them. Then the two expanded boxes meet
 * without overlapping, and no point belongs to two controls.
 *
 * Found live on 2026-08-14. The worst were not the ones filed:
 *   • the autopsy rating slider — 11 segments 2pt apart, written as
 *     `hitSlop={{top:10,bottom:10}}` whose omitted left/right stayed 15, so
 *     ~65% of every segment set the score one notch too high;
 *   • the date grid in the log form — no hitSlop at all, cells flush;
 *   • the tribunal's DISMISS / BAN / PERMANENT EXILE row;
 *   • the Lounge sheet, where BLOCK sat under REPORT.
 *
 * ── MEASURED WHERE DRAWN, READ ONLY WHERE NOT ─────────────────────────────
 * This file used to type forty gaps out of the stylesheets by hand. The rule is
 * now MEASURED on every screen the tests and generators draw: each control is
 * marked with the source line that made it, its touch area is its box plus its
 * hitSlop as laid out, and an overlap with any neighbour is a STEAL
 * (mockups/tools/layout.cjs; the CI capture job). That caught what this list
 * never held — a billing switch, the critiques' foot, the Concierge's rows.
 *
 * What stays below is only what no render draws beside its neighbour — each
 * control checked by its source line against the capture run's sites
 * (2026-09-28): a sheet that opens behind an entrance fade, an owner-only
 * button, an admin screen no test reaches. MEASURED_NOW lists the rules that
 * moved, and holds each one's file to mockups/touch-measured.txt, which the
 * capture job fails without.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');

type Axis = 'x' | 'y';
type Side = 'top' | 'bottom' | 'left' | 'right';
interface Rule {
  file: string;
  style: string;
  /** The measured gap between neighbours, per axis. Absent = no neighbour there. */
  gap: Partial<Record<Axis, number>>;
  /**
   * Restricts the check to specific sides. Needed where a control has a
   * neighbour on ONE side and open space on the other — the brass ＋ has the
   * Lounge key to its right and the screen edge to its left, and it should keep
   * a generous target on the edge side.
   */
  only?: Side[];
  /** Keys the rule when the control has no style prop to match on. */
  match?: string;
  note: string;
}

/**
 * Every entry's `gap` is the REAL separation measured from the stylesheet —
 * container `gap`, the row's own margin, or a divider's width. The allowed
 * slop is derived from it, so correcting a layout's spacing automatically
 * corrects what this test demands.
 *
 * ONLY the controls no drawn screen measures beside a neighbour (see the
 * header). Each says why it is still read here.
 */
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
  // Not drawn beside a neighbour: a record's critiques are drawn one at a time.
  { file: 'src/components/log/LogComments.tsx', match: 'HITSLOP_ROW', gap: { y: 0 }, style: '(the critique row)',
    note: 'critiques are flush (commentItem hairline) — a mis-press reports the wrong member' },
  // Not drawn: the share sheet is a stand-in wherever it would open.
  { file: 'src/components/ShareToLoungeModal.tsx', match: 'LOUNGE_SLOP', gap: { y: 6 }, style: '(lounge rows)',
    note: 'loungeItem marginBottom 6 — the later row wins, so the film went to the wrong room' },
  // Not drawn: the notices sheet.
  { file: 'app/(modals)/notifications-modal.tsx', match: 'HITSLOP_DISMISS', gap: { x: 20, y: 20 }, style: '(dismiss, inside the row)',
    note: 'a CHILD of the notice row: 28pt control, 10 per side reaches the 48dp floor and no further' },
];

/**
 * The rules that moved to measurement on 2026-09-28: every control each one
 * governed was measured beside its neighbour in the capture run. Their files
 * must stay in mockups/touch-measured.txt — the capture job fails when a listed
 * file stops being measured, so deleting one from that list is the only way to
 * drop the check, and this makes that a visible decision too.
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

/**
 * TopNavBar's icon buttons are a plain Animated.Pressable, not a
 * PressableScale, so the scanner above cannot see them — and they sit in the
 * same 6pt cluster as the brass disc. Checked directly.
 */
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
 * Resolves the EFFECTIVE slop, honouring the 15pt default for omitted sides.
 *
 * `src` is the whole file, because a slop is often written as a named constant
 * — `hitSlop={ROW_SLOP}` — with the reasoning attached to its declaration.
 * Without that lookup this scanner read the NAME, matched no sides, and scored
 * a correctly-narrowed control as the full default: it would have failed three
 * fixes that were right, and, worse, the same blindness in reverse means a rule
 * could only ever be written against an inline object. The constant is followed
 * to its declaration in the same file.
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
      const src = readFileSync(join(ROOT, rule.file), 'utf8')
        .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SWEEP — because the list above is the wrong SHAPE
 * ─────────────────────────────────────────────────────────────────────────────
 * `RULES` is default-ALLOW: it checks the places somebody remembered to add and
 * says nothing about anywhere else. That has now missed real findings twice on
 * the same page — 27 unnamed controls, then every filter chip in every room —
 * and both times the fix was "add the rooms to the list", which leaves the
 * shape exactly as wrong as it was.
 *
 * This is default-DENY, and it asserts the one thing that is exactly checkable
 * without inferring layout from source: a control rendered inside a `.map(` is
 * adjacent to a COPY OF ITSELF, so it has a neighbour by construction — and it
 * may not silently inherit PressableScale's 15pt default on all four sides. It
 * has to DECLARE its slop. `null` is a perfectly good declaration; the point is
 * that somebody looked.
 *
 * An earlier version of this tried to resolve each control's container and
 * compare against its gap. That flagged a chip's vertical slop — free and
 * correct, since nothing sits above or below it in a horizontal scroller —
 * against its row's HORIZONTAL gap. Inferring layout statically is approximate,
 * and an approximate guard that cries wolf is one that gets weakened by the
 * next person who hits it. So the two halves split the job: this one guarantees
 * nobody forgets to think, RULES checks the arithmetic where somebody did.
 */
const SWEEP_DIRS = ['src/components/profile', 'src/features/profile'];
const SWEEP_EXTRA = ['app/user/[username].tsx'];

describe('the sweep: no repeated control may inherit the default halo', () => {
  const read = (f: string) =>
    readFileSync(join(ROOT, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

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
        if (c === '"' || c === "'" || c === '\'') { inStr = c; continue; }
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
      const src = read(f);
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

    // A sweep that finds nothing to look at would pass while proving nothing.
    //
    // This floor USED to be 8 and it did its job: consolidating the six rooms
    // onto one shared `RoomChip` dropped the count to 5, because a chip written
    // as `<RoomChip …>` is no longer a raw pressable inside a `.map(` and this
    // scan stopped being able to see it. The chips did not become unchecked —
    // their halo moved INTO the shared component, where the sweep below now
    // checks it — but the reachable population genuinely shrank, and lowering
    // the number without saying why is how a guard quietly dies.
    expect(repeated).toBeGreaterThan(4);
    expect(bare).toEqual([]);
  });

  /**
   * THE SECOND HALF — where a repeated control's halo actually lives.
   *
   * Consolidation moves the decision, it does not remove it. A chip rendered as
   * `<RoomChip …>` is still adjacent to a copy of itself, but the only place
   * its slop can be declared is inside `RoomChip` — so the sweep above, which
   * looks for raw pressables inside a `.map(`, cannot see it any more. Same for
   * every list cell: FlashList repeats a `renderItem` result, and there is no
   * `.map(` anywhere near it.
   *
   * So: find the components that are ACTUALLY repeated — a custom tag inside a
   * `.map(` span, or inside a `render…` callback — then require the pressables
   * in THEIR definitions to declare a halo.
   *
   * The predicate has to be exact. A first attempt asked instead whether the
   * file exported anything, which flagged twenty-one controls of which most
   * were single buttons — an Import signpost, a Share button, a modal backdrop.
   * An approximate guard that cries wolf is one the next person deletes. But it
   * was not useless: among the noise sat ProfilePosterCard, the most-repeated
   * control in the app, with no hitSlop at all — 15pt of inherited halo reaching
   * 7pt onto the face of the next poster in every grid.
   */
  /**
   * The balanced body of the first arrow function at or after `from`.
   *
   * The subtlety that cost two rounds here: `indexOf('=>')` finds the arrow
   * inside a TYPE, not the one that opens the function. `TriptychResultRow` is
   * declared as `React.memo(({ film, handleSetFilm }: { handleSetFilm: (f: T)
   * => void }) => (`, and the first `=>` in it belongs to `handleSetFilm`'s
   * signature. A type's arrow is followed by a type name; a function's is
   * followed by the bracket that opens its body — so take the first arrow whose
   * next non-space character is `{` or `(`.
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

  it('every REPEATED profile component declares its controls’ halos', () => {
    /** Component tags rendered in a repeated position, anywhere in the sweep. */
    const repeatedTags = new Set<string>();
    for (const f of files) {
      const src = read(f);
      const spans = mapSpans(src);
      // A `render…` callback — FlashList repeats its result, and there is no
      // `.map(` in sight. The span must be the function's BODY: balancing from
      // the first paren after the name lands on the end of the PARAMETER LIST
      // instead, which is why a first version of this found RoomChip and
      // VaultCase but missed LedgerRow, ProfileListCard and ProfilePosterCard —
      // three of the four most-repeated controls on the page. Find the `=>`
      // first, then balance whatever bracket opens the body.
      for (const m of src.matchAll(/\brender[A-Z]\w*\s*[=:]/g)) {
        const body = arrowBody(src, m.index!);
        if (body) spans.push(body);
      }
      for (const [a, b] of spans) {
        for (const t of src.slice(a, b).matchAll(/<([A-Z]\w*)/g)) repeatedTags.add(t[1]);
      }
    }

    /**
     * The component's OWN body — not its file.
     *
     * Scanning the whole file flagged six controls that are not repeated at
     * all: the three empty-state CTAs (one per room, alone on the screen) and
     * three modal backdrops, each of which merely shares a file with something
     * that IS repeated. Same failure as the version before it, one level in.
     */
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
        // `const Name = … => { … }` / `= … => ( … )`
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
      const src = read(f);
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

    // The sweep must be finding real components, not an empty set. It resolves
    // ~25 repeated tags down to the handful whose definitions live here: the
    // Room chip and rail, the Ledger row, the stack card, the vault case, the
    // poster card, the triptych's result row, the passport stamp, the
    // follow-request row. If either number collapses, the scan has stopped
    // reaching something rather than the app having got simpler.
    expect(repeatedTags.size).toBeGreaterThan(15);
    expect(defining.length).toBeGreaterThan(5);
    expect(bare).toEqual([]);
  });
});

describe('the top bar’s own icon cluster', () => {
  const NAV_BAR = 'src/components/layout/TopNavBar.tsx';
  const METRICS = 'src/components/layout/navMetrics.ts';

  const read = (f: string) =>
    readFileSync(join(ROOT, f), 'utf8')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

  /** Effective slop of the bar's single shared NavIconButton. */
  function navSlop() {
    const body = read(NAV_BAR).match(/hitSlop=\{\{([^}]*)\}\}/);
    expect(body).not.toBeNull();
    return (n: string) => {
      const m = body![1].match(new RegExp(`${n}\\s*:\\s*(\\d+)`));
      return m ? Number(m[1]) : 15; // omitted sides keep PressableScale's 15
    };
  }

  it('claims at most half the cluster gap sideways', () => {
    // The gap is read from the stylesheet rather than assumed: respace the
    // cluster and this test moves with it instead of enshrining today's number.
    const gap = Number((read(NAV_BAR).match(/sideCluster:\s*\{[\s\S]*?gap:\s*(\d+)/) || [])[1]);
    expect(gap).toBe(NAV_CLUSTER_GAP);

    const side = navSlop();
    // Both sides: the buttons share one component, and each has a neighbour on
    // one side or the other.
    expect(side('left')).toBeLessThanOrEqual(gap / 2);
    expect(side('right')).toBeLessThanOrEqual(gap / 2);
  });

  it('still clears 44pt across, slop included', () => {
    const size = Number((read(METRICS).match(/NAV_BTN_SIZE\s*=\s*(\d+)/) || [])[1]);
    expect(size).toBeGreaterThan(0); // a failed parse must not pass vacuously

    const side = navSlop();
    // Narrowing the slop must not quietly push the target under the minimum.
    expect(size + side('left') + side('right')).toBeGreaterThanOrEqual(44);
  });
});
