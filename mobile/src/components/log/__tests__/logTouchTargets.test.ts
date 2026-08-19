/**
 * logTouchTargets.test.ts — the composer's controls clear the floor by their
 * own geometry.
 *
 * A halo is invisible to both platforms' accessibility layers: hitSlop lives
 * inside React Native's touch dispatch, iOS reports `accessibilityFrame` from
 * the view's frame, and RN installs no Android `TouchDelegate`. So the only
 * thing that answers "is this control big enough" is the control's own size.
 *
 * The floor is 48, not 44 — this app ships on Android too, where Material's
 * minimum is 48dp against Apple's 44pt.
 *
 * Found by auditing this page AFTER the standard was settled: the collapsed
 * Editorial Desk bar was ~33pt with `hitSlop={null}`, and every index row was
 * 37pt claiming nothing vertically. Both were reachable areas below even the
 * lower of the two standards, and both were introduced by fixes on this page —
 * the null and the zeroes were right, and the height was never raised to match.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const FLOOR = 48;

/**
 * Comments are blanked, never deleted — a block comment removed outright takes
 * its newlines with it, and every line number this file reports after that
 * point is wrong. The enumeration below names offending lines, so they have to
 * be the lines a person will actually find.
 */
const read = (f: string) =>
  readFileSync(join(ROOT, f), 'utf8')
    .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));

/** Brace-matched style body — survives nested objects and multi-line bodies. */
function styleBody(src: string, name: string): string | null {
  const re = new RegExp('(?:^|[\\s,{])(' + name + ')\\s*:\\s*\\{', 'gm');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (src[m.index + m[0].indexOf(name) - 1] === '.') continue;
    const start = src.indexOf('{', m.index + m[0].length - 1);
    let d = 0;
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') d++;
      else if (src[i] === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
    }
  }
  return null;
}
const num = (body: string, prop: string) => {
  const m = body.match(new RegExp('\\b' + prop + '\\s*:\\s*(\\d+(?:\\.\\d+)?)'));
  return m ? Number(m[1]) : null;
};

/**
 * Every control on this page whose height is fixed by its own style, and the
 * height it must reach. Each entry names WHY it is here, so a later redesign
 * that changes the number has to make the decision again rather than inherit
 * it.
 */
const CONTROLS: { file: string; style: string; prop: 'minHeight' | 'height' | 'width'; note: string }[] = [
  { file: 'src/components/log/LogModalStyles.ts', style: 'idxEntry', prop: 'minHeight',
    note: 'the catalogue index rows — flush, so they can claim no slop at all' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'deskFoot', prop: 'minHeight',
    note: 'the collapsed Editorial Desk bar — hitSlop null, so height is the only lever' },
  { file: 'src/components/log/LogSealBar.tsx', style: 'press', prop: 'minHeight',
    note: 'THE SEAL — the act this page exists for' },
  { file: 'src/components/log/EditorialDesk.tsx', style: 'stillImg', prop: 'height',
    note: 'article-header stills' },
  { file: 'src/components/log/EditorialDesk.tsx', style: 'stillThumb', prop: 'height',
    note: 'the NONE chip beside them' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'statusBtn', prop: 'minHeight',
    note: 'watched / rewatched / abandoned — the first decision the page asks for' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'closeBtn', prop: 'minHeight',
    note: 'the way out — no border, so the growth is invisible' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'deleteBtn', prop: 'minHeight',
    note: 'destructive, and so the easiest thing to hit deliberately' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'pThumb', prop: 'width',
    note: 'alternate posters — 48x72 keeps the 2:3 a poster actually is' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'pImg', prop: 'width',
    note: 'the poster images in the same strip' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'hit48', prop: 'minHeight',
    note: 'the shared box — chips, tags and date pills sit inside it untouched' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'backBtn', prop: 'height',
    note: 'the way back to search — a 20pt chevron in a 48pt box' },
  // These were claimed by the enumeration and verified by nothing — a mutation
  // stripped their minHeight and the suite stayed green. A claim that reaches
  // the floor must be CHECKED here, not merely asserted over there.
  { file: 'src/components/log/LogModalStyles.ts', style: 'spoilerRow', prop: 'minHeight',
    note: 'CONTAINS SPOILERS, and the Editorial Desk drop-cap toggle' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'gate', prop: 'minHeight',
    note: 'the clearance gate — the only way a locked rank reaches the Society' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'discardBtn', prop: 'minHeight',
    note: 'DISCARD DRAFT — destructive, and text-only, so it had no box at all' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'deleteYes', prop: 'minHeight',
    note: 'CONFIRM DELETE' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'deleteNo', prop: 'minHeight',
    note: 'CANCEL, beside it' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'ruledRow', prop: 'minHeight',
    note: 'the date row that opens the calendar' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'signInBtn', prop: 'minHeight',
    note: 'IDENTIFY YOURSELF — the whole page for a signed-out member' },
];

/**
 * EVERY touchable on this page, and what was decided about it.
 *
 * The list above is a list, and a list is what let ten controls sit under the
 * floor while this file stayed green — the exact flaw this project diagnosed in
 * the app-wide guard and then rebuilt here. So the page is ENUMERATED: every
 * `<PressableScale` in these files must appear below, either because its box
 * reaches 48 or as a stated exception. A control nobody has decided about fails
 * the suite; it cannot simply be absent.
 */
const PAGE = [
  'src/components/log/LogForm.tsx',
  'src/components/log/LogSealBar.tsx',
  'src/components/log/LogIndexEntry.tsx',
  'src/components/log/LogClearanceGate.tsx',
  'src/components/log/EditorialDesk.tsx',
  'src/components/log/AuteurToolkit.tsx',
  'app/(modals)/log-modal.tsx',
];

/** Each control is identified by a fragment unique to its opening tag. */
const ACCOUNTED: { marker: string; why: string }[] = [
  // — reach 48 by their own geometry —
  { marker: 'setPosterOpen(o => !o)', why: 'the docket poster, 120x180' },
  { marker: 'setAltPoster(null)', why: 'pThumb 48x72' },
  { marker: 'setAltPoster(p.file_path)', why: 'pImg 48x72' },
  { marker: 'setStatus(s)', why: 'statusBtn minHeight 48' },
  { marker: 'setAbandonedReason(r)', why: 'hit48 box around the tag' },
  { marker: 'setIsSpoiler(!isSpoiler)', why: 'spoilerRow minHeight 48' },
  { marker: 'setDeskOpen(true)', why: 'deskFoot minHeight 48' },
  { marker: 'setPhysicalMedia(opt)', why: 'hit48 box around the tag' },
  { marker: 'toggleList(list.id)', why: 'hit48 box around the chip' },
  { marker: 'setShowDeleteConfirm(true)', why: 'deleteBtn minHeight 48' },
  { marker: 'setShowDeleteConfirm(false)', why: 'deleteNo minHeight 48' },
  { marker: 'handleDelete()', why: 'deleteYes minHeight 48' },
  { marker: 'discardDraft()', why: 'discardBtn minHeight 48' },
  { marker: 'setStep(0)', why: 'backBtn 48x48' },
  { marker: 'nav.back()', why: 'closeBtn minHeight 48' },
  { marker: "nav.replace('/login')", why: 'signInBtn minHeight 48' },
  { marker: 'onSeal()', why: 'the seal, press minHeight 48' },
  { marker: 'setEditorialHeader(null)', why: 'stillThumb 80x48' },
  { marker: 'setEditorialHeader(p.file_path)', why: 'stillImg 80x48' },
  { marker: 'setDropCap(!dropCap)', why: 'spoilerRow minHeight 48' },
  { marker: 'onPress={onPress}', why: 'the index row, idxEntry minHeight 48; and the clearance gate, minHeight 48' },

  // — stated exceptions —
  { marker: 'setDate(todayStr)', why: 'hit48 box around the date pill' },
  { marker: 'setDate(yesterday)', why: 'hit48 box around the date pill' },
  { marker: 'setCalendarOpen(!calendarOpen)', why: 'ruledRow minHeight 48' },
  { marker: 'setWatchedWith(watchedWith.replace', why: 'EXEMPT: the @handle suggestions are inline text links inside a wrapping row. Both platforms carve inline links out of the minimum rather than excusing them — this is a category the standard names, not a decision taken against it, and a 48pt box per handle would break the line it belongs to.' },
  {
    marker: 'setAutopsy({ ...autopsy',
    why: 'EXCEPTION: the autopsy notches are an 18pt film-strip track lifted to ' +
      '44 by a halo. Reaching 48 by geometry would nearly triple the gauge and ' +
      'destroy what it imitates — a design decision about the instrument, not a ' +
      'defect. The one control on this page the rule is knowingly not applied to.',
  },
];

describe('every touchable on this page has been decided about', () => {
  it('there is ONE exception on this page, and it argues its case', () => {
    // Three exceptions became one. The @handle suggestions are inline text
    // links, which both platforms exempt outright rather than excuse; and the
    // date pills were only ever short to save 23pt, which is not worth the page
    // carrying three rules instead of one. What is left is the autopsy gauge,
    // which is genuinely a different shape of thing.
    const exceptions = ACCOUNTED.filter(a => a.why.startsWith('EXCEPTION'));
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].marker).toContain('setAutopsy');
  });

  it('the enumeration is complete — nothing is merely absent', () => {
    const unaccounted: string[] = [];
    let counted = 0;
    for (const file of PAGE) {
      const src = read(file);
      const re = /<PressableScale/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        counted++;
        // The whole opening tag, brace- and string-aware.
        let depth = 0, i = m.index, str: string | null = null;
        for (; i < src.length; i++) {
          const c = src[i];
          if (str) { if (c === str && src[i - 1] !== '\\') str = null; continue; }
          if (c === '"' || c === "'" || c === '`') { str = c; continue; }
          if (c === '{') depth++;
          else if (c === '}') depth--;
          else if (c === '>' && depth === 0) break;
        }
        const tag = src.slice(m.index, i);
        if (!ACCOUNTED.some(a => tag.includes(a.marker))) {
          unaccounted.push(`${file}:${src.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    expect(counted).toBeGreaterThan(15);   // a scanner that finds nothing proves nothing
    expect(unaccounted).toEqual([]);
  });

  it('every exception says why, at length', () => {
    // An exception with a thin reason is a defect wearing a label.
    for (const a of ACCOUNTED.filter(x => /^(EXCEPTION|EXEMPT)/.test(x.why))) {
      expect(a.why.length).toBeGreaterThan(60);
    }
  });
});

describe('the composer’s controls reach the floor without a halo', () => {
  for (const c of CONTROLS) {
    it(`${c.style} is at least ${FLOOR}pt (${c.note})`, () => {
      const body = styleBody(read(c.file), c.style);
      // A style that cannot be found must fail, never pass by absence.
      expect(body).not.toBeNull();
      const h = num(body!, c.prop);
      expect(h).not.toBeNull();
      expect(h).toBeGreaterThanOrEqual(FLOOR);
    });
  }

  it('the header did not grow to pay for CLOSE', () => {
    // Raising the button to 48 must not push the chrome down the page: the
    // button's own box supplies the air the padding used to. 8 + 48 + 8 is the
    // 64 this header always was, and the mark stays 24pt from the top.
    const header = styleBody(read('src/components/log/LogModalStyles.ts'), 'header');
    expect(header).not.toBeNull();
    const pad = num(header!, 'paddingTop');
    const close = styleBody(read('src/components/log/LogModalStyles.ts'), 'closeBtn');
    expect(pad! * 2 + num(close!, 'minHeight')!).toBeLessThanOrEqual(64);
  });

  it('the chip is never stretched to fill its own touch box', () => {
    // A flex container defaults to align-items: stretch, which would have
    // grown the chip to 48 and undone the reason the box exists.
    const hit = styleBody(read('src/components/log/LogModalStyles.ts'), 'hit48');
    expect(hit).toMatch(/alignItems:\s*'flex-start'/);
  });

  it('the shared box clears the floor sideways too', () => {
    // A chip is only as wide as its label. A stack called "80s" would have been
    // a 32pt target across, so the box states minWidth as well as minHeight.
    const hit = styleBody(read('src/components/log/LogModalStyles.ts'), 'hit48');
    expect(num(hit!, 'minWidth')).toBeGreaterThanOrEqual(FLOOR);
  });

  it('a control that reaches the floor claims no halo at all', () => {
    // THE OTHER HALF OF THE RULE, and the half that was missed: raising the
    // geometry without dropping the halo leaves the control claiming MORE than
    // the floor, which is precisely how a control comes to take its neighbour's
    // taps. Every one of these had its box raised to 48 and kept the slop it
    // used to need.
    const SIZED: [string, string][] = [
      ['src/components/log/LogForm.tsx', 'setStatus(s)'],
      ['src/components/log/LogForm.tsx', 'setAltPoster(null)'],
      ['src/components/log/LogForm.tsx', 'setAltPoster(p.file_path)'],
      ['src/components/log/LogForm.tsx', 'setShowDeleteConfirm(true)'],
      ['src/components/log/LogForm.tsx', 'toggleList(list.id)'],
      ['src/components/log/LogForm.tsx', 'setAbandonedReason(r)'],
      ['src/components/log/LogForm.tsx', 'setPhysicalMedia(opt)'],
      ['src/components/log/LogForm.tsx', 'setIsSpoiler(!isSpoiler)'],
      ['src/components/log/LogForm.tsx', 'setShowDeleteConfirm(false)'],
      ['src/components/log/LogForm.tsx', 'setDate(todayStr)'],
      ['src/components/log/LogForm.tsx', 'setDate(yesterday)'],
      ['src/components/log/LogForm.tsx', 'setCalendarOpen(!calendarOpen)'],
      ['src/components/log/EditorialDesk.tsx', 'setEditorialHeader(null)'],
      ['src/components/log/EditorialDesk.tsx', 'setEditorialHeader(p.file_path)'],
    ];
    for (const [file, marker] of SIZED) {
      const src = read(file);
      const at = src.indexOf(marker);
      expect(at).toBeGreaterThan(-1);
      // THE ENCLOSING TAG, not a window around the handler. A window caught the
      // NEIGHBOURING control's `null` first and passed while this one carried a
      // halo — the mutation that proved it is why this reads the tag.
      const open = src.lastIndexOf('<PressableScale', at);
      expect(open).toBeGreaterThan(-1);
      let depth = 0, end = open, str: string | null = null;
      for (; end < src.length; end++) {
        const c = src[end];
        if (str) { if (c === str && src[end - 1] !== '\\') str = null; continue; }
        if (c === '"' || c === "'" || c === '`') { str = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (c === '>' && depth === 0) break;
      }
      const tag = src.slice(open, end);
      expect(tag).toContain(marker);
      const slop = tag.match(/hitSlop=\{(null|\{[^}]*\})\}/);
      expect(slop).not.toBeNull();
      expect(slop![1]).toBe('null');
    }
  });

  it('the seal uses minHeight, so enlarged text grows it instead of clipping', () => {
    // A fixed `height` on a control whose label scales to 1.35x would cut the
    // label off. Every control here that wraps text must be free to grow.
    const body = styleBody(read('src/components/log/LogSealBar.tsx'), 'press');
    expect(body).not.toBeNull();
    expect(body).toMatch(/minHeight/);
    expect(body).not.toMatch(/[^n]\bheight:/);
  });
});
