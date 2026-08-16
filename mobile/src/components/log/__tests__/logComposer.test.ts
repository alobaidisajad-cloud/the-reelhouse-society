/**
 * logComposer.test.ts — the page where a record is written.
 *
 * The app's signature action, and it had no guards of its own. These pin the
 * repairs that fail SILENTLY: a date that reads a day early only west of UTC, a
 * tap that lands on the neighbouring chip, a list that renders nothing, a modal
 * stacked on a modal. None of them crash; none show up in a type check.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { formatLongCalendarDate, formatDate } from '@/src/utils/timeAgo';
import { stripHTML } from '@/src/utils/text';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (f: string) =>
  readFileSync(join(ROOT, f), 'utf8')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

const FORM = 'src/components/log/LogForm.tsx';
const STYLES = 'src/components/log/LogModalStyles.ts';
const DESK = 'src/components/log/EditorialDesk.tsx';
const TOOLKIT = 'src/components/log/AuteurToolkit.tsx';
const SCREEN = 'app/(modals)/log-modal.tsx';
const SURFACES = [FORM, DESK, TOOLKIT, SCREEN];

/** Brace-matched, so a one-line style cannot swallow the next block. */
function style(src: string, name: string): string {
  const at = src.search(new RegExp(`\\b${name}\\s*[:=]\\s*\\{`));
  if (at === -1) return '';
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  return '';
}
const num = (body: string, prop: string) => {
  const m = body.match(new RegExp(`(?<![\\w.])${prop}\\s*:\\s*(-?[\\d.]+)`));
  return m ? Number(m[1]) : undefined;
};

describe('the inventory — every control the composer owns', () => {
  /**
   * The restructure moves almost every block on this page, and the one way that
   * goes badly is a control quietly disappearing. Each entry is the handler the
   * control calls: drop the control and its call goes with it.
   *
   * This is the contract the redesign is held to. It is not about layout.
   */
  const CONTROLS: [string, string][] = [
    ['delete a log',            'setShowDeleteConfirm(true)'],
    ['confirm the deletion',    'handleDelete()'],
    ['discard a draft',         'discardDraft()'],
    ['set the status',          'setStatus(s)'],
    ['give an abandon reason',  'setAbandonedReason(r)'],
    ['rate the film',           'setRating('],
    ['write the review',        'onChangeText={setReview}'],
    ['flag a spoiler',          'setIsSpoiler('],
    ['toggle the drop cap',     'setDropCap('],
    ['write a pull quote',      'setPullQuote'],
    ['choose an article still', 'setEditorialHeader'],
    ['open the autopsy',        'setAutopsyOpen('],
    ['score an axis',           'setAutopsy('],
    ['choose an alt poster',    'setAltPoster'],
    ['pick today',              'setDate(todayStr)'],
    ['pick yesterday',          'setDate(yesterday)'],
    ['open the calendar',       'setCalendarOpen('],
    ['name a companion',        'onChangeText={setWatchedWith}'],
    ['record the format',       'setPhysicalMedia(opt)'],
    ['write a private note',    'onChangeText={setPrivateNotes}'],
    ['add to a stack',          'toggleList(list.id)'],
    ['seal the record',         'handleLog()'],
    ['reach the Society',       'goToSociety'],
  ];

  it.each(CONTROLS)('a member can still %s', (_what, handler) => {
    const src = read(FORM) + read(DESK) + read(TOOLKIT);
    expect(src.includes(handler)).toBe(true);
  });
});

describe('the record reads as one document', () => {
  it('the docket is marked, not boxed', () => {
    // Registration brackets — you bracket a document, you do not box it in.
    // Same four marks as the Concierge card that opens this screen.
    expect(read(FORM)).toMatch(/<Brackets\s*\/>/);
    const b = style(read(STYLES), 'bracketed');
    expect(b).not.toMatch(/borderWidth/);
  });

  it('the manuscript is the only box left', () => {
    // Nine bordered containers were the cramped feeling itself. The manuscript
    // keeps its frame because it IS the sheet you write on; every other box was
    // deleted rather than restyled, so it cannot quietly come back.
    const styles = read(STYLES);
    for (const gone of ['lockedBox', 'editorialTeaser', 'upgradeRow', 'moreToggle', 'dateDisplay', 'secLabelRow']) {
      expect(styles).not.toMatch(new RegExp(`\\b${gone}\\s*:\\s*\\{`));
    }
    expect(styles).toMatch(/manuscriptFrame\s*:\s*\{/);
    // The autopsy's crimson container is gone too — the entry carries the colour.
    expect(read(TOOLKIT)).not.toMatch(/auteurBox/);
  });

  it('the index states what each entry holds', () => {
    const src = read(FORM);
    for (const name of ['THE AUTOPSY', 'THE PHYSICAL ARCHIVE', 'THE VAULT', 'FILED', 'STACKS']) {
      expect(src).toContain(`name="${name}"`);
    }
  });

  it('an entry opens itself when it already holds something', () => {
    // Editing last year's record must never make a member hunt for their own
    // words; a fresh log must still open calm. Computed once, from what arrived.
    const src = read(FORM);
    expect(src).toMatch(/useState\(\(\) => !!\(dropCap \|\| pullQuote \|\| editorialHeader\)\)/);
    expect(src).toMatch(/useState\(\(\) => hasPhysicalFormat\(physicalMedia\)\)/);
    expect(src).toMatch(/useState\(\(\) => !!privateNotes\)/);
  });

  it('the Vault never previews what it holds', () => {
    // Every other entry shows its value. This is the one field a member might
    // not want legible over someone's shoulder — it shows only that it is full.
    // Only the ENTRY's own props — the panel below it holds the real input,
    // which of course carries the text.
    const src = read(FORM);
    const at = src.indexOf('name="THE VAULT"');
    const props = src.slice(at, src.indexOf('>', src.indexOf('onPress', at)));
    expect(props).toMatch(/value=\{privateNotes \? ' ' : ''\}/);
    expect(props).not.toMatch(/privateNotes\.slice|value=\{privateNotes\}/);
  });
});

describe('the velvet rope is said once', () => {
  it('the four refusals are gone', () => {
    // Three identical "UNLOCK WITH ARCHIVIST" boxes and an "UPGRADE" link used
    // to interrupt the core action. Visibility was never the problem.
    for (const f of [FORM, TOOLKIT, DESK]) {
      expect(read(f)).not.toMatch(/UNLOCK WITH ARCHIVIST|>UPGRADE</);
    }
  });

  it('a rank you lack is a key and a name, never a no', () => {
    // Counted, not merely present: there are TWO Archivist tools in the index
    // (the Physical Archive and the Vault) and one Auteur tool. Asserting only
    // that a lock exists let a mutation strip one of the two and still pass.
    const src = read(FORM);
    expect(src.match(/lockedTo=\{isAuteur \? undefined : 'THE AUTEUR'\}/g) ?? []).toHaveLength(1);
    expect(src.match(/lockedTo=\{isPremium \? undefined : 'THE ARCHIVIST'\}/g) ?? []).toHaveLength(2);
    // The app's own mark for a thing you lack clearance for — not a padlock.
    expect(read('src/components/log/LogIndexEntry.tsx')).toMatch(/KeyRound/);
  });

  it('the gate is the Lounge’s, word for word', () => {
    const gate = read('src/components/log/LogClearanceGate.tsx');
    expect(gate).toContain('[ CLEARANCE REQUIRED ]');
    expect(gate).toContain('✦ ASCEND THE RANKS');
  });

  it('the locked instrument is shown, inert', () => {
    // You are not sold a name; you are looking at the tool.
    const src = read(FORM);
    expect(src).toMatch(/st\.lockedPanel/);
    expect(src).toMatch(/pointerEvents=\{isPremium \? 'auto' : 'none'\}/);
    expect(src).toMatch(/pointerEvents=\{isAuteur \? 'auto' : 'none'\}/);
  });
});

describe('destructive things are reached for, not stumbled on', () => {
  it('delete sits past the seal', () => {
    const src = read(FORM);
    // It used to be the FIRST thing on the page when editing a record.
    expect(src.indexOf('handleLog()')).toBeLessThan(src.indexOf('setShowDeleteConfirm(true)'));
    expect(src.indexOf('handleLog()')).toBeLessThan(src.indexOf('handleDelete()'));
  });
});

describe('a date is never built the way this engine cannot honour', () => {
  it('writes the long form from the app’s own tables', () => {
    expect(formatLongCalendarDate('2026-08-16')).toBe('Sun, August 16, 2026');
    expect(formatLongCalendarDate('2026-01-01')).toBe('Thu, January 1, 2026');
    expect(formatLongCalendarDate('not a date')).toBe('');
    expect(formatLongCalendarDate(null)).toBe('');
  });

  it('a calendar day keeps its own day, wherever it is read', () => {
    // `new Date("2026-08-16")` is midnight UTC by definition, so anything built
    // from it reads a day early across the Americas — and Hermes ships here with
    // no Intl polyfill, so a timeZone option cannot be trusted to correct it.
    expect(formatLongCalendarDate('2026-08-16').startsWith('Sun')).toBe(true);
    expect(formatDate('2026-08-16')).toBe('AUG 16, 2026');
  });

  it('no composer surface formats its own date', () => {
    for (const f of SURFACES) {
      expect(read(f)).not.toMatch(/toLocaleDateString|toLocaleString|Intl\./);
    }
  });
});

describe('a member’s own words survive being quoted back', () => {
  it('the previous take uses the one cleaner', () => {
    const src = read(FORM);
    expect(src).toMatch(/\bstripHTML\b/);
    // The private copy here was `replace(/<[^>]+>/g, '')` — the same total strip
    // that ate a member's angle brackets on the record.
    expect(src).not.toMatch(/replace\(\/<\[\^>\]\+>\/g/);
    expect(stripHTML('<p>Watched <The Batman> again</p>')).toBe('Watched <The Batman> again');
  });
});

describe('no chip lands on its neighbour', () => {
  // Both platforms hand an overlap to the LATER sibling, so each side may claim
  // at most half the real gap. All four of these rows overlapped.
  const ROWS: [string, string][] = [
    ['statusRow', 'setStatus(s)'],
    ['tagRow', 'setAbandonedReason(r)'],
    ['quickDateRow', 'setDate(todayStr)'],
    ['flatListGapPad', 'toggleList(list.id)'],
  ];

  it.each(ROWS)('%s claims at most half its gap', (rowName, marker) => {
    const gap = num(style(read(STYLES), rowName), 'gap')!;
    expect(gap).toBeGreaterThan(0);
    const src = read(FORM);
    const at = src.indexOf(marker);
    expect(at).toBeGreaterThan(-1);
    // The hitSlop belonging to this control: the first one after its handler.
    const slop = src.slice(at).match(/hitSlop=\{\{([^}]*)\}\}/)![1];
    const left = Number(slop.match(/left:\s*(\d+)/)![1]);
    const right = Number(slop.match(/right:\s*(\d+)/)![1]);
    expect(left).toBeLessThanOrEqual(gap / 2);
    expect(right).toBeLessThanOrEqual(gap / 2);
  });

  it('the wrapping row halves its VERTICAL gap too', () => {
    // tagRow wraps, so its rows are a gap apart as well — which is why
    // "Film Print", stranded on its own line, was the hardest thing to tap.
    const gap = num(style(read(STYLES), 'tagRow'), 'gap')!;
    const src = read(FORM);
    const slop = src.slice(src.indexOf('setPhysicalMedia(opt)')).match(/hitSlop=\{\{([^}]*)\}\}/)![1];
    expect(Number(slop.match(/top:\s*(\d+)/)![1])).toBeLessThanOrEqual(gap / 2);
    expect(Number(slop.match(/bottom:\s*(\d+)/)![1])).toBeLessThanOrEqual(gap / 2);
  });
});

describe('text can be enlarged without leaving its line box', () => {
  // Every FIXED line box in the composer, and the cap declared where it renders.
  const TIERS: Record<string, [cap: number, file: string, marker: string]> = {
    filmTitle:           [1.2,  FORM, 'st.filmTitle'],
    prevTakeReview:      [1.35, FORM, 'st.prevTakeReview'],
    reviewInput:         [1.35, FORM, 'testID="review-input"'],
  };
  const PROP: Record<number, RegExp> = {
    1.35: /\{\.\.\.scaledTextProps\}/,
    1.2: /\{\.\.\.displayTextProps\}/,
  };

  it('every fixed line box is accounted for', () => {
    const found = [...read(STYLES).matchAll(/(\w+)\s*:\s*\{[^{}]*lineHeight:\s*\d/g)].map(m => m[1]);
    expect(found.sort()).toEqual(Object.keys(TIERS).sort());
  });

  it.each(Object.entries(TIERS))('%s survives its tier', (name, [cap]) => {
    const body = style(read(STYLES), name);
    expect(num(body, 'lineHeight')! / (num(body, 'fontSize')! * cap)).toBeGreaterThanOrEqual(1.05);
  });

  it.each(Object.entries(TIERS))('%s declares that tier where it renders', (_n, [cap, file, marker]) => {
    const src = read(file);
    const at = src.indexOf(marker);
    expect(at).toBeGreaterThan(-1);
    // The element's own opening tag, brace-aware so `() =>` cannot end it early.
    const start = src.lastIndexOf('<', at);
    let depth = 0, tag = '';
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      else if (src[i] === '>' && depth === 0) { tag = src.slice(start, i + 1); break; }
    }
    expect(tag).toMatch(PROP[cap]);
  });
});

describe('the composer never stacks a modal on a modal', () => {
  it('reaching the Society parks, dismisses, then travels', () => {
    const src = read(FORM);
    // Both screens are presentation:'modal'. A direct push is the trap the
    // floating button hit; the Concierge's law is park → dismiss → travel.
    expect(src).toMatch(/const goToSociety/);
    expect(src).toMatch(/router\.back\(\)/);
    // Exactly one push, and it lives inside goToSociety after the dismissal.
    const pushes = src.match(/\/membership/g) ?? [];
    expect(pushes).toHaveLength(1);
    const fn = src.slice(src.indexOf('const goToSociety'));
    expect(fn.indexOf('router.back()')).toBeLessThan(fn.indexOf('/membership'));
  });
});

describe('a nested horizontal list cannot render nothing', () => {
  it.each([DESK, FORM])('%s uses a plain scroller', (file) => {
    const src = read(file);
    // A horizontal FlashList inside a vertical ScrollView has no bounded height
    // to measure against; the documented failure is that it draws nothing — the
    // exact report on the Editorial Desk.
    expect(src).not.toMatch(/<FlashList/);
    expect(src).toMatch(/<ScrollView\s+horizontal/);
  });
});

describe('assistive tech is told what is chosen', () => {
  it.each([
    ['status', 'setStatus(s)'],
    ['abandoned reason', 'setAbandonedReason(r)'],
    ['physical media', 'setPhysicalMedia(opt)'],
    ['stacks', 'toggleList(list.id)'],
  ])('the %s row reports its selection', (_label, marker) => {
    const src = read(FORM);
    const tag = src.slice(src.lastIndexOf('<', src.indexOf(marker)), src.indexOf(marker) + 400);
    expect(tag).toMatch(/accessibilityState=\{\{\s*selected:/);
  });
});
