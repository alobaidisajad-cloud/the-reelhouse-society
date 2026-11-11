/**
 * aPushIsTheHousesOwn.guard.test.ts — notify-push sends a notice the house wrote, once, in its own
 * words (20261111_01, DB-extension-reach).
 *
 * The trigger's request to notify-push waits in pg_net's queue with the shared secret in a header,
 * where any role that can log in may read it: Supabase cannot narrow pg_net's grants for one project
 * (SU-546605). A secret read there let its reader send any member any words. So the function takes a
 * notice's id alone from its caller, reads the notice from the house, and claims it once while fresh,
 * letting it go if Expo refused the send. Read from the function's source (its behaviour is proven
 * against the deployed shape by the functions world, e2e/functions/suites.mjs, in CI): what is
 * pinned is that nothing the caller sends but the id is used.
 */
import * as path from 'path';
import { readCode } from '@/test-utils/readCode';

const SOURCE = readCode(path.join(__dirname, '..', '..', '..', 'supabase', 'functions', 'notify-push', 'index.ts'));
const handler = SOURCE.slice(SOURCE.indexOf('serve('));

describe('notify-push', () => {
  it('takes a notice\'s id alone from its caller', () => {
    expect(handler.length).toBeGreaterThan(500);
    expect(handler).toMatch(/\[body\?\.record\?\.id, body\?\.id\]\.find\(\(v\) => typeof v === 'string' && UUID\.test\(v\)\)/);
    // No other field of the body is read: the record pushed is the claimed row.
    expect([...handler.matchAll(/body\?\.(\w+)/g)].map((m) => m[1]).filter((f) => f !== 'record' && f !== 'id')).toEqual([]);
    expect([...handler.matchAll(/body\?\.record\?\.(\w+)/g)].map((m) => m[1])).toEqual(['id']);
    expect(handler).not.toMatch(/body\?\.record \?\?/);
  });

  it('claims the notice from the house once, while fresh, and pushes the row it claimed', () => {
    expect(handler).toMatch(/\.update\(\{ pushed_at: new Date\(\)\.toISOString\(\) \}\)/);
    expect(handler).toMatch(/\.eq\('id', id\)\.is\('pushed_at', null\)\.gte\('created_at', new Date\(Date\.now\(\) - PUSH_WINDOW_MS\)\.toISOString\(\)\)/);
    expect(handler).toMatch(/\.select\(NOTICE_COLUMNS\)\.maybeSingle<NotificationRecord>\(\)/);
    expect(SOURCE).toMatch(/const PUSH_WINDOW_MS = 15 \* 60_000/);
    expect(handler).toMatch(/composeBanner\(record\)/);
  });

  it('lets the notice go when Expo refused it, so a later call may push it', () => {
    const caught = handler.slice(handler.lastIndexOf('catch (err)'));
    expect(caught).toMatch(/if \(claimed\) \{[\s\S]*\.update\(\{ pushed_at: null \}\)\.eq\('id', claimed\)/);
  });
});
