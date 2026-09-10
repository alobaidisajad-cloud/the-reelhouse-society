/**
 * zz-drafts.gen.test.tsx — the three things a draft made visible, drawn.
 *
 * A GENERATOR, not a test. Run: npx jest zz-drafts.gen
 *
 * Nothing here is a save indicator and nothing here is chrome the room keeps.
 * Each of the three answers a question a member cannot answer for themselves:
 *
 *   THE RESTORE LINE  why there are words on screen that I did not just type
 *   IN PROGRESS       whether beginning a second essay costs me the first
 *   THE DOOR'S LINE   whether the essay I cannot file yet still exists
 *
 * Drawn at their WIDEST — the longest weekday, an unreadable draft in crimson,
 * and the picker with every row carrying a notice — because the restore line is
 * a row that cannot reflow and the picker's is a trailing mark competing with a
 * chevron.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { View, Text } from 'react-native';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { toHtml } from '../../../src/components/profile/__tests__/zz-render.lib';

import { PaperPicker, PaperDoor, FORMS } from '@/src/components/dispatch/paper/PaperMore';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { colors, fonts } from '@/src/theme/theme';
import { DOC_MARGIN, DOC_PAD, DOC_RAIL } from '@/src/components/dispatch/paper/paperMetrics';
import { scaledTextProps } from '@/src/constants/textScaling';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn(),
}));

const OUT = process.env.PAPER_OUT ?? join(__dirname, '..', 'out');

/**
 * The restore line, drawn exactly as the writing room draws it — the same
 * styles, in the same gutter. Copied here rather than mounting the whole
 * composer because the room needs a keyboard, a draft and a signed-in Auteur to
 * reach that line, and none of the three changes its geometry.
 */
const line = (text: string, lost: boolean, act: boolean) => (
  <View style={{
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, marginBottom: 14, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.16)',
  }}>
    <Text
      style={{
        flexShrink: 1, fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6,
        color: lost ? colors.crimsonInk : colors.sepia, includeFontPadding: false,
      }}
      {...scaledTextProps}
    >
      {text}
    </Text>
    {act ? (
      <Text style={{
        fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6,
        color: colors.parchment, includeFontPadding: false,
      }} {...scaledTextProps}>START CLEAN</Text>
    ) : null}
  </View>
);

describe('what a draft makes visible', () => {
  it('renders the three of them to html', () => {
    mkdirSync(OUT, { recursive: true });

    // WEDNESDAY is the longest weekday, so this is the line at its widest.
    const room = render(
      <View style={p.screen}>
        <View style={{ paddingHorizontal: DOC_MARGIN + DOC_RAIL + DOC_PAD, paddingTop: 24 }}>
          {line('TAKEN UP WHERE YOU LEFT IT · WEDNESDAY · 21:40', false, true)}
          {line('WHAT WAS HERE COULD NOT BE READ', true, false)}
        </View>
      </View>,
    );
    writeFileSync(join(OUT, 'y1-the-restore-line.html'), toHtml(room.toJSON()), 'utf8');

    const picker = render(
      <View style={[p.screen, { justifyContent: 'flex-end' }]}>
        <PaperPicker
          forms={FORMS.map((f) => ({ ...f, locked: false, inProgress: true }))}
          onRules={() => {}}
        />
      </View>,
    );
    writeFileSync(join(OUT, 'y2-picker-in-progress.html'), toHtml(picker.toJSON()), 'utf8');

    /**
     * The two-sided question, at its widest: the longest weekday on both lines
     * and a five-figure word count, which is past what the essay ceiling allows
     * and therefore past anything a member can produce.
     */
    const elsewhere = render(
      <View style={p.screen}>
        <View style={{ paddingHorizontal: DOC_MARGIN + DOC_RAIL + DOC_PAD, paddingTop: 24 }}>
          <View style={{
            borderWidth: 1, borderColor: 'rgba(184,137,26,0.30)', borderRadius: 2,
            paddingHorizontal: 12, paddingVertical: 10,
          }}>
            <Text style={{
              fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6,
              color: colors.parchment, marginBottom: 8, includeFontPadding: false,
            }} {...scaledTextProps}>A NEWER ONE WAS WRITTEN ELSEWHERE</Text>
            {['ELSEWHERE · WEDNESDAY · 21:40 · 12,480 WORDS',
              'HERE · WEDNESDAY · 09:12 · 11,204 WORDS'].map((t) => (
                <Text key={t} style={{
                  fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.4,
                  color: colors.sepia, marginTop: 2, includeFontPadding: false,
                }} {...scaledTextProps}>{t}</Text>
              ))}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
              {['TAKE THAT ONE', 'KEEP THIS ONE'].map((t) => (
                <Text key={t} style={{
                  fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6,
                  color: colors.parchment, includeFontPadding: false,
                }} {...scaledTextProps}>{t}</Text>
              ))}
            </View>
          </View>
        </View>
      </View>,
    );
    writeFileSync(join(OUT, 'y4-a-newer-one-elsewhere.html'), toHtml(elsewhere.toJSON()), 'utf8');

    const door = render(
      <View style={p.screen}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <PaperDoor films={3} filmsNeeded={5} days={1} daysNeeded={2} held />
        </View>
      </View>,
    );
    writeFileSync(join(OUT, 'y3-door-holding-work.html'), toHtml(door.toJSON()), 'utf8');

    for (const [name, html] of [
      ['restore', toHtml(room.toJSON())],
      ['picker', toHtml(picker.toJSON())],
      ['door', toHtml(door.toJSON())],
    ] as const) {
      expect(`${name} drew something: ${html.length > 800}`).toMatch(/true$/);
    }
    expect(toHtml(picker.toJSON())).toContain('IN PROGRESS');
    expect(toHtml(door.toJSON())).toContain('WHAT YOU HAVE WRITTEN IS KEPT');
  });
});
