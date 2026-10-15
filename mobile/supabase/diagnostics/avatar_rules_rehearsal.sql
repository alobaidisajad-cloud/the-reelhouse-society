-- ════════════════════════════════════════════════════════════════════════════
-- avatar_rules_rehearsal.sql — do the avatar storage rules do what they say?
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/avatar_rules_rehearsal.sql
--
-- Runs 17 cases against the LIVE rules on storage.objects, as a member and as a
-- visitor, inside one transaction that ROLLS BACK. Nothing is kept. Each case
-- undoes itself (it raises SQLSTATE ZZ001 after recording its result), so no
-- case sees another's writes. Before 20260927_01, six did not hold: a member
-- could upload .html or .svg, rename an avatar to .html, and list other
-- members' folders, and a visitor could list every avatar folder.
--
-- The two folders belong to made-up ids; nothing here touches a real member's
-- files. Production runs it by hand; db-integration.yml runs it on the sealed
-- copy (e2e/db/rehearsals.mjs). Read each NOTICE as  case|expected|got ; the
-- last line is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- One statement, as whoever is acting: allow (it touched a row) or refuse; then undone.
CREATE FUNCTION pg_temp.av_try(stmt text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint; r text := 'error';
BEGIN
  BEGIN
    EXECUTE stmt;
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.av_try(text) TO anon, authenticated;

-- Objects to act on, placed as the owner: one in the member's folder, one in
-- another's, and one more, so a visitor's listing of the rest has a row to find.
INSERT INTO storage.objects (bucket_id, name)
VALUES ('avatars', '11111111-0000-4000-8000-000000000001/old.png'), ('avatars', '22222222-0000-4000-8000-000000000002/theirs.png'),
       ('avatars', '33333333-0000-4000-8000-000000000003/someone.png');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true) AS done \gset rh_
SELECT set_config('storage.allow_delete_query', 'true', true) AS done \gset rh_
DO $$
DECLARE
  mine CONSTANT text := '11111111-0000-4000-8000-000000000001/';
  theirs CONSTANT text := '22222222-0000-4000-8000-000000000002/';
BEGIN
  PERFORM pg_temp.rh_case('member: upload own .png', 'allow',
    pg_temp.av_try(format($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', %L)$q$, mine || '1.png')));
  PERFORM pg_temp.rh_case('member: upload own .GIF (any case)', 'allow',
    pg_temp.av_try(format($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', %L)$q$, mine || '2.GIF')));
  PERFORM pg_temp.rh_case('member: upload own .jpeg', 'allow',
    pg_temp.av_try(format($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', %L)$q$, mine || '3.jpeg')));
  PERFORM pg_temp.rh_case('member: upload own .webp', 'allow',
    pg_temp.av_try(format($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', %L)$q$, mine || '4.webp')));
  PERFORM pg_temp.rh_case('member: upload own .html', 'refuse',
    pg_temp.av_try(format($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', %L)$q$, mine || 'page.html')));
  PERFORM pg_temp.rh_case('member: upload own .svg', 'refuse',
    pg_temp.av_try(format($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', %L)$q$, mine || 'x.svg')));
  PERFORM pg_temp.rh_case('member: upload into another member''s folder', 'refuse',
    pg_temp.av_try(format($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', %L)$q$, theirs || '1.png')));
  PERFORM pg_temp.rh_case('member: rename own .png to .html', 'refuse',
    pg_temp.av_try(format($q$UPDATE storage.objects SET name = %L WHERE bucket_id = 'avatars' AND name = %L$q$, mine || 'old.html', mine || 'old.png')));
  PERFORM pg_temp.rh_case('member: replace own avatar, still an image', 'allow',
    pg_temp.av_try(format($q$UPDATE storage.objects SET name = %L WHERE bucket_id = 'avatars' AND name = %L$q$, mine || 'new.png', mine || 'old.png')));
  PERFORM pg_temp.rh_case('member: touch another member''s avatar', 'refuse',
    pg_temp.av_try(format($q$UPDATE storage.objects SET name = name WHERE bucket_id = 'avatars' AND name = %L$q$, theirs || 'theirs.png')));
  PERFORM pg_temp.rh_case('member: list own folder', 'allow',
    pg_temp.av_try(format($q$SELECT 1 FROM storage.objects WHERE bucket_id = 'avatars' AND name = %L$q$, mine || 'old.png')));
  PERFORM pg_temp.rh_case('member: list another member''s folder', 'refuse',
    pg_temp.av_try(format($q$SELECT 1 FROM storage.objects WHERE bucket_id = 'avatars' AND name = %L$q$, theirs || 'theirs.png')));
  PERFORM pg_temp.rh_case('member: delete own avatar', 'allow',
    pg_temp.av_try(format($q$DELETE FROM storage.objects WHERE bucket_id = 'avatars' AND name = %L$q$, mine || 'old.png')));
  PERFORM pg_temp.rh_case('member: delete another member''s avatar', 'refuse',
    pg_temp.av_try(format($q$DELETE FROM storage.objects WHERE bucket_id = 'avatars' AND name = %L$q$, theirs || 'theirs.png')));
END $$;
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true) AS done \gset rh_
DO $$
DECLARE
  mine CONSTANT text := '11111111-0000-4000-8000-000000000001/';
  theirs CONSTANT text := '22222222-0000-4000-8000-000000000002/';
BEGIN
  PERFORM pg_temp.rh_case('visitor: visitor uploads', 'refuse',
    pg_temp.av_try($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', 'anon/1.png')$q$));
  PERFORM pg_temp.rh_case('visitor: visitor lists a member''s folder', 'refuse',
    pg_temp.av_try(format($q$SELECT 1 FROM storage.objects WHERE bucket_id = 'avatars' AND name = %L$q$, theirs || 'theirs.png')));
  PERFORM pg_temp.rh_case('visitor: visitor lists every avatar in the house', 'refuse',
    pg_temp.av_try(format($q$SELECT 1 FROM storage.objects WHERE bucket_id = 'avatars' AND name NOT LIKE %L AND name NOT LIKE %L$q$,
                          mine || '%', theirs || '%')));
END $$;
RESET ROLE;

DO $$ BEGIN
  PERFORM pg_temp.rh_case('no rule on stored files still names the screening room', '0',
    (SELECT count(*)::text FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      WHERE c.relname = 'objects'
        AND coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') LIKE '%screening-room%'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
