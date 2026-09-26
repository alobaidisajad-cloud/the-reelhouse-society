-- ════════════════════════════════════════════════════════════════════════════
-- avatar_rules_rehearsal.sql — do the avatar storage rules do what they say?
-- ════════════════════════════════════════════════════════════════════════════
-- Runs 17 cases against the LIVE rules on storage.objects, as a member and as a
-- visitor, inside one transaction that ROLLS BACK. Nothing is kept. Each case
-- undoes itself (it raises SQLSTATE ZZ001 after recording its result), so no
-- case sees another's writes.
--
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/avatar_rules_rehearsal.sql
--
-- Read each NOTICE as  who | case | expected | got.  Every line must have
-- expected = got. Before 20260927_01, six did not: a member could upload .html
-- or .svg, rename an avatar to .html, and list other members' folders, and a
-- visitor could list every avatar folder in production.
--
-- The two ids are made up; nothing here touches a real member's files.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
-- Two objects to act on, placed as the owner.
INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '11111111-1111-4111-8111-111111111111/old.png'), ('avatars', '22222222-2222-4222-8222-222222222222/theirs.png');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
DO $$ DECLARE n bigint; r text; BEGIN

  r := 'error';
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '11111111-1111-4111-8111-111111111111/1.png');
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RAISE NOTICE '%|%|%|%', 'member', 'upload own .png', 'allow', r;

  r := 'error';
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '11111111-1111-4111-8111-111111111111/2.GIF');
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RAISE NOTICE '%|%|%|%', 'member', 'upload own .GIF (any case)', 'allow', r;

  r := 'error';
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '11111111-1111-4111-8111-111111111111/3.jpeg');
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RAISE NOTICE '%|%|%|%', 'member', 'upload own .jpeg', 'allow', r;

  r := 'error';
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '11111111-1111-4111-8111-111111111111/4.webp');
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RAISE NOTICE '%|%|%|%', 'member', 'upload own .webp', 'allow', r;

  r := 'error';
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '11111111-1111-4111-8111-111111111111/page.html');
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RAISE NOTICE '%|%|%|%', 'member', 'upload own .html', 'refuse', r;

  r := 'error';
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '11111111-1111-4111-8111-111111111111/x.svg');
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RAISE NOTICE '%|%|%|%', 'member', 'upload own .svg', 'refuse', r;

  r := 'error';
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '22222222-2222-4222-8222-222222222222/1.png');
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RAISE NOTICE '%|%|%|%', 'member', 'upload into another member''s folder', 'refuse', r;

  r := 'error';
  BEGIN
    UPDATE storage.objects SET name = '11111111-1111-4111-8111-111111111111/old.html' WHERE bucket_id = 'avatars' AND name = '11111111-1111-4111-8111-111111111111/old.png';
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RAISE NOTICE '%|%|%|%', 'member', 'rename own .png to .html', 'refuse', r;

  r := 'error';
  BEGIN
    UPDATE storage.objects SET name = '11111111-1111-4111-8111-111111111111/new.png' WHERE bucket_id = 'avatars' AND name = '11111111-1111-4111-8111-111111111111/old.png';
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RAISE NOTICE '%|%|%|%', 'member', 'replace own avatar, still an image', 'allow', r;

  r := 'error';
  BEGIN
    UPDATE storage.objects SET name = name WHERE bucket_id = 'avatars' AND name = '22222222-2222-4222-8222-222222222222/theirs.png';
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RAISE NOTICE '%|%|%|%', 'member', 'touch another member''s avatar', 'refuse', r;

  r := 'error';
  BEGIN
    PERFORM 1 FROM storage.objects WHERE bucket_id = 'avatars' AND name = '11111111-1111-4111-8111-111111111111/old.png';
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RAISE NOTICE '%|%|%|%', 'member', 'list own folder', 'allow', r;

  r := 'error';
  BEGIN
    PERFORM 1 FROM storage.objects WHERE bucket_id = 'avatars' AND name = '22222222-2222-4222-8222-222222222222/theirs.png';
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RAISE NOTICE '%|%|%|%', 'member', 'list another member''s folder', 'refuse', r;

  r := 'error';
  BEGIN
    PERFORM set_config('storage.allow_delete_query', 'true', true); DELETE FROM storage.objects WHERE bucket_id = 'avatars' AND name = '11111111-1111-4111-8111-111111111111/old.png';
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RAISE NOTICE '%|%|%|%', 'member', 'delete own avatar', 'allow', r;

  r := 'error';
  BEGIN
    PERFORM set_config('storage.allow_delete_query', 'true', true); DELETE FROM storage.objects WHERE bucket_id = 'avatars' AND name = '22222222-2222-4222-8222-222222222222/theirs.png';
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RAISE NOTICE '%|%|%|%', 'member', 'delete another member''s avatar', 'refuse', r;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ DECLARE n bigint; r text; BEGIN

  r := 'error';
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', 'anon/1.png');
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RAISE NOTICE '%|%|%|%', 'visitor', 'visitor uploads', 'refuse', r;

  r := 'error';
  BEGIN
    PERFORM 1 FROM storage.objects WHERE bucket_id = 'avatars' AND name = '22222222-2222-4222-8222-222222222222/theirs.png';
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RAISE NOTICE '%|%|%|%', 'visitor', 'visitor lists a member''s folder', 'refuse', r;

  r := 'error';
  BEGIN
    PERFORM 1 FROM storage.objects WHERE bucket_id = 'avatars' AND name NOT LIKE '11111111-1111-4111-8111-111111111111/%' AND name NOT LIKE '22222222-2222-4222-8222-222222222222/%';
    GET DIAGNOSTICS n = ROW_COUNT;
    r := CASE WHEN n > 0 THEN 'allow' ELSE 'refuse' END;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = 'undo this case';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN r := 'refuse';
    WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
  RAISE NOTICE '%|%|%|%', 'visitor', 'visitor lists every avatar in production', 'refuse', r;
END $$;
RESET ROLE;
SELECT 'screening-room rules left: ' || count(*) FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
 WHERE c.relname = 'objects' AND coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') LIKE '%screening-room%';
ROLLBACK;
