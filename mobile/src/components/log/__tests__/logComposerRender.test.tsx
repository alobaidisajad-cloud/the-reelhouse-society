/**
 * logComposerRender.test.tsx — the composer, actually mounted.
 *
 * Everything else guarding this redesign reads SOURCE: it proves a prop is
 * spelled where it should be and a stylesheet says what it should say. None of
 * it proves the page renders, or that a Cinephile sees what a Cinephile should.
 *
 * Written after an audit found a bracket enclosing 24pt of empty air — a defect
 * no source-reading test could ever have caught.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import LogForm from '../LogForm';
import LogVerdict from '../LogVerdict';
import { useLogFlow } from '@/src/hooks/useLogFlow';
import { useAuthStore } from '@/src/stores/auth';
import { tmdb } from '@/src/lib/tmdb';

const mockOpenSociety = jest.fn();
jest.mock('@/src/utils/openSociety', () => ({
  openSociety: (...a: unknown[]) => mockOpenSociety(...a),
  societyHref: jest.requireActual('@/src/utils/openSociety').societyHref,
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  return new Proxy({}, { get: () => (props: any) => React.createElement('Icon', props) });
});
jest.mock('@/src/components/NitrateCalendar', () => () => null);
jest.mock('@/src/components/AutopsyGauge', () => () => null);
jest.mock('@/src/components/Decorative', () => ({
  ReelRating: () => null,
  SectionDivider: (props: any) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, props.label);
  },
}));

/** The composer, for a member of a given rank. */
function Harness({ tier }: { tier: 'cinephile' | 'archivist' | 'auteur' }) {
  const flow = useLogFlow();
  return (
    <LogForm
      flow={{ ...flow, isPremium: tier !== 'cinephile', isAuteur: tier === 'auteur' }}
      user={{ username: 'sajjadobaidi' } as never}
    />
  );
}

/**
 * The rank lives on the MEMBER, so it is set there.
 *
 * This harness used to decide rank only by overriding the flow's `isPremium` /
 * `isAuteur` while the auth store held a member of no rank at all — a pairing
 * the app can never produce, because the flow derives those flags from that
 * same member. It went unnoticed while the log's ropes read the flow. They now
 * read the member through `useClearance`, like every other rope in the app, so
 * a harness that disagreed with itself showed every Archivist a rope.
 */
const mount = (
  tier: 'cinephile' | 'archivist' | 'auteur' = 'cinephile',
  extra: Record<string, unknown> = {},
) => {
  useAuthStore.setState({
    user: {
      id: '33333333-3333-4333-8333-333333333333',
      username: 'sajjadobaidi',
      tier: tier === 'cinephile' ? 'free' : tier,
      role: 'cinephile',
      ...extra,
    } as never,
  });
  return render(<Harness tier={tier} />);
};

beforeEach(() => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({
    filmId: '603', filmTitle: 'The Matrix', filmPoster: '/poster.jpg', filmYear: '1999',
  });
});

describe('the record, as a member sees it', () => {
  it('opens as one document with its three movements', () => {
    const r = mount();
    expect(r.getByText('THE VERDICT')).toBeTruthy();
    expect(r.getByText('THE MANUSCRIPT')).toBeTruthy();
    expect(r.getByText('THE FILING')).toBeTruthy();
  });

  it('names the film once, on the docket', () => {
    const r = mount();
    expect(r.getAllByText('The Matrix')).toHaveLength(1);
  });

  it('invites a verdict before one is given', () => {
    expect(mount().getByText('awaiting your verdict')).toBeTruthy();
  });

  it('the manuscript is from the member’s own desk', () => {
    // And says it ONCE — it used to repeat the section it sat in.
    const r = mount();
    expect(r.getByText('FROM THE DESK OF @SAJJADOBAIDI')).toBeTruthy();
    expect(r.queryByText(/THE MANUSCRIPT —/)).toBeNull();
  });
});

describe('the index, per rank', () => {
  it('a Cinephile sees every tool, and is refused by none', () => {
    const r = mount('cinephile');
    for (const name of ['THE AUTOPSY', 'THE PHYSICAL ARCHIVE', 'THE VAULT', 'FILED']) {
      expect(r.getByText(name)).toBeTruthy();
    }
    // COUNTED. Three tools come from the Archivist — the Editorial Desk, the
    // Physical Archive and the Vault — and each must name the rank rather than
    // refuse. Asserting merely "at least one" let a mutation strip a lock off
    // one entry and still pass.
    expect(r.getAllByText('THE ARCHIVIST')).toHaveLength(3);
    expect(r.getAllByText('THE AUTEUR')).toHaveLength(1);
    expect(r.queryByText('UNLOCK WITH ARCHIVIST')).toBeNull();
    expect(r.queryByText('UPGRADE')).toBeNull();
  });

  it('an Archivist is not told about the Archivist', () => {
    const r = mount('archivist');
    expect(r.queryByText('THE ARCHIVIST')).toBeNull();
    expect(r.getByText('THE AUTEUR')).toBeTruthy();
  });

  it('an Auteur is told about neither', () => {
    const r = mount('auteur');
    expect(r.queryByText('THE ARCHIVIST')).toBeNull();
    expect(r.queryByText('THE AUTEUR')).toBeNull();
  });
});

describe('a locked tool shows the instrument, then the gate', () => {
  it('opening the Physical Archive shows the real chips and one clearance line', async () => {
    const r = mount('cinephile');
    // Closed: no gate anywhere on the page.
    expect(r.queryByText('[ CLEARANCE REQUIRED ]')).toBeNull();

    await fireEvent.press(r.getByText('THE PHYSICAL ARCHIVE'));

    await waitFor(() => expect(r.getByText('[ CLEARANCE REQUIRED ]')).toBeTruthy());
    // The instrument itself — the same options an Archivist uses — DRAWN on the
    // page for anyone looking...
    expect(r.getByText('Blu-Ray', { includeHiddenElements: true })).toBeTruthy();
    expect(r.getByText('4K UHD', { includeHiddenElements: true })).toBeTruthy();
    // ...and silent to anyone listening. These chips cannot be pressed, so a
    // screen reader landing on them would announce buttons that do nothing.
    // The default query sees what assistive technology sees.
    expect(r.queryByText('Blu-Ray')).toBeNull();
    // What the listener hears instead is the rope, and it names the tool first.
    expect(r.getByLabelText(/^The Physical Archive\. Clearance required\./)).toBeTruthy();
    // Said once, inside the panel that was opened.
    expect(r.getAllByText('[ CLEARANCE REQUIRED ]')).toHaveLength(1);
    expect(r.getByText('✦ ASCEND THE RANKS')).toBeTruthy();
  });

  it('every locked panel carries its own gate, not just the first', async () => {
    // The Editorial Desk, the Physical Archive and the Vault each hold one. A
    // mutation that stripped the gate from ONE of them slipped past a test that
    // only ever opened another.
    const r = mount('cinephile');
    await fireEvent.press(r.getByText('THE VAULT'));
    await waitFor(() => expect(r.getByText('[ CLEARANCE REQUIRED ]')).toBeTruthy());

    await fireEvent.press(r.getByText('THE EDITORIAL DESK'));
    await waitFor(() => expect(r.getAllByText('[ CLEARANCE REQUIRED ]')).toHaveLength(2));

    await fireEvent.press(r.getByText('THE PHYSICAL ARCHIVE'));
    await waitFor(() => expect(r.getAllByText('[ CLEARANCE REQUIRED ]')).toHaveLength(3));
  });

  it('an Archivist opening the same entry meets no gate at all', async () => {
    const r = mount('archivist');
    await fireEvent.press(r.getByText('THE PHYSICAL ARCHIVE'));
    await waitFor(() => expect(r.getByText('Blu-Ray')).toBeTruthy());
    expect(r.queryByText('[ CLEARANCE REQUIRED ]')).toBeNull();
  });
});

describe('the log’s ropes are the house’s ropes', () => {
  /**
   * These four ropes pushed a bare '/membership' and were the only ones in the
   * app outside useClearance: no reason on the Society page, no way back, no
   * tap in the funnel, and a lapsed member pitched as a stranger. Mounted, and
   * pressed.
   */
  it('a rope tells the Society what was reached for, and where to return', async () => {
    const r = mount('cinephile');
    await fireEvent.press(r.getByText('THE VAULT'));
    await fireEvent.press(await waitFor(() => r.getByLabelText(/^The Vault\. Clearance required\./)));
    // A new log keeps its draft, so the form is the way back.
    expect(mockOpenSociety).toHaveBeenCalledWith('/membership?reason=the-vault&rank=archivist&returnTo=%2Flog-modal');
  });

  it('each tool ropes its OWN feature, not a generic one', async () => {
    const r = mount('cinephile');
    await fireEvent.press(r.getByText('THE AUTOPSY'));
    await fireEvent.press(await waitFor(() => r.getByLabelText(/^The Autopsy\. Clearance required\. The Auteur/)));
    expect(mockOpenSociety).toHaveBeenLastCalledWith(expect.stringContaining('reason=breakdown-engine&rank=auteur'));
  });

  it('a member whose dues lapsed hears that, in the room they filed longest', async () => {
    const r = mount('cinephile', { entitlement_source: 'revenuecat' });
    await fireEvent.press(r.getByText('THE PHYSICAL ARCHIVE'));
    await waitFor(() => expect(r.getByText('[ YOUR DUES HAVE LAPSED ]')).toBeTruthy());
    expect(r.getByText('✦ RESUME YOUR STANDING')).toBeTruthy();
    expect(r.queryByText('[ CLEARANCE REQUIRED ]')).toBeNull();
  });

  describe('Curatorial Control is no longer a vanish', () => {
    const POSTER = 'Curatorial Control. Choose an alternate poster. Opens with The Auteur.';

    it('the poster answers a Cinephile — it opens, and one rope names the tool', async () => {
      const r = mount('cinephile');
      // It used to be `disabled` with no label at all: a tap that did nothing.
      await fireEvent.press(r.getByLabelText(POSTER));
      await waitFor(() => expect(r.getByText('CURATORIAL CONTROL')).toBeTruthy());
      expect(r.getByLabelText(/^Curatorial Control\. Clearance required\. The Auteur/)).toBeTruthy();
    });

    it('its pictures are fetched when a Cinephile opens it — not on every log', async () => {
      const images = tmdb.movieImages as jest.Mock;
      images.mockClear();
      const r = mount('cinephile');
      // Nothing requested merely because the form opened.
      expect(images).not.toHaveBeenCalled();
      await fireEvent.press(r.getByLabelText(POSTER));
      await waitFor(() => expect(images).toHaveBeenCalledTimes(1));
    });

    it('never says "none found" while TMDB has not answered', async () => {
      (tmdb.movieImages as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
      const r = mount('cinephile');
      await fireEvent.press(r.getByLabelText(POSTER));
      await waitFor(() => expect(r.getByText('CURATORIAL CONTROL')).toBeTruthy());
      expect(r.queryByText('No alternative posters found on TMDB.', { includeHiddenElements: true })).toBeNull();
    });

    it('nor after the request FAILED — a failure is not "none found"', async () => {
      (tmdb.movieImages as jest.Mock).mockRejectedValueOnce(new Error('offline'));
      const r = mount('cinephile');
      await fireEvent.press(r.getByLabelText(POSTER));
      await waitFor(() => expect(r.getByText('CURATORIAL CONTROL')).toBeTruthy());
      // Let the rejection settle before asking.
      await waitFor(() => expect(tmdb.movieImages).toHaveBeenCalled());
      await new Promise((res) => setTimeout(res, 20));
      expect(r.queryByText('No alternative posters found on TMDB.', { includeHiddenElements: true })).toBeNull();
    });

    it('and says it once TMDB has actually answered with nothing', async () => {
      (tmdb.movieImages as jest.Mock).mockResolvedValueOnce({ posters: [], backdrops: [] });
      const r = mount('cinephile');
      await fireEvent.press(r.getByLabelText(POSTER));
      await waitFor(() =>
        expect(r.getByText('No alternative posters found on TMDB.', { includeHiddenElements: true })).toBeTruthy());
    });

    it('an Auteur meets the picker with no rope', async () => {
      const r = mount('auteur');
      await fireEvent.press(r.getByLabelText('Choose an alternate poster'));
      await waitFor(() => expect(r.getByText('CURATORIAL CONTROL')).toBeTruthy());
      expect(r.queryByText('[ CLEARANCE REQUIRED ]')).toBeNull();
    });
  });
});

describe('the verdict, in every state', () => {
  it('names the judgment once a rating exists', () => {
    const r = render(<LogVerdict status="watched" rating={4.5} />);
    expect(r.getByText('Masterpiece')).toBeTruthy();
    expect(r.getByText('4.5 / 5')).toBeTruthy();
    expect(r.queryByText('awaiting your verdict')).toBeNull();
  });

  it('shows the hint only while unrated', () => {
    expect(render(<LogVerdict status="watched" rating={0} />).getByText('TAP LEFT HALF FOR ½ REELS')).toBeTruthy();
    expect(render(<LogVerdict status="watched" rating={3} />).queryByText('TAP LEFT HALF FOR ½ REELS')).toBeNull();
  });

  it('walking out is a verdict too', () => {
    const r = render(<LogVerdict status="abandoned" rating={0} />);
    expect(r.getByText('Abandoned')).toBeTruthy();
    // Never the reason — "Life Got in the Way" would overflow at this size.
    expect(r.queryByText(/Life Got in the Way/)).toBeNull();
  });

  it('a whole rating is not written as a decimal', () => {
    expect(render(<LogVerdict status="watched" rating={4} />).getByText('4 / 5')).toBeTruthy();
  });
});
