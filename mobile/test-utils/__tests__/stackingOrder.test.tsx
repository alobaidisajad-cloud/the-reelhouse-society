/**
 * The stacking guard (stackingOrder.js, read on every render, failed after each test): it names a
 * view iOS draws on top and Android under, through every view Fabric flattens, and nothing a scroll
 * view or a window keeps inside itself.
 */
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
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

/** A tree drawn, read as JSON, and taken down again, its lines taken so this test is not failed by them. */
const drawn = (el: React.ReactElement) => {
  const r = render(el);
  const json = r.toJSON();
  r.unmount();
  taken();
  return json;
};

describe('the stacking guard', () => {
  it('names a view meant on top by its zIndex that Android draws under an elevated sibling', () => {
    const lines = misordered(drawn(<View><View testID="pill" style={PILL} /><View style={PAPER} /></View>));
    expect(lines).toHaveLength(1);
    expect(lines.find(() => true)).toMatch(/^iOS draws View#pill \(zIndex 1, elevation 0, absolute;.*over View \(zIndex 0, elevation 10;.*Android, under it$/);
  });

  it('reads through a view Fabric flattens away, as Android stacks the hoisted pair', () => {
    const tree = drawn(
      <View>
        <View style={{ paddingTop: 4 }}><View testID="pill" style={PILL} /></View>
        <View style={{ flex: 1 }}><View style={PAPER} /></View>
      </View>,
    );
    expect(misordered(tree)).toHaveLength(1);
  });

  it('passes the pill raised over the paper, and a paper that stands in its own window', () => {
    const raised = drawn(<View><View style={{ ...PILL, elevation: 12 }} /><View style={PAPER} /></View>);
    const scrolled = drawn(<View><View style={PILL} /><ScrollView><View style={PAPER} /></ScrollView></View>);
    const windowed = drawn(<View><View style={PILL} /><View collapsable={false}><View style={PAPER} /></View></View>);
    expect([misordered(raised), misordered(scrolled)]).toEqual([[], []]);
    // A window of its own is one view among the pill's siblings, at elevation 0: in order.
    expect(misordered(windowed)).toEqual([]);
  });

  it('is read from every render a test makes, and failed after it', () => {
    const r = render(<View><View testID="pill" style={PILL} /><View style={PAPER} /></View>);
    expect(taken()).toEqual([expect.stringMatching(/^iOS draws View#pill/)]);
    r.unmount();
    taken();
  });

  it('reads a tree as the test leaves it: what a press opened is judged in its own test', async () => {
    // Drawn in order at first; a press then opens a pill Android would stand under the paper.
    function Opens() {
      const [open, setOpen] = React.useState(false);
      return (
        <View>
          {open ? <View testID="pill" style={PILL} /> : null}
          <View style={PAPER} />
          <Pressable testID="open" onPress={() => setOpen(true)} />
        </View>
      );
    }
    const r = render(<Opens />);
    expect(taken()).toEqual([]);
    await fireEvent.press(r.getByTestId('open'));
    // The after-each check's own read, as it runs before RNTL's cleanup.
    for (const read of [...((globalThis as { __liveStacking?: Set<() => void> }).__liveStacking ?? [])]) read();
    expect(taken()).toEqual([expect.stringMatching(/^iOS draws View#pill/)]);
    r.unmount();
    taken();
  });
});
