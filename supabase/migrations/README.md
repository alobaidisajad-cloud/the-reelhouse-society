# ReelHouse — Database Migration Workflow

## The Rule: Every schema change = a migration file

**Never edit `supabase-schema.sql` without also creating a migration file.**

---

## File Structure

```
supabase/
  migrations/
    20260312_add_tickets_stubs.sql         ← past migration
    20260312_add_log_comments.sql          ← past migration  
    20260313_sync_all_missing_columns.sql  ← master sync (ran 2026-03-13)
    YYYYMMDD_description.sql               ← future migrations go here
  functions/
    paytabs-handler/
      index.ts
supabase-schema.sql   ← canonical reference (full schema)
```

---

## How to Make a Schema Change

### Step 1 — Write the migration file
Create `supabase/migrations/YYYYMMDD_your_change.sql`:
```sql
-- Example: adding a new column
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS mood text;
```

### Step 2 — Run it in Supabase SQL Editor
Paste the migration SQL → click **Run** → confirm "Success. No rows returned"

### Step 3 — Update supabase-schema.sql
Add the new column/table to the canonical schema file so it stays up to date.

### Step 4 — Commit everything together
```bash
git add -A
git commit -m "feat(db): add mood column to logs — migration 20260313"
```

---

## What Was Fixed in the Master Sync (2026-03-13)

### Added to `profiles`
| Column | Type | Default |
|---|---|---|
| role | text | 'cinephile' |
| tier | text | 'free' |
| persona | text | 'The Cinephile' |
| favorite_films | jsonb | '[]' |
| is_social_private | boolean | false |
| followers_count | integer | 0 |
| following_count | integer | 0 |
| total_logs | integer | 0 |

### Added to `logs` (editorial features)
| Column | Purpose |
|---|---|
| private_notes | Personal notes hidden from feed |
| abandoned_reason | Why user stopped watching |
| physical_media | 4K/Blu-ray/VHS format |
| is_autopsied | Has editorial autopsy |
| autopsy | Full autopsy data (jsonb) |
| alt_poster | Custom poster URL |
| editorial_header | Custom header image |
| drop_cap | Enable drop cap on review |
| pull_quote | Featured pull quote |
| updated_at | Auto-updated timestamp |

### Other fixes
- `interactions.target_list_id` — list endorsements now work
- `list_items.poster_path` — film posters persist in lists
- `notifications.is_read`, `from_user_id`, `related_log_id`
- Created `log_comments` table with RLS
- Created `programmes` table with RLS
- 5 performance indexes added

---

## Current Full Table List
- `profiles` — user accounts + social
- `logs` — film diary with editorial
- `watchlists` — films to watch
- `vaults` — physical media collection
- `lists` + `list_items` — curated collections
- `interactions` — follows, reactions, endorsements
- `notifications` — user notifications
- `dispatch_dossiers` — editorial essays
- `programmes` — nightly pairings
- `log_comments` — comments on logs
- `cinema_reviews` — venue reviews
- `venues` — cinema profiles
- `showtimes` — screening schedules
- `tickets` — purchased stubs
- `error_logs` — client error tracking
