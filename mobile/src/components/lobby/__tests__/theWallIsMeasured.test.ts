/**
 * theWallIsMeasured.test.ts — the Lobby is laid out by arithmetic, and the
 * arithmetic is right.
 * ─────────────────────────────────────────────────────────────────────────────
 * Nothing on the wall is measured after it is drawn (a second pass is a
 * flicker), so every size and every choice of layout is decided here, from the
 * phone's width, the room between its bars and the member's text size. These
 * hold the arithmetic to what the phone draws:
 *
 *   A LINE IS MEASURED LETTER BY LETTER, from the app's own fonts — a W is wider
 *   than an i, and a letter the table does not hold is taken as the widest.
 *   IT GROWS ONLY AS FAR AS ITS ROOM, never past the house's ceiling, and a line
 *   that cannot fit at its own size is told so (its layout must give way).
 *   A NAME THAT MUST BE WHOLE STEPS DOWN before it is cut, to a floor.
 *   THE FEATURED LOG AND THE FEATURED STACK STAND SIDE BY SIDE on every phone,
 *   at every text size, each half's words set to its width.
 *   THE WALL GIVES WAY elsewhere, where its words do not fit side by side.
 *   THE FIRST SCREEN holds the masthead and the film's case, the bills below
 *   beginning at its foot.
 */
import {
  balancedWidth, ceilingFor, emOf, filmLine, fitsAt, HOUSE_CEILING, lineWidth, linesAt, MAST_GAPS, MAST_LINES, nameLines,
  planWall, setLines, TYPE, WALL, wholeName, wholeSize, type TypeKey, type WallPlan,
} from '../measure';
import { KEEP_OFF, LOG_BILL, STACK_BILL } from '../words';

// The phones the house is drawn for: width, and the room between the bars.
const PHONES = {
  se1: { width: 320, visible: 428 },
  androidSmall: { width: 360, visible: 642 },
  se: { width: 375, visible: 527 },
  iphone14PlusZoomed: { width: 375, visible: 609 },
  iphone14: { width: 390, visible: 641 },
  iphone15: { width: 393, visible: 649 },
  pixel7: { width: 412, visible: 741 },
  iphone14Plus: { width: 428, visible: 723 },
  proMax: { width: 430, visible: 729 },
  ipadMini: { width: 744, visible: 979 },
} as const;

describe('a line is measured letter by letter', () => {
  it('from the font, not a count: a W is wider than an i, and ten Ws than ten is', () => {
    expect(emOf('W', 'rye')).toBeGreaterThan(emOf('i', 'rye'));
    expect(lineWidth('WWWWWWWWWW', 'elite', 10)).toBeGreaterThan(lineWidth('iiiiiiiiii', 'elite', 10));
  });

  it('a letter the face does not hold is measured as its widest, never as nothing', () => {
    const arabic = 'نادراً';
    expect(emOf(arabic, 'rye')).toBeGreaterThanOrEqual([...arabic].length * 1);
  });

  it('grows with the text size; letter spacing is added as written', () => {
    const base = lineWidth('NOW SHOWING', 'elite', 10, 1, 0);
    expect(lineWidth('NOW SHOWING', 'elite', 10, 1.35, 0)).toBeCloseTo(base * 1.35, 5);
    expect(lineWidth('NOW SHOWING', 'elite', 10, 1, 4) - base).toBeCloseTo(4 * 'NOW SHOWING'.length, 5);
  });
});

describe('a line grows only as far as its room', () => {
  it('in plenty of room it grows to the house’s ceiling and no further', () => {
    expect(ceilingFor('Log', 'rye', 17, 0, 1000)).toBe(HOUSE_CEILING);
  });

  it('in some room it stops where the room ends — and there it fits', () => {
    const at1 = lineWidth('Featured', 'rye', 17);
    const room = at1 * 1.2;
    const cap = ceilingFor('Featured', 'rye', 17, 0, room);
    expect(cap).toBeGreaterThan(1);
    expect(cap).toBeLessThan(HOUSE_CEILING);
    expect(lineWidth('Featured', 'rye', 17, cap)).toBeLessThanOrEqual(room + 0.01);
  });

  it('a line that does not fit even at its own size gets 1 — its layout must give way', () => {
    expect(ceilingFor('A MUCH LONGER LINE THAN THE ROOM', 'elite', 10, 2, 40)).toBe(1);
  });
});

describe('a name that must be whole steps down before it is cut', () => {
  const long = 'Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb';

  it('a short name keeps its size', () => {
    expect(wholeSize('Resident Evil', 'rye', 32, 16, 5, 260, 1)).toEqual({ size: 32, whole: true });
  });

  it('a long one steps down until it fits its lines — and at that size it does', () => {
    // in three lines at 230pt, 67 letters of Rye cannot stand at 22
    expect(linesAt(long, 'rye', 22, 1, 0, 230)).toBeGreaterThan(3);
    const r = wholeSize(long, 'rye', 22, 10, 3, 230, 1);
    expect(r.whole).toBe(true);
    expect(r.size).toBeLessThan(22);
    expect(linesAt(long, 'rye', r.size, 1, 0, 230)).toBeLessThanOrEqual(3);
    // and it is the LARGEST size that fits: half a point more does not
    expect(linesAt(long, 'rye', r.size + 0.5, 1, 0, 230)).toBeGreaterThan(3);
  });

  it('one that cannot fit even at its floor is set at the floor and said to be cut', () => {
    expect(wholeSize(long.repeat(4), 'rye', 22, 16, 2, 150, 1)).toEqual({ size: 16, whole: false });
  });

  it('at a larger text size it steps further, measured at the size the phone draws', () => {
    const at1 = wholeSize(long, 'rye', 22, 14, 4, 240, 1).size;
    const at135 = wholeSize(long, 'rye', 22, 14, 4, 240, 1.35).size;
    expect(at135).toBeLessThanOrEqual(at1);
  });
});

describe('a short quote is set in the narrowest box that keeps its lines', () => {
  it('its lines stay as many, and the box is never wider than the room', () => {
    const q = 'movies can be so sick sometimes';
    const w = balancedWidth(q, 'spectralItalic', 19, 1, 150);
    expect(w).toBeLessThanOrEqual(150);
    expect(linesAt(q, 'spectralItalic', 19, 1, 0, w)).toBe(linesAt(q, 'spectralItalic', 19, 1, 0, 150));
  });

  it('one line is left as it is', () => {
    expect(balancedWidth('Brief.', 'spectralItalic', 19, 1, 300)).toBe(300);
  });
});

describe('the wall gives way where its words do not fit side by side', () => {
  it('on an iPhone 15 at its own text size, the runners, the tickets and the banners stand side by side', () => {
    const p = planWall({ ...PHONES.iphone15, scale: 1, lineScale: 1 });
    expect(p).toMatchObject({ runners: true, tickets: true, bannerStacked: false, recruitStacked: false });
  });

  it('a member’s text size past the ceiling is read as the ceiling (the Text wrapper caps it)', () => {
    expect(planWall({ ...PHONES.pixel7, scale: 2, lineScale: 2 })).toMatchObject(
      (({ titleSize, ...rest }) => rest)(planWall({ ...PHONES.pixel7, scale: HOUSE_CEILING, lineScale: 2 })),
    );
  });

  it('on a tablet the wall stands as one centred column, no wider than 560', () => {
    expect(planWall({ ...PHONES.ipadMini, scale: 1, lineScale: 1 }).wallW).toBe(560);
  });
});

describe('the Featured Log and the Featured Stack stand side by side on every phone, at every text size', () => {
  // The text sizes the capture pass lays the wall out at: iOS at its own, at the ceiling and at
  // its largest (whose line heights stop at the ceiling); Android at the ceiling and at 2×.
  const SIZES = [
    { size: 'iOS ×1', scale: 1, lineScale: 1 },
    { size: 'iOS ×1.35', scale: 1.35, lineScale: 1.35 },
    { size: 'iOS ×3.1', scale: 3.1, lineScale: 1.35 },
    { size: 'Android ×1.35', scale: 1.35, lineScale: 1.35 },
    { size: 'Android ×2', scale: 2, lineScale: 2 },
  ];
  const ON_PHONES = Object.entries(PHONES).filter(([, ph]) => ph.width < 700);
  const CASES = ON_PHONES.flatMap(([name, phone]) => SIZES.flatMap((sz) =>
    [true, false].map((admin) => [name, phone.width, sz.size, admin ? 'an admin' : 'a member', { ...phone, ...sz, admin }] as const)));

  /** Every line the plan sets in the pair, with the room it stands in, and why it is there. */
  function linesOf(p: WallPlan, scale: number, admin: boolean) {
    const { pair } = p;
    const out: { key: TypeKey; text: string; room: number }[] = [];
    const add = (key: TypeKey, lines: readonly string[], room: number) => lines.forEach((text) => out.push({ key, text, room }));
    add('slab', [...LOG_BILL.slab, ...STACK_BILL.slab], pair.slabRoom);
    for (const half of [pair.log, pair.stack]) {
      add('slogan', half.slogan, pair.room);
      add('vacant', half.vacant, pair.room);
      add('cta', half.door, pair.doorRoom);
    }
    add('cta', [LOG_BILL.readOn], pair.room);
    add('stackFacts', [STACK_BILL.seeAll], pair.seeAllRoom);
    add('stackFacts', [STACK_BILL.films(999)], pair.room);
    if (admin) add('cta', pair.keepOff, p.switchRoom.credit);
    return out;
  }

  /** Lines that hold neither at the member's size nor, one word growing only to its room, at ×1. */
  function misfitsOf(p: WallPlan, scale: number, admin: boolean) {
    return linesOf(p, scale, admin).filter(({ key, text, room }) => {
      const t = TYPE[key];
      const atMember = fitsAt(text, t.face, t.size, t.spacing, room, scale);
      const oneWord = !text.trim().includes(' ') || /^\S+ ›$/.test(text);
      return !(atMember || (oneWord && fitsAt(text, t.face, t.size, t.spacing, room, 1)));
    }).map(({ key, text, room }) => `${key} "${text}" in ${room.toFixed(1)}`);
  }

  it.each(CASES)('%s, %ipt, %s, %s: two halves share the row, and every line holds in its half', (_n, _w, _s, _v, room) => {
    const p = planWall(room);
    const { pair } = p;
    // side by side: the two halves and the gap between fill the wall's row
    expect(pair.width * 2 + WALL.gap).toBeCloseTo(p.wallW, 6);
    expect(pair.room).toBeCloseTo(pair.width - WALL.halfPad * 2, 6);
    expect(p.switchRoom.credit).toBeCloseTo(pair.room - WALL.creditInset, 6);
    expect(misfitsOf(p, room.scale, room.admin)).toEqual([]);
    // an admin's switch on a filing is drawn on one line, so its room must hold it whole
    if (room.admin) {
      for (const at of [p.switchRoom.lead, p.switchRoom.runner]) expect(setLines(KEEP_OFF, 'cta', at, room.scale)).toEqual([KEEP_OFF]);
    }
    // the count and SEE ALL share a line only where both hold on it at the member's size
    const f = TYPE.stackFacts;
    const at = (text: string) => lineWidth(text, f.face, f.size, Math.min(room.scale, HOUSE_CEILING), f.spacing);
    if (!pair.factsStacked) {
      expect(at(STACK_BILL.films(999)) + WALL.factsGap + at(STACK_BILL.seeAll)).toBeLessThanOrEqual(pair.room + 0.5);
    }
  });

  it.each(CASES)('%s, %ipt, %s, %s: every phrase is all its words, in order, never one cut', (_n, _w, _s, _v, room) => {
    const { pair } = planWall(room);
    const said = (lines: readonly string[]) => lines.join(' ');
    expect(said(pair.log.slogan)).toBe(said(LOG_BILL.slogan).toUpperCase());
    expect(said(pair.stack.slogan)).toBe(said(STACK_BILL.slogan).toUpperCase());
    expect(said(pair.log.vacant)).toBe(said(LOG_BILL.vacant));
    expect(said(pair.stack.vacant)).toBe(said(STACK_BILL.vacant));
    expect(said(pair.log.door)).toBe(LOG_BILL.vacantDoor);
    expect(said(pair.stack.door)).toBe(STACK_BILL.vacantDoor);
    expect(said(pair.keepOff)).toBe(KEEP_OFF);
    // a › never stands alone on a line
    for (const line of [...pair.log.door, ...pair.stack.door]) expect(line.trim()).not.toBe('›');
  });

  it('the narrowest half at the largest size: a slogan line and a door that would not hold on one line break', () => {
    const { pair } = planWall({ ...PHONES.se1, scale: 1.35, lineScale: 1.35, admin: true });
    const t = TYPE.slogan;
    expect(fitsAt(LOG_BILL.slogan[1].toUpperCase(), t.face, t.size, t.spacing, pair.room, 1.35)).toBe(false);
    expect(pair.log.slogan.length).toBeGreaterThan(LOG_BILL.slogan.length);
    expect(pair.stack.door).toEqual(['START A', 'STACK ›']);
  });

  describe('the owner’s phone, an iPhone 14 Plus: 428pt, and 375 under Display Zoom', () => {
    it.each([
      ['428pt', PHONES.iphone14Plus, 195],
      ['375pt (Larger Text zoom)', PHONES.iphone14PlusZoomed, 168.5],
    ] as const)('%s, at its own text size and at the largest, admin and member: side by side', (_name, phone, halfW) => {
      for (const sz of [{ scale: 1, lineScale: 1 }, { scale: 3.1, lineScale: 1.35 }, { scale: 2, lineScale: 2 }]) {
        for (const admin of [true, false]) {
          const p = planWall({ ...phone, ...sz, admin });
          expect(p.pair.width).toBe(halfW);
          expect(misfitsOf(p, sz.scale, admin)).toEqual([]);
        }
      }
    });
  });
});

describe('a phrase on a half bill breaks between its words, as few lines and as even as it can', () => {
  const t = TYPE.slogan;
  const width = (text: string, scale: number) => lineWidth(text, t.face, t.size, scale, t.spacing);

  it('one that fits is one line, exactly as written', () => {
    expect(setLines('EVERY STACK', 'slogan', 300, 1.35)).toEqual(['EVERY STACK']);
  });

  it('one that does not breaks evenly: its widest line as narrow as it can be', () => {
    const room = width('A CERTIFIED OPINION', 1) - 1;
    expect(setLines('A CERTIFIED OPINION', 'slogan', room, 1)).toEqual(['A CERTIFIED', 'OPINION']);
    expect(setLines('IS A PUBLIC SERVICE.', 'slogan', width('IS A PUBLIC SERVICE.', 1) - 1, 1)).toEqual(['IS A PUBLIC', 'SERVICE.']);
  });

  it('a › keeps to the word before it', () => {
    const c = TYPE.cta;
    const room = lineWidth('START A STACK', c.face, c.size, 1, c.spacing);
    expect(setLines('START A STACK ›', 'cta', room, 1)).toEqual(['START A', 'STACK ›']);
  });

  it('a word wider than the room takes a line of its own, and the rest still break where they fit', () => {
    expect(setLines('IS A CONFESSION.', 'slogan', width('IS A', 1.35) + 1, 1.35)).toEqual(['IS A', 'CONFESSION.']);
  });
});

describe('a name on a half bill never breaks a word mid-letter', () => {
  const titles = [
    'The Godfather', 'Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb', "Schindler's List",
    'Every Film I Watched Alone In An Empty Cinema On A Tuesday Afternoon', 'Extraordinarily Uncomfortable Masterpieces',
  ];

  it('it grows only as far as its longest word fits its line, at every half and text size', () => {
    for (const phone of Object.values(PHONES).filter((ph) => ph.width < 700)) {
      for (const scale of [1, 1.35]) {
        const { pair } = planWall({ ...phone, scale, lineScale: scale });
        for (const title of titles) {
          const n = wholeName(title, 'rye', 18, 14, 4, pair.room, scale);
          expect(n.cap).toBeLessThanOrEqual(Math.max(1, scale));
          for (const word of title.split(' ')) {
            expect([phone.width, scale, word, lineWidth(word, 'rye', n.size, n.cap) <= pair.room + 0.5]).toEqual([phone.width, scale, word, true]);
          }
        }
      }
    }
  });

  it('the film’s name stands beside its poster only where it is whole there; its reels, only where they fit', () => {
    for (const phone of Object.values(PHONES).filter((ph) => ph.width < 700)) {
      for (const scale of [1, 1.35]) {
        const { pair } = planWall({ ...phone, scale, lineScale: scale });
        const meta = pair.room - WALL.filmThumb - WALL.filmGap;
        for (const title of titles.slice(0, 3)) {
          const f = filmLine(title, pair.room, scale, 89);
          expect([phone.width, scale, f.reelsBeside]).toEqual([phone.width, scale, meta >= 89]);
          if (f.beside) {
            expect([phone.width, scale, title, f.whole && f.cap >= scale]).toEqual([phone.width, scale, title, true]);
          }
          // under the poster it is set across the whole half, and no word in it is wider than that
          const at = f.beside ? meta : pair.room;
          for (const word of LOG_BILL.on(title).split(' ')) {
            expect(lineWidth(word, 'elite', f.size, f.cap, TYPE.filmLine.spacing)).toBeLessThanOrEqual(at + 0.5);
          }
        }
      }
    }
    // the narrowest phone: under its poster; the widest, beside it
    expect(filmLine('The Godfather', planWall({ ...PHONES.se1, scale: 1, lineScale: 1 }).pair.room, 1, 89).beside).toBe(false);
    expect(filmLine('The Godfather', planWall({ ...PHONES.proMax, scale: 1, lineScale: 1 }).pair.room, 1, 89).beside).toBe(true);
  });

  it('a quote and a stack’s name are given more lines in a narrower half, never fewer than at the widest', () => {
    const narrow = planWall({ ...PHONES.se1, scale: 1, lineScale: 1 }).pair;
    const wide = planWall({ ...PHONES.proMax, scale: 1, lineScale: 1 }).pair;
    expect(wide.quoteLines).toBe(6);
    expect(narrow.quoteLines).toBeGreaterThan(wide.quoteLines);
    expect(nameLines(wide.room)).toBe(4);
    expect(nameLines(narrow.room)).toBeGreaterThan(4);
    // the house's own sample stack is whole in them on the narrowest half, at the largest size
    expect(wholeName('Films That Wait For You', 'rye', 18, 14, nameLines(narrow.room), narrow.room, 1.35).whole).toBe(true);
  });
});

describe('the first screen', () => {
  const MAST = Object.values(MAST_LINES).reduce((a, b) => a + b, 0) + Object.values(MAST_GAPS).reduce((a, b) => a + b, 0);

  it('holds the masthead and the whole case wherever the room allows, the bills beginning at its foot', () => {
    for (const [name, phone] of Object.entries(PHONES)) {
      const p = planWall({ ...phone, scale: 1, lineScale: 1 });
      const used = 12 + MAST + p.sheetH + 6;
      // the case is never taller than a 2:3 poster, and never taller than the first screen leaves it (a 260 floor aside)
      expect([name, p.sheetH <= Math.round(p.sheetW * 1.5)]).toEqual([name, true]);
      expect([name, p.sheetH === 260 || used <= phone.visible]).toEqual([name, true]);
    }
  });

  it('the bill beside it holds two to four posters, each near a poster’s 2:3', () => {
    for (const [name, phone] of Object.entries(PHONES)) {
      for (const scale of [1, 1.35]) {
        const p = planWall({ ...phone, scale, lineScale: scale });
        expect([name, p.billCount >= 2 && p.billCount <= 4]).toEqual([name, true]);
        const head = 3 * 13.5 * scale + 2;
        const each = (p.sheetH + 6 - head - 48 - 6 * p.billCount) / p.billCount;
        // a poster stretched or squashed past a third of its shape would read as a mistake
        expect([name, scale, each / p.col > 1.0 && each / p.col < 2.0]).toEqual([name, scale, true]);
      }
    }
  });
});
