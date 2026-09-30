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
 *   THE WALL GIVES WAY where its words do not fit side by side.
 *   THE FIRST SCREEN holds the masthead and the film's case, the bills below
 *   beginning at its foot.
 */
import {
  balancedWidth, ceilingFor, emOf, HOUSE_CEILING, lineWidth, linesAt, MAST_GAPS, MAST_LINES, planWall, wholeSize,
} from '../measure';

// The phones the house is drawn for: width, and the room between the bars.
const PHONES = {
  se1: { width: 320, visible: 428 },
  androidSmall: { width: 360, visible: 642 },
  se: { width: 375, visible: 527 },
  iphone15: { width: 393, visible: 649 },
  pixel7: { width: 412, visible: 741 },
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
  it('on an iPhone 15 at its own text size, the bills stand side by side', () => {
    const p = planWall({ ...PHONES.iphone15, scale: 1, lineScale: 1 });
    expect(p).toMatchObject({ pairs: true, runners: true, tickets: true, bannerStacked: false, recruitStacked: false });
  });

  it('on the smallest iPhone the log and the stack stand one above the other', () => {
    expect(planWall({ ...PHONES.se1, scale: 1, lineScale: 1 }).pairs).toBe(false);
  });

  it('at the largest text size the pair gives way on every phone', () => {
    for (const phone of Object.values(PHONES).filter((ph) => ph.width < 700)) {
      expect(planWall({ ...phone, scale: 1.35, lineScale: 1.35 }).pairs).toBe(false);
    }
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
