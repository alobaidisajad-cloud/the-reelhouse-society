/**
 * The stacking guard (stackingOrder.js, read on every render, failed after each test): it names a
 * view iOS draws on top and Android under, through every view Fabric flattens, and nothing a scroll
 * view or a window keeps inside itself.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { render } from '@testing-library/react-native';
import { misordered } from '../stackingOrder';

const G = globalThis as { __misordered?: Set<string> };
/** What a render left for the after-each check, taken so this test is not failed by it. */
const taken = () => {
  const lines = [...(G.__misordered ?? [])];
  G.__misordered?.clear();
  return lines;
};

const PILL = { position: 'absolute', top: 5, left: 0, right: 0, zIndex: 1 } as const;
const PAPER = { backgroundColor: '#1a1612', elevation: 10, height: 400 } as const;

describe('the stacking guard', () => {
  it('names a view meant on top by its zIndex that Android draws under an elevated sibling', () => {
    const lines = misordered(render(<View><View testID="pill" style={PILL} /><View style={PAPER} /></View>).toJSON());
    taken();
    expect(lines).toHaveLength(1);
    expect(lines.find(() => true)).toMatch(/^iOS draws View#pill \(zIndex 1, elevation 0, absolute;.*over View \(zIndex 0, elevation 10;.*Android, under it$/);
  });

  it('reads through a view Fabric flattens away, as Android stacks the hoisted pair', () => {
    const tree = render(
      <View>
        <View style={{ paddingTop: 4 }}><View testID="pill" style={PILL} /></View>
        <View style={{ flex: 1 }}><View style={PAPER} /></View>
      </View>,
    ).toJSON();
    taken();
    expect(misordered(tree)).toHaveLength(1);
  });

  it('passes the pill raised over the paper, and a paper that stands in its own window', () => {
    const raised = render(<View><View style={{ ...PILL, elevation: 12 }} /><View style={PAPER} /></View>).toJSON();
    const scrolled = render(<View><View style={PILL} /><ScrollView><View style={PAPER} /></ScrollView></View>).toJSON();
    const windowed = render(<View><View style={PILL} /><View collapsable={false}><View style={PAPER} /></View></View>).toJSON();
    taken();
    expect([misordered(raised), misordered(scrolled)]).toEqual([[], []]);
    // A window of its own is one view among the pill's siblings, at elevation 0: in order.
    expect(misordered(windowed)).toEqual([]);
  });

  it('is read from every render a test makes, and failed after it', () => {
    render(<View><View testID="pill" style={PILL} /><View style={PAPER} /></View>);
    expect(taken()).toEqual([expect.stringMatching(/^iOS draws View#pill/)]);
  });
});
