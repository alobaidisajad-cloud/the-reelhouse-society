-- Read-only: what 20261122_00 and 20261122_01 leave on production, each as one line.
-- Run with: node mobile/supabase/diagnostics/read-only.cjs train_12_live_check.sql
-- The train ran each car's rehearsal there after it applied it; these read back what the rehearsals
-- roll away: the words the pass cleaned, who may run it, and the trigger and the list the cars keep.

-- 20261122_00: no verdict keeps an override or an invisible space in its appeal, its word or its lift's reason (0)
SELECT 'a verdict keeping an override or an invisible space in its appeal, word or lift reason (0)',
  (SELECT count(*) FROM public.mod_actions
    WHERE concat(appeal, appeal_note, lift_reason) ~ ('[' || chr(8203) || chr(8238) || ']'))::text;

-- 20261122_00: no notice of an appeal heard or a sanction lifted keeps one either (0)
SELECT 'a notice of an appeal heard or a sanction lifted keeping one (0)',
  (SELECT count(*) FROM public.notifications
    WHERE type = 'moderation' AND metadata ->> 'action' IN ('appeal', 'lift')
      AND concat(body, message, metadata ->> 'reason') ~ ('[' || chr(8203) || chr(8238) || ']'))::text;

-- 20261122_00: the pass is the house's alone (false|false|false)
SELECT 'the cleaning pass run by a member, a visitor or anyone (false|false|false)',
  has_function_privilege('authenticated', 'private.the_moderators_words_made_clean()', 'EXECUTE')::text || '|'
  || has_function_privilege('anon', 'private.the_moderators_words_made_clean()', 'EXECUTE')::text || '|'
  || (SELECT coalesce(bool_or(a.grantee = 0), false)::text FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE p.oid = 'private.the_moderators_words_made_clean()'::regprocedure);

-- 20261122_00: a verdict's words are cleaned by its trigger, the appeal, the word and the reason among them (true)
SELECT 'the verdicts'' cleaning trigger names the appeal, the word and the lift''s reason (true)',
  (SELECT pg_get_triggerdef(t.oid) LIKE '%appeal_note%lift_reason%'
     FROM pg_trigger t WHERE t.tgrelid = 'public.mod_actions'::regclass AND t.tgname = 'a_clean_member_text')::text;

-- 20261122_01: withheld_at is a record's own column, and every column of a log is decided (true|false|)
SELECT 'withheld_at a record''s own column, not a viewing''s, and no column undecided (true|false|)',
  (public.viewing_fields() -> 'not_a_viewing' @> '["withheld_at"]'::jsonb)::text || '|'
  || (public.viewing_fields() -> 'archived' ? 'withheld_at')::text || '|'
  || array_to_string(public.viewing_fields_uncovered(), ', ');
