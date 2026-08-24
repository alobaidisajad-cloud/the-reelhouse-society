/**
 * roomInset.test.ts — one distance from the screen edge, actually shared.
 *
 * ── WHAT THIS CAUGHT ─────────────────────────────────────────────────────────
 * `ROOM_INSET` was introduced to give the six rooms one page inset, and then
 * used in exactly ONE style rule. Six other page-level insets kept a literal
 * 16 — including the two that position the top nav and every tab header.
 * Identical today, so nothing looked wrong; the moment the constant moved they
 * would have drifted apart in six places at once.
 *
 * Worse, the Projector tab had no inset at all around ProjectorRoom, while the
 * buttons above it and every section below sat 16pt in. The one bordered card
 * on the page ran edge to edge, 32pt wider than its neighbours.
 *
 * Both are the same failure: fixing the instance in front of me instead of the
 * class. So the class is the test.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ROOM_INSET } from '../roomStyles';

const HERE = join(__dirname, '..');
const APP = join(__dirname, '..', '..', '..', '..', 'app');
const read = (p: string) => readFileSync(p, 'utf8');
/** Comments name the literals they replaced; prose must not fail its own guard. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/**
 * Style rules that position content relative to the SCREEN EDGE.
 *
 * Deliberately NOT every `paddingHorizontal: 16` in the file. A card's inner
 * padding is a different measurement that happens to share a number today —
 * coupling them would mean changing the page margin silently reflows the inside
 * of every card. `card` and `ranksPlate` are inner padding and stay literal.
 */
const PAGE_INSET_RULES = [
  ['profileStyles.ts', 'topNav'],
  ['profileStyles.ts', 'tabPageHeader'],
  ['profileStyles.ts', 'tabContentPad'],
  ['profileStyles.ts', 'projectorSectionsWrap'],
  ['profileStyles.ts', 'sealedPad'],
  ['ProfileArchiveTab.tsx', 'searchWrap'],
  ['ProfileArchiveTab.tsx', 'walkRow'],
] as const;

describe('one inset from the screen edge, named once', () => {
  it.each(PAGE_INSET_RULES)('%s → %s derives its inset from ROOM_INSET', (file, rule) => {
    const src = code(read(join(HERE, file)));
    // Grab the rule body: `name: { ... }` up to its closing brace.
    const m = new RegExp(`\\b${rule}\\s*:\\s*\\{([\\s\\S]*?)\\}`).exec(src);
    expect(m).not.toBeNull();
    const body = m![1];
    expect(body).toMatch(/padding(?:Horizontal)?:\s*ROOM_INSET/);
    // Behavioural, not merely textual: a literal would also "contain" 16.
    expect(body).not.toMatch(/padding(?:Horizontal)?:\s*\d/);
  });

  it('the rules it claims to check actually exist', () => {
    // If a rule were renamed, the regex above would return null and the test
    // would fail — but a typo in THIS list would silently check nothing. This
    // pins the count so shrinking the list is visible.
    expect(PAGE_INSET_RULES.length).toBe(7);
  });

  it('ROOM_INSET is a real, sane number', () => {
    expect(typeof ROOM_INSET).toBe('number');
    expect(ROOM_INSET).toBeGreaterThan(0);
    expect(ROOM_INSET).toBeLessThan(40);
  });
});

describe('the Projector tab does not put one card outside the margin', () => {
  const screen = code(read(join(APP, 'user', '[username].tsx')));

  it('wraps ProjectorRoom in the same inset as its neighbours', () => {
    // The defect: `<ProjectorRoom …/>` sat as a direct child of a container
    // with no horizontal padding, between two blocks that both had one.
    const m = /<ProjectorRoom[\s\S]{0,400}?\/>/.exec(screen);
    expect(m).not.toBeNull();
    const before = screen.slice(Math.max(0, m!.index - 200), m!.index);
    expect(before).toMatch(/<View style=\{s\.tabContentPad\}>\s*$/);
  });

  it('no component sits at the top of that tab outside a padded wrapper', () => {
    /**
     * Enumerated, not listed. Pull the Projector tab block and look at what sits
     * at its top level. A bare `<View …>` there is a WRAPPER and is expected —
     * what must never appear is a component rendering content directly, because
     * the container it sits in has no horizontal padding of its own. That is
     * precisely how ProjectorRoom ended up 32pt wider than everything near it.
     */
    const block = /activeTab === 'projector' && \(([\s\S]*?)\n {18}<\/View>/.exec(screen);
    expect(block).not.toBeNull();
    const topLevel = [...block![1].matchAll(/^ {18}<([A-Z]\w+)/gm)].map((x) => x[1]);
    expect(topLevel.length).toBeGreaterThan(0); // the sweep found something
    expect(topLevel.filter((tag) => tag !== 'View')).toEqual([]);
  });

  it('and every one of those wrappers actually carries an inset', () => {
    // Without this the check above passes for a <View> with no style at all —
    // which would put its children right back against the screen edge.
    const block = /activeTab === 'projector' && \(([\s\S]*?)\n {18}<\/View>/.exec(screen);
    const wrappers = [...block![1].matchAll(/^ {18}<View([^>]*)>/gm)].map((x) => x[1]);
    expect(wrappers.length).toBeGreaterThan(0);
    for (const attrs of wrappers) {
      expect(attrs).toMatch(/s\.(tabContentPad|projectorSectionsWrap)/);
    }
  });
});
