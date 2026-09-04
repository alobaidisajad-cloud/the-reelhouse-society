/**
 * wireCarriesItsSource.test.tsx — the promise the picker makes.
 * ─────────────────────────────────────────────────────────────────────────────
 * The picker shows five forms, and the wire's line is:
 *
 *     WIRE — News from elsewhere, carrying its source.
 *
 * The desk that opened had no source field. It required a FILM instead, and
 * filed the film's TITLE into `source` — so a wire's provenance, printed on the
 * card as the dateline beside the member's byline, read `TOKYO STORY`.
 *
 * Three separate things all said this was wrong and none of them was checked:
 * the picker's own line, the database's `wire_source` CHECK (which the film
 * title happened to satisfy, which is why nothing failed), and `MAX_LENGTHS`,
 * which has carried a `wireSource: 100` entry that nothing ever wrote.
 *
 * A fourth: the composer PRINTED `SOURCE — ` as the lead-in above the body
 * field, while the card prints `WIRE — ` in that position. The component's own
 * docstring names that exact failure — "the desk promised 'this is how it
 * prints' and then printed something else".
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { ComposeShortScreen, ComposeBallotScreen } from '@/src/components/dispatch/ComposeDesks';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';

const mockFiled: Array<Record<string, unknown>> = [];

/** Flipped by the signed-out block at the foot of this file. */
let mockSignedOut = false;
/** The two ways filing does not simply succeed. Both were dark. */
let mockFileFails = false;
let mockFileOffline = false;

jest.mock('@/src/stores/auth', () => ({
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const state = {
        user: mockSignedOut
          ? null
          : { id: 'u1', username: 'me', member_no: 7, avatar_url: null },
      };
      return typeof sel === 'function' ? sel(state) : state;
    },
    { getState: () => ({ user: mockSignedOut ? null : { id: 'u1', username: 'me' } }) },
  ),
}));

jest.mock('@/src/stores/dispatch', () => ({
  useDispatch: {
    getState: () => ({
      file: async (draft: Record<string, unknown>) => {
        mockFiled.push(draft);
        if (mockFileFails) throw new Error('refused');
        return mockFileOffline ? { id: 'new', offline: true } : { id: 'new' };
      },
    }),
  },
}));

// `search`, which is what FilmPicker calls — `searchMovies` was a guess, and a
// mock that names a method the code never calls silently provides nothing.
let mockResults: Array<Record<string, unknown>> = [];
jest.mock('@/src/lib/tmdb', () => ({ tmdb: { search: async () => ({ results: mockResults }) } }));
const mockToast = { error: jest.fn(), success: jest.fn() };
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), {
    error: (...a: unknown[]) => mockToast.error(...a),
    success: (...a: unknown[]) => mockToast.success(...a),
  });
  return { __esModule: true, default: fn };
});

beforeEach(() => {
  mockFiled.length = 0;
  mockResults = [];
  mockToast.error.mockClear(); mockToast.success.mockClear();
  jest.useFakeTimers({ doNotFake: ['nextTick'] });
});
afterEach(() => { jest.useRealTimers(); });

/**
 * Typing, flushed.
 *
 * State never settles synchronously in this repo's jest setup — a bare
 * `fireEvent.changeText` leaves the component on its previous render, so
 * `ready` stays false and FILE IT is still announced as "not ready yet". This
 * project has a standing note about it and the first draft of this file broke
 * it in six places.
 */
const type = async (field: unknown, text: string) => {
  await act(async () => { fireEvent.changeText(field as never, text); });
};
const press = async (control: unknown) => {
  await act(async () => { fireEvent.press(control as never); });
};

describe('the wire desk', () => {
  it('asks where it came from, and says the field is required', () => {
    const { getByText, getByLabelText } = render(<ComposeShortScreen kind="wire" />);
    expect(getByText('SOURCE — REQUIRED')).toBeTruthy();
    expect(getByLabelText('Where this came from')).toBeTruthy();
  });

  it('prints WIRE above the body, which is what the card prints there', () => {
    // `SOURCE — ` sat here, labelling the body field as the source while the
    // real source went in silently as the film's title.
    const { getByText, queryByText } = render(<ComposeShortScreen kind="wire" />);
    expect(getByText('WIRE — ')).toBeTruthy();
    expect(queryByText('SOURCE — ')).toBeNull();
  });

  it('will not file until the source is there', async () => {
    const { getByLabelText } = render(<ComposeShortScreen kind="wire" />);
    await type(getByLabelText('Your wire'), 'Sight & Sound has redone the poll.');

    // Words but no provenance: the database would refuse this row, so the desk
    // refuses it first rather than letting somebody write a wire and be turned
    // down at the end by a rule they were never shown.
    expect(getByLabelText('File it. Not ready yet').props.accessibilityState.disabled).toBe(true);

    await type(getByLabelText('Where this came from'), 'Sight & Sound');
    expect(getByLabelText('File it').props.accessibilityState.disabled).toBe(false);
  });

  it('files what the member typed, not the film’s title', async () => {
    const { getByLabelText } = render(<ComposeShortScreen kind="wire" />);
    await type(getByLabelText('Your wire'), 'The poll has been redone.');
    await type(getByLabelText('Where this came from'), 'Sight & Sound');
    await press(getByLabelText('File it'));

    expect(mockFiled).toHaveLength(1);
    expect(mockFiled[0].source).toBe('Sight & Sound');
    expect(mockFiled[0].kind).toBe('wire');
  });

  it('caps the source at what the column will take', () => {
    // `source_ceiling` is 100 characters. A field with no cap would let somebody
    // write a hundred and one and be refused by a constraint they cannot see —
    // and the body deliberately has NO cap, for the opposite reason, so the two
    // decisions have to be told apart rather than applied uniformly.
    const { getByLabelText } = render(<ComposeShortScreen kind="wire" />);
    expect(getByLabelText('Where this came from').props.maxLength).toBe(MAX_LENGTHS.wireSource);
    expect(getByLabelText('Your wire').props.maxLength).toBeUndefined();
  });

  it('carries the film as the SUBJECT, and a spoiler when marked', async () => {
    const { getByLabelText } = render(<ComposeShortScreen kind="take" />);
    await type(getByLabelText('Your take'), 'The ending is the whole film.');
    await press(getByLabelText(/Mark a spoiler/i));

    await press(getByLabelText('Name a film'));
    mockResults = [{ id: 42, title: 'Tokyo Story', release_date: '1953-01-01', media_type: 'movie', poster_path: '/p.jpg' }];
    await type(getByLabelText('Search for a film'), 'tokyo');
    await act(async () => { jest.advanceTimersByTime(400); await Promise.resolve(); });
    await press(getByLabelText('Tokyo Story, 1953'));

    await press(getByLabelText('File it'));
    await act(async () => { await Promise.resolve(); });

    expect(mockFiled[0].spoilerLabel).toBe('SPOILERS');
    expect(mockFiled[0].film).toMatchObject({ id: 42, title: 'Tokyo Story', sub: '1953' });
  });

  it('refuses a still until a film is named', async () => {
    // A still belongs to a film. Offering the control before one is named would
    // open a picker with nothing to pick from.
    const { getByLabelText } = render(<ComposeShortScreen kind="take" />);
    await press(getByLabelText(/Add a still/i));
    expect(String(mockToast.error.mock.calls[0][0])).toMatch(/Name a film first/);
  });

  it('does not put the word KEYBOARD on a member’s screen', async () => {
    /**
     * Every desk ended with a 210pt block containing the word KEYBOARD — a
     * DRAWING device, so a mockup shows the composer at its real height. Two of
     * the desks that render it are mounted by the app, so the app shipped it.
     *
     * A contrast sweep found the label at 2.71:1 and I went looking for why a
     * label was that quiet; it was quiet because nobody was ever meant to read
     * it. And a fixed 210pt is not keyboard avoidance either — the keyboard's
     * height is not knowable in advance, so it left the tool rail underneath it.
     */
    for (const kind of ['take', 'seeking', 'wire'] as const) {
      const { queryByText } = render(<ComposeShortScreen kind={kind} />);
      expect(queryByText('KEYBOARD')).toBeNull();
    }
    const ballot = render(<ComposeBallotScreen />);
    expect(ballot.queryByText('KEYBOARD')).toBeNull();
  });

  it('asks a take for no source at all', async () => {
    const { queryByText, getByLabelText } = render(<ComposeShortScreen kind="take" />);
    expect(queryByText('SOURCE — REQUIRED')).toBeNull();
    await type(getByLabelText('Your take'), 'Ozu is the only one who ever sat down.');
    expect(getByLabelText('File it').props.accessibilityState.disabled).toBe(false);
  });
});

/**
 * ── THE DESKS, READ ALOUD ───────────────────────────────────────────────────
 * The third surface. The feed sweep found the index saying "ALL, middle dot,
 * TAKES, middle dot…" and every card opening "147. TOMASREYES · No. 147"; the
 * reader came back clean. A desk is where a member WRITES, so a mark read out
 * in the middle of their own sentence is the worst place for one — and the
 * composer draws a caret, which is a picture made out of a character.
 */
describe('the desks, read aloud', () => {
  const spokenStrings = (node: any, off = false, out: string[] = []): string[] => {
    if (node == null || typeof node === 'string') return out;
    if (Array.isArray(node)) { for (const n of node) spokenStrings(n, off, out); return out; }
    const p = node.props ?? {};
    // Hiding is INHERITED — the flag travels down, it is not read per node.
    const hidden = off
      || p.accessibilityElementsHidden === true
      || p.importantForAccessibility === 'no-hide-descendants'
      || p.accessible === false;
    const own = (node.children ?? []).filter((c: any) => typeof c === 'string').join('').trim();
    if (own && !hidden) out.push(own);
    spokenStrings(node.children, hidden, out);
    return out;
  };

  const controls = (node: any, out: { role?: string; label?: string; text: string }[] = []) => {
    if (node == null || typeof node === 'string') return out;
    if (Array.isArray(node)) { for (const n of node) controls(n, out); return out; }
    const p = node.props ?? {};
    // `onPress` is consumed by Pressability and never reaches a host node.
    if (typeof p.onStartShouldSetResponder === 'function' || p.accessibilityRole) {
      const text: string[] = [];
      const walk = (n: any) => {
        if (n == null) return;
        if (typeof n === 'string') { if (n.trim()) text.push(n.trim()); return; }
        if (Array.isArray(n)) { n.forEach(walk); return; }
        walk(n.children);
      };
      walk(node);
      out.push({ role: p.accessibilityRole, label: p.accessibilityLabel, text: text.join(' ') });
    }
    controls(node.children, out);
    return out;
  };

  const echoes = (a: string, b: string): boolean => {
    const at = b.indexOf(a);
    if (at === -1) return false;
    const wordish = /[A-Za-z0-9\u0600-\u06FF]/;
    const before = b[at - 1]; const after = b[at + a.length];
    return !(before && wordish.test(before)) && !(after && wordish.test(after));
  };

  const DESKS: [string, () => React.ReactElement][] = [
    ['a take', () => <ComposeShortScreen kind="take" />],
    ['a seeking', () => <ComposeShortScreen kind="seeking" />],
    ['a wire', () => <ComposeShortScreen kind="wire" />],
    ['a ballot', () => <ComposeBallotScreen />],
  ];

  for (const [name, mount] of DESKS) {
    describe(name, () => {
      let tree: unknown = null;
      beforeEach(() => { tree = render(mount()).toJSON(); });

      it('has controls at all — or this proves nothing', () => {
        expect(controls(tree).length).toBeGreaterThan(0);
      });

      it('names every control', () => {
        const nameless = controls(tree)
          .filter((c) => !(c.label ?? '').trim() && !c.text.trim())
          .map((c) => c.role ?? '(no role)');
        expect(nameless).toEqual([]);
      });

      it('reads out no ornament, separator or rule', () => {
        const ornamental = spokenStrings(tree).filter((s) => !/[A-Za-z0-9\u0600-\u06FF]/.test(s));
        expect(ornamental).toEqual([]);
      });

      it('never says the same thing twice in a row', () => {
        const said = spokenStrings(tree);
        const echoed: string[] = [];
        for (let i = 0; i + 1 < said.length; i++) {
          const a = said[i]; const b = said[i + 1];
          if (a.length >= 2 && a !== b && echoes(a, b)) echoed.push(`"${a}" then "${b}"`);
        }
        expect(echoed).toEqual([]);
      });
    });
  }
});

/**
 * ── A DESK WITH NOBODY AT IT ────────────────────────────────────────────────
 * Both short desks ended `if (!me) return null` — a screen that renders NOTHING.
 * Rendered and read back, the whole tree was `[]`.
 *
 * And it was reachable, not theoretical: the brass Concierge is in the nav bar
 * for everyone, its "File to the Dispatch" row is not gated, and the picker
 * offered all five forms to a signed-out reader. Tap one and you got an empty
 * modal — no header, no back control, no sentence.
 *
 * A blank screen is the worst answer an app can give. It says nothing about
 * what happened, what to do, or that anything happened at all.
 */
describe('a signed-out reader who reaches a desk', () => {
  const noBody = (tree: unknown) => {
    const out: string[] = [];
    const walk = (n: any) => {
      if (n == null) return;
      if (typeof n === 'string') { if (n.trim()) out.push(n.trim()); return; }
      if (Array.isArray(n)) { n.forEach(walk); return; }
      walk(n.children);
    };
    walk(tree);
    return out;
  };

  beforeEach(() => { mockSignedOut = true; });
  afterEach(() => { mockSignedOut = false; });

  for (const [name, el] of [
    ['a take', <ComposeShortScreen kind="take" />],
    ['a seeking', <ComposeShortScreen kind="seeking" />],
    ['a wire', <ComposeShortScreen kind="wire" />],
    ['a ballot', <ComposeBallotScreen />],
  ] as const) {
    it(`${name} — is told why, and taken back`, async () => {
      const { toJSON } = render(el as React.ReactElement);
      await act(async () => { await Promise.resolve(); });

      // Still nothing drawn — but that is now ONE frame before the pop, with a
      // sentence already on screen, rather than a screen a member is left on.
      expect(noBody(toJSON())).toEqual([]);
      expect(String(mockToast.error.mock.calls[0]?.[0])).toBe('Filing is for members.');
    });
  }
});

/**
 * ── WHEN FILING DOES NOT SIMPLY SUCCEED ─────────────────────────────────────
 * Both other endings were dark: no test had ever run the `catch` that says a
 * filing was refused, or the branch that says it will go when the wire is back.
 *
 * The one that matters is what happens to the WRITING. A desk that clears the
 * field on a failure has taken somebody's sentence and given them an error in
 * exchange, which is the single worst outcome a page that accepts writing can
 * produce.
 */
describe('a filing that does not go', () => {
  afterEach(() => { mockFileFails = false; mockFileOffline = false; });

  const typeAndFile = async (r: ReturnType<typeof render>, kind: string) => {
    await act(async () => {
      fireEvent.changeText(r.getByLabelText(`Your ${kind}`), 'Ozu never once stood up.');
    });
    if (kind === 'wire') {
      await act(async () => {
        fireEvent.changeText(r.getByLabelText('Where this came from'), 'Sight & Sound');
      });
    }
    await act(async () => { fireEvent.press(r.getByLabelText('File it')); });
    await act(async () => { await Promise.resolve(); });
  };

  it('says so, and KEEPS what was written', async () => {
    mockFileFails = true;
    const r = render(<ComposeShortScreen kind="take" />);
    await typeAndFile(r, 'take');

    expect(String(mockToast.error.mock.calls[0]?.[0])).toBe('It could not be filed.');
    // The sentence survives. Without this the member types it again from memory.
    expect(r.getByLabelText('Your take').props.value).toBe('Ozu never once stood up.');
    // And they are still at the desk — no navigation on a failure.
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('lets them try again rather than locking the desk', async () => {
    // `finally { setSending(false) }` is what makes this true. Without it FILE
    // IT stays disabled after one failure and the desk is dead.
    mockFileFails = true;
    const r = render(<ComposeShortScreen kind="take" />);
    await typeAndFile(r, 'take');
    expect(r.getByLabelText('File it').props.accessibilityState.disabled).toBe(false);
  });

  it('promises the wire will carry it later, when there is no signal', async () => {
    mockFileOffline = true;
    const r = render(<ComposeShortScreen kind="take" />);
    await typeAndFile(r, 'take');
    expect(String(mockToast.success.mock.calls[0]?.[0]))
      .toBe('Filed. It goes out when the wire is back.');
  });

  it('says plainly when it went', async () => {
    const r = render(<ComposeShortScreen kind="take" />);
    await typeAndFile(r, 'take');
    expect(String(mockToast.success.mock.calls[0]?.[0])).toBe('Filed');
  });
});
