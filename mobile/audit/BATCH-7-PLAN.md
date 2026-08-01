# BATCH 7 — #80 · Ban enforcement

**Status: STUDIED. Every fact below was read live or executed. Nothing written yet.**
Studied 2026-08-01 against the live policy catalogue, both codebases, and git history.

---

## 1 · The finding is HALF WRONG, and the half it gets right is far bigger than it says

### 1a · The client claim is a FALSE POSITIVE

#80 states `useBanCheck` has *"zero call sites"* and is dead code. It is not:

```
app/(modals)/list-modal.tsx:37   import { useBanCheck } from '@/src/hooks/useBanCheck';
app/(modals)/list-modal.tsx:139  const { checkBan } = useBanCheck();
app/(modals)/list-modal.tsx:240  if (checkBan()) return;
```

Added by commit `f6b7b91` — *"feat(moderation): block silenced members from creating
or editing stacks"* — **after the audit was written**. The comment above it even
explains the placement: *"Before setSaving: an early return after it would strand the
button spinning… Covers BOTH branches below — a silenced member may not create OR
edit a stack."* That is careful, correct work.

So this is **not** "dead code to wire or delete". It is wired at **1 of ~6** choke
points. The remaining work is smaller and different from what the finding describes.

### 1b · The server claim is right, but the number is 17, not 2

Live catalogue read, all 27 tables both apps touch:

| | count |
|---|---|
| ban gate on **INSERT** | **10** |
| ban gate on **UPDATE** | **2** — `logs`, `dispatch_dossiers` only |
| **no ban gate at all** | **17** |

#80 names `physical_archive` and `lounge_message_reactions`. Both confirmed
uncovered — and so are fifteen others.

### 1c · The gap the finding never raises: EDITING

Only `logs` and `dispatch_dossiers` block a banned member from **changing** an
existing row. Everywhere else the ban stops new posts and nothing else. A banned
member can go back and rewrite an old list, comment, programme or profile into
abuse — the same visible-to-others harm #80 cites for reactions, on more surfaces.

---

## 2 · Which of the 17 are REAL gaps, and which must stay open

A banned member should be able to **read**, **delete their own content** (leave
cleanly), and **protect themselves**. They must not create or change anything others
can see. Judged one by one against the live policy list:

| table | member write path | verdict |
|---|---|---|
| `profiles` | UPDATE own | **GAP — the worst one.** Username, display name, bio, avatar and links are visible to everyone. |
| `dossier_certifications` | INSERT | **GAP.** A visible endorsement, exactly the case #80 makes for reactions. |
| `lounge_message_reactions` | INSERT | **GAP** — named by #80. |
| `physical_archive` | INSERT + UPDATE | **GAP** — named by #80; visible on the profile. |
| `lounges` | INSERT + UPDATE | **GAP.** Create a room, or rename an existing one. |
| `lounge_members` | join (RPC only) | **GAP.** A banned member can still walk into rooms. |
| `programmes` | ALL, publicly readable | **GAP.** |
| `vaults` | ALL, publicly readable | **GAP.** |
| `lists`, `list_comments`, `log_comments`, `dossier_comments` | UPDATE | **GAP — edit vector** (INSERT already gated) |
| `user_blocks` | INSERT/UPDATE/DELETE | **MUST STAY OPEN.** Blocking is self-protection; a banned member must keep it. |
| `reports`, `user_reports` | INSERT | **MUST STAY OPEN.** Reporting abuse and appealing are the two things a silenced member most needs. |
| `analytics_events`, `error_logs` | INSERT | **MUST STAY OPEN.** Telemetry; gating it would blind the app to the banned member's own crashes. |
| `notifications`, `push_tokens` | own rows | **NOT A GAP.** System-owned; nothing another member sees. |
| `log_private_notes` | INSERT/UPDATE | **NOT A GAP.** Owner-only by construction (batch 1). Nobody else can ever read it. |
| `tickets` | INSERT | **NOT GATED HERE.** A purchase, not content. Blocking payment from a banned account is a billing decision, not a moderation one. |

**DELETE is never gated, anywhere.** A silenced member must be able to remove their
own writing and leave. Gating deletion would trap them with content they want gone —
worse for them and worse for the Society.

---

## 3 · Mechanism — policies alone would be theatre again (the batch 6 lesson)

Grepped both migration trees for `SECURITY DEFINER` functions that write each table.
`SECURITY DEFINER` bypasses RLS, so a policy cannot see those paths:

| table | SECURITY DEFINER writers | so the gate must be |
|---|---|---|
| `dossier_certifications` | `toggle_dossier_certify` | **trigger** |
| `lounge_members` | `join_public_lounge`, `request_lounge_membership`, `approve_lounge_member`, `create_lounge`, `create_lounge_with_member`, `set_lounge_member_status` | **trigger** |
| `lounges` | `create_lounge`, `create_lounge_with_member`, `recount_lounge_members`, `set_lounge_cover` | **trigger** |
| `profiles` | `claim_founding_seat`, `request_account_deletion`, `resolve_moderation_report_v2` | **trigger** |
| the rest | none | policy is sufficient — trigger used anyway, for one consistent mechanism |

**This is the third batch where a policy-only fix would have been useless.** Gate the
tables, not the paths.

---

## 4 · Two traps found while designing — both would have broken real behaviour

### 4a · A blanket UPDATE gate on `lounges` breaks LEAVING a lounge

`recount_lounge_members` fires on every `lounge_members` change and does
`UPDATE public.lounges SET member_count = …`. A trigger that refuses all updates
from a banned member would fire on that counter — so a banned member trying to
**leave** a room would be blocked by the counter update, not by any rule about them.
Leaving must always work.

**Solution:** on `lounges`, revert only the member-visible fields (`name`,
`description`, cover). A counter update touches none of them, so it passes untouched.

### 4b · A blanket UPDATE gate on `profiles` blocks the moderator AND harmless self-config

Two separate problems:
- `resolve_moderation_report_v2` is what **sets** a ban. It updates the *target's*
  profile. The gate reads `auth.uid()` — the moderator — who is not banned, so it
  passes. Verified by reading, not assumed.
- A banned member changing their own notification preferences is harmless, but
  `preferences` lives on `profiles`, and RLS cannot gate a column.

**Solution:** the same field-revert pattern batch 6 used for paid log fields. Revert
only `username`, `display_name`, `bio`, `avatar_url`, `social_links`, `persona`. A
banned member keeps control of their own settings and loses control of what the
Society sees. That is the precise, correct line.

### 4c · `lounge_messages` UPDATE is deliberately NOT gated

The only UPDATE path is `withdraw_lounge_message` (SECURITY DEFINER), which blanks
the content. That is a member **removing** their own words, which must keep working
for a banned member. There is no edit path to abuse.

---

## 5 · What is still unknown

Nothing that blocks writing the migration. Two things to confirm during the replica
run rather than assume:

1. Whether `is_user_not_banned()` remains `STABLE SECURITY DEFINER` with
   `search_path` pinned on the live database (repo says yes; repo has been stale five
   times) — result 2 of the query settles it.
2. Whether any content table has an UPDATE path through a `SECURITY DEFINER`
   function that must keep working, beyond the two found in §4. The replica test
   covers this by exercising leave-a-lounge and withdraw-a-message explicitly.

---

## 6 · The client half — 5 more choke points, or none

`checkBan()` is wired in `list-modal`. The finding suggests `addLogOp`, `createList`,
`addLogComment`, `addStackComment`, `sendMessage`, `addDossier`.

**This is cosmetic once the server half lands** — the server will refuse regardless.
Its only value is telling the member *why* instead of showing a generic failure.
That is worth having, but it is a client change and therefore belongs to the launch
build, not to this SQL. It is recorded, not bundled.

**DONE WHEN** a banned test account is refused on every gap in §2, proven live inside
a rolled-back transaction; a banned member is proven to still block, report, delete
their own content and leave a lounge; and a non-banned member is proven unaffected.
