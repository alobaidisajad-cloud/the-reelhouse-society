/**
 * aDeskControlNeverAnswersWithNothing.test.tsx — on the desks, a button either
 * acts or says it cannot.
 *
 * Every desk is drawn in the harness with no handlers, and the ballot desk ships
 * with some of its controls' handlers absent until wired: its rail's CLOSES was a
 * live-looking button that did nothing on the screen members use. So every desk
 * is rendered BARE here, and every button in it must be disabled and say so.
 * The same desks with their handlers are driven in ballotDesk.test.tsx.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import {
  BallotDesk, DossierDesk, FilmFinder, ShareSheet, WireDesk, DeskRail,
} from '@/src/components/dispatch/paper/PaperDesk';

const ME = { name: 'ana', memberNo: 7 } as never;
const FILM = { title: 'Late Spring', year: '1949', posterPath: null } as never;
const noop = () => {};

const BARE: [string, React.ReactElement][] = [
  ['the ballot desk', <BallotDesk key="b" me={ME} hour="18:02" question="What tonight?" closes="2 DAYS"
    options={[FILM, null, null, null, null, null]} onBack={noop} onFile={noop} />],
  ['the wire desk', <WireDesk key="w" me={ME} hour="18:02" headline="Headline" body="Body" onBack={noop} onFile={noop} />],
  ['the dossier desk', <DossierDesk key="d" title="Title" body="Body" words={2} onBack={noop} onFile={noop} />],
  ['the film finder', <FilmFinder key="f" query="late" results={[FILM, FILM]} />],
  ['the share sheet', <ShareSheet key="s" preview={null} card />],
  ['a rail', <DeskRail key="r" tools={[{ icon: 'film', label: 'FILM' }, { icon: 'date', label: 'CLOSES' }]} />],
];

/** The two controls given handlers above (BACK and FILE IT are required by DeskHead). */
const WIRED = new Set(['Back, without filing', 'File it']);

describe('a desk drawn without its handlers', () => {
  it.each(BARE)('%s: every button that cannot act is disabled, and says so', (_name, element) => {
    const r = render(element);
    const buttons = r.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);   // a sweep that finds nothing proves nothing

    const live = buttons
      .filter((b) => !b.props.accessibilityState?.disabled)
      .map((b) => String(b.props.accessibilityLabel));
    expect(live.filter((label) => !WIRED.has(label))).toEqual([]);
  });
});
