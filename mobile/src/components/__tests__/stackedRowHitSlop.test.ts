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
 */
import { readFileSync } from 'fs';
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
  note: string;
}

/**
 * Every entry's `gap` is the REAL separation measured from the stylesheet —
 * container `gap`, the row's own margin, or a divider's width. The allowed
 * slop is derived from it, so correcting a layout's spacing automatically
 * corrects what this test demands.
 */
const RULES: Rule[] = [
  { file: 'src/components/log/AuteurToolkit.tsx', style: 'axisNotch', gap: { x: 2 },
    note: 'autopsy score: 11 notches in a row, axisTrack gap 2 (was sliderSeg)' },
  { file: 'src/components/log/LogForm.tsx', style: 'pThumb', gap: { x: 8 },
    note: 'poster thumbs, list gap 8 — Curatorial Control moved to the docket' },
  { file: 'src/components/NitrateCalendar.tsx', style: 'dayCell', gap: { x: 0, y: 2 },
    note: 'date grid: columns flush, dayRow marginBottom 2' },
  { file: 'src/components/lounge/AtTheDoorPanel.tsx', style: 'declineBtn', gap: { x: 10, y: 22 },
    note: 'DECLINE beside ADMIT, row gap 10; rows 11+11 apart' },
  { file: 'src/components/lounge/AtTheDoorPanel.tsx', style: 'admitBtn', gap: { x: 10, y: 22 },
    note: 'ADMIT beside DECLINE' },
  { file: 'src/components/lounge/LoungeSettingsPanel.tsx', style: 'memberAction', gap: { x: 8 },
    note: 'mute/ban pair, actionRow gap 8' },
  { file: 'src/components/lounge/ActionSheet.tsx', style: 'actionBtn', gap: { y: 0 },
    note: 'REPLY / COPY / REPORT / BLOCK, hairline apart' },
  { file: 'src/components/moderation/ContentActionSheet.tsx', style: 'optionRow', gap: { y: 0 },
    note: 'moderation options, hairline apart' },
  { file: 'src/components/layout/ConciergeButton.tsx', style: 'actionRow', gap: { y: 0 },
    note: 'Log a Film / Curate a Stack, hairline apart' },
  { file: 'src/components/feed/ActionDeck.tsx', style: 'actionBtn', gap: { x: 0 },
    note: 'four flex:1 actions, flush' },
  { file: 'src/components/log/LogActionDeck.tsx', style: 'deckBtn', gap: { x: 0 },
    note: 'four flex:1 actions, flush' },
  { file: 'app/stacks/[id].tsx', style: 'actionItem', gap: { x: 1 },
    note: 'action bar split by a 1pt divider' },
  { file: 'app/dossier/[id].tsx', style: 'actionItem', gap: { x: 1 },
    note: 'action bar split by a 1pt divider' },
  { file: 'app/user/[username].tsx', style: 'accountRow', gap: { y: 0 },
    note: 'account rows, hairline apart' },
  { file: 'app/(modals)/vault-modal.tsx', style: 'formatBtn', gap: { y: 8 },
    note: 'export formats, marginBottom 8' },
  { file: 'src/components/PaywallModal.tsx', style: 'tierCard', gap: { y: 12 },
    note: 'tier choice, marginBottom 12' },
  { file: 'src/components/profile/AvatarCropSheet.tsx', style: 'actionCard', gap: { x: 16 },
    note: 'camera / library, gap 16' },
  { file: 'src/components/dispatch/ArticleReaderModal.tsx', style: 'readerActionBtn', gap: { x: 16, y: 16 },
    note: 'wrapping action row, gap 16' },
  { file: 'src/components/profile/ProfileListsTab.tsx', style: 'stackCard', gap: { x: 16, y: 16 },
    note: 'stack grid' },
  { file: 'src/components/reels/ReelsHeader.tsx', style: 'tabButton', gap: { x: 0 },
    note: 'two flex:1 tabs meeting at the divider' },
  { file: 'app/dispatch/compose.tsx', style: 'toolBtn', gap: { x: 8 },
    note: 'editor toolbar, gap 8' },
  { file: 'app/(admin)/tribunal.tsx', style: 'actionBtn', gap: { x: 8, y: 8 },
    note: 'DISMISS / BAN / PERMANENT EXILE' },
  { file: 'src/components/profile/Achievements.tsx', style: 'badgeItem', gap: { x: 12, y: 12 },
    note: 'badge grid, gap 12' },
  { file: 'src/components/darkroom/DarkroomMoodBar.tsx', style: 'moodCard', gap: { x: 8 },
    note: 'mood strip, gap 8' },
  // The bar itself. Missed on the first sweep because the disc is a
  // ConciergeButton, not a row in a list — the shape looked different, the
  // defect was identical.
  { file: 'src/components/layout/ConciergeButton.tsx', style: 'discShadow', gap: { x: 6 }, only: ['right'],
    note: 'brass ＋ has the Lounge key 6pt to its RIGHT; open screen edge to its left' },
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

/** Resolves the EFFECTIVE slop, honouring the 15pt default for omitted sides. */
function effectiveSlop(attrs: string): Record<string, number> {
  const m = attrs.match(/hitSlop=\{([\s\S]*?)\}\s*(?:[\w[]|\/?>|$)/);
  const sides = { top: 15, bottom: 15, left: 15, right: 15 };
  if (!m) return sides;                                  // no prop at all
  const body = m[1];
  if (/^\s*null\s*$/.test(body)) return { top: 0, bottom: 0, left: 0, right: 0 };
  const num = body.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  if (num) { const v = Number(num[1]); return { top: v, bottom: v, left: v, right: v }; }
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    const s = body.match(new RegExp(side + '\\s*:\\s*(\\d+(?:\\.\\d+)?)'));
    if (s) sides[side] = Number(s[1]);                   // omitted sides KEEP 15
  }
  return sides;
}

describe('neighbouring controls do not overlap each other’s touch targets', () => {
  for (const rule of RULES) {
    const label = `${rule.file} :: ${rule.style}`;

    it(`${label} — slop ≤ half the gap (${rule.note})`, () => {
      const src = readFileSync(join(ROOT, rule.file), 'utf8')
        .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const nameRe = new RegExp(`\\b${rule.style}\\b`);
      const tags = scanTags(src, 'PressableScale').filter((t) => nameRe.test(styleValue(t.attrs)));

      // A rule that matches nothing would pass while proving nothing.
      expect(tags.length).toBeGreaterThan(0);

      const offenders: string[] = [];
      for (const t of tags) {
        const slop = effectiveSlop(t.attrs);
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
