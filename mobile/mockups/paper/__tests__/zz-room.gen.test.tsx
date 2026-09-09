/**
 * zz-room.gen.test.tsx — the REAL writing room, rendered.
 *
 * A GENERATOR, not a test. Run: npx jest zz-room.gen
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Stages two, three and four changed `app/dispatch/compose.tsx` — the preview
 * became the reader, the six tools got their names, and a dossier gained a film
 * and a series. All of it was typechecked and unit-tested, and NONE of it was
 * ever drawn.
 *
 * That is the gap this whole exercise keeps punishing: a passing test says the
 * code does what the test asks, and says nothing about whether a member can
 * read the screen. Every other Dispatch surface is on a plate and measured at
 * both text sizes. This one was not, so it is now.
 *
 * It mounts the SCREEN, not a drawing of it — the same component the router
 * gives a member — so anything that would crowd, clip or overflow on a device
 * has to do it here first.
 */
import React from 'react';
import { render, act } from '@testing-library/react-native';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { toHtml } from '../../../src/components/profile/__tests__/zz-render.lib';

/** The room is reached with `?kind=dossier`, and only by an Auteur. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => ({ kind: 'dossier' }),
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: () => {},
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn(),
}));
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const state = {
        user: { id: 'u1', username: 'ana', member_no: 17, tier: 'auteur', role: 'auteur' },
        isAuthenticated: true,
      };
      return sel ? sel(state) : state;
    },
    { getState: () => ({ user: { id: 'u1', tier: 'auteur' } }) },
  ),
}));
/** A draft the member has already begun, so the room is drawn at WORK. */
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: { getString: () => undefined, set: jest.fn(), delete: jest.fn() },
}));

import ComposeScreen from '@/app/dispatch/compose';

const OUT = process.env.PAPER_OUT ?? join(__dirname, '..', 'out');

describe('the writing room', () => {
  it('renders the real screen to html', async () => {
    mkdirSync(OUT, { recursive: true });

    const r = render(<ComposeScreen />);
    // Let the mount's effects settle — the draft read, the limit memo, the
    // keyboard listener — so the plate is the room as a member first sees it.
    await act(async () => { await Promise.resolve(); });

    writeFileSync(join(OUT, 'w1-the-writing-room.html'), toHtml(r.toJSON()), 'utf8');

    // The plate is worthless if the screen rendered nothing, which is exactly
    // how a signed-out composer once produced an empty tree.
    const html = toHtml(r.toJSON());
    expect(html.length).toBeGreaterThan(2000);
    for (const word of ['BOLD', 'ITALIC', 'HEADING', 'QUOTE', 'BREAK', 'LINK', 'FILM', 'SERIES']) {
      expect(`${word}: ${html.includes(word)}`).toMatch(/true$/);
    }
  });
});
