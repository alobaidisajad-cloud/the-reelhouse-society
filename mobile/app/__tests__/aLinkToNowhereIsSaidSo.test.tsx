/**
 * A route opened by a link whose id is of another shape is a page not in the archive (P4.4).
 *
 * `/log/abc` asked the house for a log by the id "abc", which it cannot hold, and the page said
 * the house could not be read. Each route that takes an id now reads it through routeParams, and
 * one of another shape draws NotInTheArchive before the page asks for anything.
 * (The film, the artist and a member's room say it in their own pages; their own tests hold them.)
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import DispatchReader from '../dispatch/[id]';
import DossierRedirect from '../dossier/[id]';
import LogPage from '../log/[id]';
import SalonPage from '../lounge/[id]';
import StackPage from '../stacks/[id]';
import SeriesPage from '../dispatch/series/[id]';
import FilmReviews from '../film-reviews/[id]';
import CoverPicker from '../(modals)/cover-picker';

const ROUTES: [string, React.ComponentType, Record<string, string>][] = [
  ['a filing', DispatchReader, { id: 'abc' }],
  ['an old dossier', DossierRedirect, { id: 'abc' }],
  ['a log', LogPage, { id: '603' }],
  ['a salon', SalonPage, { id: "abc' OR 1=1" }],
  ['a stack', StackPage, { id: '../stacks' }],
  ['a series', SeriesPage, { id: 'abc', from: 'abc' }],
  ['a film’s reviews', FilmReviews, { id: 'abc', title: 'The Matrix' }],
  ['a salon’s cover', CoverPicker, { loungeId: 'abc' }],
];

describe.each(ROUTES)('%s opened by a link of another shape', (_what, Route, params) => {
  it('is a page not in the archive', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue(params);
    const r = render(<Route />);
    expect(r.getByText('ROUTE NOT IN THE ARCHIVE')).toBeTruthy();
    expect(r.getByLabelText('Return to lobby')).toBeTruthy();
  });

  it('and with no id at all, the same', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    expect(render(<Route />).getByText('ROUTE NOT IN THE ARCHIVE')).toBeTruthy();
  });
});
