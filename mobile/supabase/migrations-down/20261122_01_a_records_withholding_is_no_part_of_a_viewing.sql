-- Undo of 20261122_01: a record's withholding is no part of a viewing, undone: viewing_fields() as production held it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: viewing_fields() as production held it before this car, every viewing archived as before; replayed as the members themselves (a_records_withholding_is_no_part_of_a_viewing rehearsal)
CREATE OR REPLACE FUNCTION public.viewing_fields() RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT '{
    "archived": {
      "watched_date":     {"key": "date",            "fallback": null},
      "rating":           {"key": "rating",          "fallback": 0},
      "review":           {"key": "review",          "fallback": ""},
      "format":           {"key": "format",          "fallback": "digital"},
      "status":           {"key": "status",          "fallback": "watched"},
      "is_spoiler":       {"key": "isSpoiler",       "fallback": false},
      "watched_with":     {"key": "watchedWith",     "fallback": null},
      "abandoned_reason": {"key": "abandonedReason", "fallback": null},
      "physical_media":   {"key": "physicalMedia",   "fallback": null},
      "is_autopsied":     {"key": "isAutopsied",     "fallback": false},
      "autopsy":          {"key": "autopsy",         "fallback": null},
      "alt_poster":       {"key": "altPoster",       "fallback": null},
      "editorial_header": {"key": "editorialHeader", "fallback": null},
      "drop_cap":         {"key": "dropCap",         "fallback": false},
      "pull_quote":       {"key": "pullQuote",       "fallback": ""},
      "video_url":        {"key": "videoUrl",        "fallback": null}
    },
    "not_a_viewing": ["id", "user_id", "film_id", "film_title", "poster_path",
                      "year", "created_at", "updated_at", "private_notes",
                      "viewing_history", "view_count", "viewing_id"]
  }'::jsonb;
$$;
