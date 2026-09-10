-- ═══════════════════════════════════════════════════════════════════════════
-- A FILING IS NAMED, NOT SPELLED
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `dispatch_names` builds the sentence a member reads in a notice:
--
--     "@ana certified your dossier “On Noir”."
--     "@ana left a critique on your dossier “On Noir”."
--
-- It built that noun by interpolating `dispatch_posts.kind` — a COLUMN VALUE —
-- straight into English. So the schema chose the app's vocabulary, and the long
-- form was called a dossier because a column happened to say so. Nobody decided
-- it. Twenty-nine notices already went out carrying it.
--
-- A dossier is a file compiled ABOUT a subject: a member's profile, a film's
-- panel, a person's biography. All three keep the word. The long form is
-- somebody's argument at length, which is an ESSAY — the word every module that
-- builds it has always used (`PaperEssay`, `EssayHead`, `EssayBody`,
-- `MAX_LENGTHS.filingEssay`). The client now prints it from one table,
-- `KIND_NAME`; this is the same table, on the server side of the same sentence.
--
-- ── WHAT DOES NOT CHANGE ───────────────────────────────────────────────────
-- `kind` keeps every value it has. Live rows carry it, `get_dispatch_feed`
-- filters on it, the group key `endorse:post:<id>` is built from it, and the
-- client's own draft keys use it. This function is the only place the value was
-- ever shown to a person.
--
-- ── WHY A CASE AND NOT A LOOKUP TABLE ──────────────────────────────────────
-- The function is IMMUTABLE, which is what lets it be inlined into the two
-- trigger bodies that call it. Reading a table would make it STABLE at best and
-- would be a second copy of a list the client already owns. Five kinds, one
-- exception, stated once.
--
-- NULL still yields "your filing", exactly as `coalesce(p_kind,'filing')` did.
-- An empty string used to yield "your " with nothing after it; it now yields
-- "your filing" too, which is the behaviour that line was always reaching for.

CREATE OR REPLACE FUNCTION public.dispatch_names(p_kind text, p_title text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  SELECT 'your '
      || CASE lower(btrim(coalesce(p_kind, '')))
           WHEN 'dossier' THEN 'essay'
           WHEN ''        THEN 'filing'
           ELSE lower(btrim(p_kind))
         END
      || CASE WHEN btrim(coalesce(p_title, '')) = '' THEN ''
              ELSE ' “' || btrim(p_title) || '”' END;
$function$;

-- ── THE TWENTY-NINE NOTICES ALREADY DELIVERED ARE DELIBERATELY LEFT ────────
-- There are 29 rows in `notifications` reading "certified your dossier 🏆" and
-- "certified your dossier ✦", all from July 2026. It is tempting to rewrite the
-- noun in them and call the sweep complete. It would be wrong.
--
-- They did NOT come from this function. They carry no `group_key` and no
-- metadata, and they predate the Dispatch: they are from the superseded endorse
-- trigger that wrote "certified your dossier 🏆" for EVERY endorsement — a log
-- included. That is the same defect the notification audit recorded, where the
-- grouping regex could never match because the message named a dossier while the
-- thing endorsed was a film log.
--
-- So the subject of those 29 rows is not knowable from the rows. Replacing
-- "dossier" with "essay" there would swap one word that may be wrong for another
-- word that may be wrong, and would look like a verified correction. They are
-- left exactly as they are, and this comment is why.
