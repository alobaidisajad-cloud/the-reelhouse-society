# The Lounge — Final Redesign Plan

The single source of truth for the lounge/chat redesign. Mockups live beside this file
(`lounge-redesign-mockup.html` = chat, `lounge-landing-v2-mockup.html` = main page,
`lounge-private-gate-mockup.html` = velvet rope, `lounge-at-the-door-mockup.html` = host approval).

## Design language — "Editorial Salon"
A 1924 cinema salon. The conversation reads like elegant correspondence, not a messaging app.
- **Soul in the chrome, serenity on the reading surface.** Rich/cinematic header, composer, gates; calm, high-contrast, low-texture canvas where people read.
- **Fonts:** body = **Spectral** (screen serif, long-read comfort) · titles/room names = **Special Elite** · big mastheads = **Rye** · labels/time = **Inter**.
- **Canvas:** warm near-black (`ink`), parchment text, sepia accents, ash hairlines. No grain behind text. Corrected sepia hue (CONST-1 tokens).
- **Logo:** the real `assets/images/reelhouse-logo.png` in the chat header crest + landing masthead (the mockups' circle/eye were placeholders).

## The new membership model (invite codes REMOVED)
| | Public lounge | Private lounge |
|---|---|---|
| Joining | tap → **instant member** | tap → **request** → host **admits** |
| Read before joining | **preview** recent messages | **locked** until admitted |

Private lounges are **discoverable but gated**: listed in *All Salons* with a lock (name/description/member count visible) so people can request; messages stay sealed until admitted.

## Where join-requests appear (the elite solution)
Three calm, layered surfaces — immediate, ambient, contextual:
1. **Notification** (push + in-app) the instant a request arrives.
2. **A sepia "N at the door" badge** on the host's room card (main page) + the room header.
3. **The "At the Door" panel** — opened from that badge: guest list with **Admit / Decline**. Requests live with the room; no separate inbox.

## Screens
- **Chat (transcript):** bubble-less, left-aligned, grouped by sender; serif body; you = sepia name + quiet sepia left-rule; marquee header (logo, name, live ember, member stack, PRIVATE chip, "N at the door" badge for hosts); date dividers; film "dispatch" clippings; pull-quote replies; refined composer ("Compose a dispatch…").
- **Main page:** logo masthead + "The Lounge" (Rye) + subtitle + Archivist-Exclusive divider; search; single **Establish a Salon** CTA (no code field); *Your Screening Rooms* (cards w/ last-dispatch preview, unread ember, and host "at the door" badge); *All Salons* (programme-listing cards → "Take a seat" / "Request to join").
- **Private gate (velvet rope):** logo crest, room name, Private label, description, "N members behind the door", "by invitation" copy, **Request a seat** CTA. No chat. Pending → "Your request is with the host."
- **At the Door panel:** "Requests for admission" — requester rows with Admit/Decline; admit → joins + notified.

## Backend changes (grounded in the live schema)
- **Migration:** `ALTER TABLE lounge_members ADD COLUMN status text NOT NULL DEFAULT 'approved'` (existing rows approved; `'pending'` = request). Idempotent.
- **RPCs (SECURITY DEFINER, auth-checked):** `join_public_lounge(p_lounge_id)`, `request_lounge_membership(p_lounge_id)`, `approve_lounge_member(p_lounge_id, p_user_id)`, `decline_lounge_member(p_lounge_id, p_user_id)`.
- **RLS:** `lounge_messages` SELECT = approved member OR (lounge public, for preview). Private → members only — **enforced server-side**, so a client bug can't leak a private room. `lounge_members` SELECT = lounge members + host sees pending + requester sees own. `lounges` SELECT = metadata visible for discovery (deliberate; see decision below).
- **Notifications:** "X requested to join {lounge}" → host; "You were admitted to {lounge}" → requester (reuse `notifications` type `system`; delivered via the push webhook already built).
- `member_count` counts approved only.

## Experience completeness (reactions · message states · host controls · edge cases)
These complete the chat for a room people *live in*. All grounded in the current code
(sends are already optimistic via the offline queue; `metadata` exists on messages; the
`status` column from Phase A does double duty).

### 1. Reactions (core, not optional)
- **UX:** long-press a dispatch → the action sheet gains a **curated, on-theme reaction row** — a small **balanced** set of line icons — **Bravo** (star), **Adored** (heart), **Riveting** (flame), **Quoted** (quotation mark, for "well said / a deep cut") as praise/appreciation, and **Panned** (thumb-down) as the single clean critique — NOT a rainbow of emoji and no trendy slang. Panned is tinted blood so it reads as critique. Reacted dispatches show a compact row of **reaction chips** (icon + count) beneath them; your own is highlighted; tap to toggle, long-press a chip to see who reacted. Set is configurable.
- **Data:** new `lounge_message_reactions` (id, message_id, lounge_id, user_id, reaction text, created_at; unique(message_id,user_id,reaction)). RLS: approved members of the lounge read all + write their own. Realtime via the existing lounge channel.
- **Reliability:** optimistic toggle; counts aggregated client-side; chips are light (no per-row effects). Reaction set capped at ~5 to keep the transcript calm.

### 2. Message lifecycle states
- **UX:** **sending** (optimistic dispatch appears slightly dimmed) → **sent** (resolves) → **failed** = a discreet "Failed — tap to retry" line (sepia), tapping re-enqueues → **withdrawn** = a quiet italic tombstone "— dispatch withdrawn —" instead of a jarring disappearance (keeps the conversation's continuity).
- **Data/store:** add a client-only `status: 'sending'|'sent'|'failed'` to the optimistic message (today a failed send just *removes* it — we keep it and mark `failed` + add `retryMessage`). For withdrawn: soft-delete — `ALTER TABLE lounge_messages ADD COLUMN deleted_at timestamptz`; delete nulls `content` + sets `deleted_at` (so withdrawn text isn't retrievable); client renders the tombstone.
- **Reliability:** `status` is client-only (no schema churn); soft-delete is one nullable column; retry reuses the existing `send_lounge_message` offline queue.

### 3. Host member controls (a bouncer, not just a doorman)
- **UX:** in the settings member list, the host gets per-member actions, each behind a confirm. The founder can't be targeted; you can't act on yourself. The three actions are distinct:
  - **Muted** — stays a member and can still **read**, but **can't post or react** (read-only). Fully reversible (Unmute). For calming someone without ejecting them.
  - **Removed** — taken out of the salon (loses read + post). They **can return later** — rejoin a public lounge, or re-request a private one (and the host can re-admit). A soft eject.
  - **Banned** — removed **and blocked from returning**: can't rejoin a public lounge or request a private one until unbanned. The hard blacklist.
- **Data:** reuses Phase A's `status` column with extended values `approved | pending | muted | banned`. Remove = delete the member row; Mute/Ban = set status. **Posting RLS requires `status='approved'`**, so muted/banned/pending can't send — enforced server-side.
- **RPCs (owner-only, auth-checked):** `remove_lounge_member(p_lounge_id,p_user_id)`, `set_lounge_member_status(p_lounge_id,p_user_id,p_status)`.

### 4. Links, long content & full edge states
- **Links:** auto-detect http(s) URLs → tappable sepia underlined links via the app's safe link handler. Optional: tappable `@mentions`.
- **Long content:** long words wrap; long usernames truncate (already); the film/log clipping handles both share types.
- **Edge states (all in the editorial style):** loading ("Establishing connection"), empty (Buster — kept), not-found ("Signal lost" — kept), **send-failed/retry** (#2), and a slim **offline banner** ("You're offline — dispatches will send when you reconnect") driven by the existing offline queue.

## How it meets the standards
Breathtaking (marquee, ember, gates, clippings) · elegant/readable (serif transcript, calm canvas, zero learning curve) · premium/smooth (soul in chrome, 60fps lightweight rows) · on-theme (Nitrate Noir, real logo, salon voice) · cohesive (same tokens/fonts/motifs as feed/membership/profile) · reliable (below).

## Reliability
- Security enforced by RLS, not the UI. No invite-code attack surface (removed).
- Effects only on static chrome; transcript rows are light → smoother than today's bubbles.
- Date dividers computed inline (no list-shape change → bottom-pin/pagination intact).
- One new font (Spectral) via `@expo-google-fonts`, graceful fallback.
- All existing behavior preserved (realtime, send/reply/delete/report/block, settings).
- `tsc` + `eslint` + full Jest green each step; backend migration applied to live the careful way (verified, recorded — no `db push`); on-device readability/comfort pass before "done".

## Build sequence
- **Phase A — backend:** `lounge_members.status` (`approved|pending|muted|banned`) + `lounge_messages.deleted_at` + `lounge_message_reactions` table + `notifications.related_lounge_id` + a **member_count trigger** (keeps `lounges.member_count` = approved count); RPCs (join/request/approve/decline, remove/set-status, toggle-reaction, soft-delete); RLS (lounge metadata discoverable; `lounge_members` identities member-gated; messages readable by approved members + public preview; posting requires `approved`; reactions member-gated); notifications with routing. Apply live, verify.
- **Phase B — visual redesign:** Spectral + chat transcript + main page (Editorial Salon), real logo.
- **Phase C — new flows UI:** private gate, request/pending states, "At the Door" panel + badges, public preview, remove all invite-code UI.
- **Phase D — experience completeness:** reactions, message lifecycle states (sending/failed/retry/withdrawn), host member controls, link/long-content rendering, full edge states + offline banner.
- Green gates (`tsc`/`eslint`/Jest) each step + on-device readability/comfort pass.

## Design review — gaps caught & closed (deep pass)

**Correctness (these would have been real bugs):**
- **`member_count` is maintained client-side today** → drifts with pending/removal/multi-client. Move it to a **DB trigger** that keeps `lounges.member_count` = count of `approved` members. Always correct.
- **`notifications` has no room reference** → add `related_lounge_id uuid` (nullable) so request/admit notifications deep-link (request → At the Door, admitted → the room). The push pipeline then delivers + routes them.
- **Realtime only handles message INSERT/DELETE** → expand the lounge subscription to also handle **message UPDATE** (withdrawn/edited), the **`lounge_message_reactions`** table (INSERT/DELETE), and **membership changes** — so withdrawn dispatches update live, reactions appear live, and a **pending member auto-enters the instant the host admits them** (their gate flips to the chat). A removed/muted member's session reacts too.

**Privacy & security:**
- In *All Salons*, a **private** lounge you're not in shows **member count only — never member avatars** (avatars leak who's inside). `lounges` metadata is discoverable; `lounge_members` identities stay member-gated.
- **Public preview is a UI affordance, not a hard wall** — public messages are readable (they're public); "Take a seat" invites participation. (A hard last-N cap for non-members is a small optional RPC if ever wanted.)
- **Banned** users can't re-request (request RPC + unique constraint reject gracefully).

**Reliability / non-destructive:**
- **Keep the `invite_code` column** (stop using it) — no destructive drops; existing rows untouched.
- Reactions disabled on **sending/failed** (un-persisted) messages; set capped at ~5; **no per-reaction notifications** (keeps a busy room calm).
- **Accessibility pass:** parchment-on-ink contrast verified; dynamic type capped so the serif layout holds; ≥44px targets.

**Small UX touches:**
- A **pending** request shows in *Your Screening Rooms* with an "Awaiting" tag so the requester can track it.
- "At the Door" shows "No one's at the door" when empty; the badge hides at zero.

## Open decision to confirm
Private lounges **discoverable-but-gated** (listed with a lock so people can request; messages sealed) — confirm, or choose "stay fully hidden" (which needs a different discovery path since codes are gone).
