# The last three functions — read them, don't call them

Three of the nine `SECURITY DEFINER` functions could not be settled by probing,
because settling them by calling them would mean **running** them against the live
database. One of them moves money.

Run the query below in the Supabase SQL editor. It is **read-only** — it only
reads the system catalogue. Paste the result back.

```sql
SELECT
  p.proname                                   AS function_name,
  pg_get_function_identity_arguments(p.oid)   AS arguments,
  CASE WHEN p.prosecdef THEN 'DEFINER (bypasses RLS)' ELSE 'INVOKER' END AS security,
  COALESCE(array_to_string(p.proconfig, ', '), '(no search_path pinned)')  AS config,
  COALESCE(pg_get_userbyid(p.proowner), '?')  AS owner,
  CASE
    WHEN has_function_privilege('anon',   p.oid, 'EXECUTE') THEN 'YES — anon can call it'
    ELSE 'no'
  END                                         AS anon_can_execute,
  CASE
    WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'yes'
    ELSE 'NO'
  END                                         AS authenticated_can_execute,
  p.prosrc                                    AS body
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'process_secure_tip',
    'get_lounge_unread_counts',
    'batch_insert_list_items',
    'replace_list_items'
  )
ORDER BY p.proname;
```

## What each answer decides

**`process_secure_tip`** — it moves money, so nothing about it may be assumed.
Looking for: does the body read `auth.uid()` for the *sender*, or does it accept a
sender id as a parameter? If a parameter, anyone could send a tip **as** someone
else. The repo copy reads `auth.uid()` first and raises
`'You must be authenticated to tip.'`, which is the correct shape — but the repo
has already been proven stale four times in this audit, and once specifically about
one of these nine (`replace_list_items`).

**`get_lounge_unread_counts`** — `anon` can call it, and it returned `[]` for a real
member's id. That is consistent with it reading `auth.uid()` internally, but a
member with no unread messages returns `[]` too. Looking for: does the body filter
on `auth.uid()` or on the `p_user_id` it was handed? If the latter, anyone can read
anyone's unread counts, and the `p_user_id` parameter should be ignored the same way
`is_hidden_by` and `get_user_blocks` were in batch 2.

**`batch_insert_list_items`** — expected to return **no rows at all**, confirming it
does not exist. That would prove the web Letterboxd list import is broken
(`web/src/utils/letterboxdImport.ts:651` calls it). If it *does* come back, check
whether it takes an owner id as a parameter — the archived definition does, and that
would be a live caller-supplied-identity flaw.

**`replace_list_items`** — included as a control. Live probing already showed it
answers `"Not authenticated"` and takes `(p_list_id, p_items)`, while the repo file
shows an older three-argument version taking `p_user_id`. This confirms the repo is
stale rather than the database being vulnerable. If the body here reads `auth.uid()`,
it is settled and safe.

## Why this is the right way round

Every other function in the sweep was settled by calling it with fake or zero-valued
arguments, chosen so its own guard ran before any mutation — nothing real was ever
written. That trick does not work for these:

- `process_secure_tip` moves money, and a wrong guess about its signature is not
  something to discover by trying.
- `get_lounge_unread_counts` reads, but its answer is ambiguous without the body.
- `batch_insert_list_items` cannot be probed for a signature that may not exist.

Reading the catalogue costs one query and settles all four with certainty.
