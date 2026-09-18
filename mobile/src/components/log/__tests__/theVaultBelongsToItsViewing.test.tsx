/**
 * THE VAULT — the rules a private note lives by, on the phone.
 *
 * Every one of these was broken at some point, and none of the breaks were
 * visible on screen:
 *   · the apps read `logs.private_notes`, which the database keeps BLANK on
 *     purpose, so a member's Vault came back empty and an ordinary save then
 *     offered to write that emptiness back;
 *   · a rewatch carried the previous viewing's note into the new one, and into
 *     `viewing_history`, which every member and every visitor can read;
 *   · the note field filled in after the form opened, so a save made in the
 *     meantime erased writing the member never touched.
 *
 * These are source-level and render-level, deliberately: a rule that only holds
 * "if you call the right function" is not a rule.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render } from '@testing-library/react-native';

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// Every file that talks to the logs table or builds what is sent to it.
const CLIENT_FILES = [
  'src/utils/mappers.ts',
  'src/services/LogService.ts',
  'src/services/VaultService.ts',
  'src/stores/domain/logSlice/helpers/logOperations.ts',
  'src/stores/vaultStore.ts',
  'src/hooks/useLogFlow.ts',
  'src/hooks/useVault.ts',
  'app/log/[id].tsx',
  'src/components/log/LogForm.tsx',
  'src/components/log/LogReviewBody.tsx',
  'src/components/log/LogChronicle.tsx',
  'src/components/log/VaultNote.tsx',
  'src/components/log/NoteSheet.tsx',
];

describe('a note is never read from, or written to, the log row', () => {
  it('no client file selects private_notes', () => {
    // The column is blank by design. Selecting it is how both apps came to show
    // an empty Vault to the member who had written in it.
    const offenders = CLIENT_FILES.filter((f) => /['"`][^'"`]*\bprivate_notes\b/.test(stripComments(read(f))));
    expect(offenders).toEqual([]);
  });

  it('neither column list asks for it', () => {
    const src = read('src/utils/mappers.ts');
    const lists = [...src.matchAll(/export const (\w*LOG_\w*COLUMNS) = '([^']+)'/g)];
    // Both lists exist, and neither carries the note.
    expect(lists.length).toBe(2);
    for (const [, name, cols] of lists) {
      expect(`${name}: ${cols}`).not.toMatch(/\bprivate_notes\b/);
      // …and both carry the viewing, which is what a note belongs to.
      expect(`${name}: ${cols}`).toMatch(/\bviewing_id\b/);
    }
  });

  it('the field map cannot write it back', () => {
    // mapLogToDbPayload is the only thing that turns domain fields into columns.
    // While `privateNotes -> private_notes` sat in it, every save carried a note
    // to the blank column, whatever the form did.
    const { mapLogToDbPayload } = require('@/src/utils/mappers');
    const db = mapLogToDbPayload({ privateNotes: 'mine', rating: 4 } as any);
    expect('private_notes' in db).toBe(false);
    expect(db.rating).toBe(4);
  });

  it('the only door to a note is VaultService', () => {
    // Everything else goes through the store, which goes through the service.
    // A second door is how a rule ends up enforced in one place and not another.
    const others = CLIENT_FILES.filter((f) => f !== 'src/services/VaultService.ts')
      .filter((f) => /from\s*\(?\s*['"]log_private_notes['"]|rpc\(\s*['"]viewing_note_/.test(stripComments(read(f))));
    expect(others).toEqual([]);
  });
});

describe('a viewing is added and removed by the server, never by rewriting history', () => {
  const ops = stripComments(read('src/stores/domain/logSlice/helpers/logOperations.ts'));

  it('both acts name the viewing they are about', () => {
    // Naming it is what makes a retry harmless: the same call twice is the same
    // viewing, and the second one does nothing.
    expect(ops).toMatch(/viewingOp:\s*\{\s*kind:\s*'add',\s*viewingId/);
    expect(ops).toMatch(/viewingOp:\s*\{\s*kind:\s*'remove',\s*viewingId/);
  });

  it('the identity is chosen before the write, not after it', () => {
    expect(ops).toMatch(/const newViewingId = Crypto\.randomUUID\(\)/);
  });

  it('they go through the two operations, not through an update of the history', () => {
    expect(ops).toMatch(/VaultService\.addViewing\(/);
    expect(ops).toMatch(/VaultService\.removeViewing\(/);
  });

  it('a note is never put into a viewing that goes into the history', () => {
    // The history is world-readable. This is the leak that was dormant only
    // because the apps no longer knew the note.
    const archived = ops.slice(ops.indexOf('const archivedEntry'), ops.indexOf('const newHistory'));
    expect(archived).not.toMatch(/privateNotes/);
  });

  it('the offline queue replays each act by name, so a flush cannot rewatch twice', () => {
    const queue = read('src/utils/offlineQueue.ts');
    for (const t of ['add_viewing', 'remove_viewing', 'set_viewing_note', 'remove_viewing_note']) {
      expect(queue).toMatch(new RegExp(`'${t}'`));
      // …and each has a handler, or it would throw on flush.
      expect(stripComments(read('src/utils/mutationExecutor.ts'))).toMatch(new RegExp(`${t}:\\s*async`));
      // …and a schema, or it would flush unvalidated.
      expect(stripComments(read('src/types/mutations.ts'))).toMatch(new RegExp(`${t}:\\s*z\\.object`));
    }
  });
});

describe('the note field waits for the Vault', () => {
  const form = stripComments(read('src/components/log/LogForm.tsx'));
  const flow = stripComments(read('src/hooks/useLogFlow.ts'));

  it('the form shows a closed field until the note is in hand', () => {
    expect(form).toMatch(/!noteReady/);
    expect(form).toMatch(/Opening the Vault…/);
    expect(form).toMatch(/Opens when you\\?'re back online\./);
  });

  it('an untouched note is not sent at all', () => {
    // The protection itself. While the field is shut, or unreachable, nothing
    // is touched — so nothing is written, whatever the box happens to show.
    expect(flow).toMatch(/noteTouched \? \{ privateNotes/);
  });

  it('every change to the note counts as touching it', () => {
    expect(flow).toMatch(/setNoteTouched\(true\)/);
  });

  it('a rewatch says that the note belongs to this viewing', () => {
    expect(form).toMatch(/This note belongs to this viewing\./);
  });
});

describe('who may be offered EDIT on the log page', () => {
  const page = stripComments(read('app/log/[id].tsx'));

  it('it is the READER’s clearance, through useClearance', () => {
    // It first used `isArchivist` — built from `profile.role`, the log AUTHOR's
    // role column. Rank lives in `tier`, so a paying Archivist whose role still
    // read 'cinephile' was never offered EDIT on their own note.
    // Filed under `vault-editing`: offering EDIT guards CHANGING a note.
    expect(page).toMatch(/const vaultClearance = useClearance\('vault-editing'\)/);
    const opens = page.match(/vault\.openNote\([^)]*\)/g) ?? [];
    expect(opens.length).toBe(2);
    for (const o of opens) {
      expect(o).toMatch(/vaultClearance\.held/);
      expect(o).not.toMatch(/isArchivist/);
    }
  });
});

describe('what the member sees', () => {
  const VaultNote = require('@/src/components/log/VaultNote').default;

  it('a note says whose it is', () => {
    const r = render(<VaultNote note="I cried at the top" />);
    expect(r.getByText('THE VAULT')).toBeTruthy();
    expect(r.getByText('  ·  ONLY YOU')).toBeTruthy();
    expect(r.getByText('I cried at the top')).toBeTruthy();
  });

  it('an empty note draws nothing at all — no empty frame, no chrome', () => {
    expect(render(<VaultNote note="" />).toJSON()).toBeNull();
    expect(render(<VaultNote note="   " />).toJSON()).toBeNull();
  });

  it('a note on a chronicle card is clamped to three lines', () => {
    // One long note must not swell a card that every other viewing has to match.
    const r = render(<VaultNote note={'x '.repeat(400)} compact />);
    const body = r.getByText(/^x x/);
    expect(body.props.numberOfLines).toBe(3);
  });

  it('the page note is not clamped — it is read in full', () => {
    const r = render(<VaultNote note="a short note" />);
    expect(r.getByText('a short note').props.numberOfLines).toBeUndefined();
  });

  it('a note that can be opened says so to a screen reader, and says it is private', () => {
    const r = render(<VaultNote note="I cried at the top" onOpen={() => {}} />);
    const btn = r.getByRole('button');
    expect(btn.props.accessibilityLabel).toMatch(/^Your private note\./);
    expect(btn.props.accessibilityLabel).toContain('I cried at the top');
  });

  it('a note nobody can open is not announced as a control', () => {
    expect(render(<VaultNote note="mine" />).queryByRole('button')).toBeNull();
  });
});
