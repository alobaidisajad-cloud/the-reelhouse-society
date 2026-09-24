/**
 * An honour's title is whole at every text size.
 *
 * SOCIETY HONORS sets each title in a third of the case, two lines at most. At
 * the largest text size THE CONNOISSEUR's second word was ~9pt wider than the
 * tile, and the phone broke it mid-letter (measured: mockups/tools/layout.cjs,
 * RUN). The title now gives up just enough size to stay whole — only when it
 * has to, never at the default size.
 *
 * Every title is checked, because the case holds every honour a member can
 * earn, and the next one added may be longer.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Achievements } from '../Achievements';

/** Every two-line text the case draws — its titles. */
const titlesOf = () => {
  const out: any[] = [];
  const walk = (n: any) => {
    if (!n || typeof n === 'string') return;
    if (n.type === 'Text' && n.props.numberOfLines === 2) out.push(n);
    (n.children ?? []).forEach(walk);
  };
  walk(render(<Achievements logs={[]} />).toJSON());
  return out;
};
const nameOf = (t: any) => [t.children].flat(3).filter((c: unknown) => typeof c === 'string').join('');

describe('the honours case', () => {
  it('finds every title, so an empty sweep cannot pass', () => {
    const titles = titlesOf();
    expect(titles.length).toBeGreaterThanOrEqual(6);
    expect(titles.map(nameOf)).toContain('THE CONNOISSEUR');
  });

  it('lets every title shrink to stay whole, and no further than 0.8', () => {
    for (const t of titlesOf()) {
      const name = nameOf(t);
      expect({ name, fit: t.props.adjustsFontSizeToFit, floor: t.props.minimumFontScale })
        .toEqual({ name, fit: true, floor: 0.8 });
    }
  });
});
