-- train_2_indexes_live_check.sql — read only. The four indexes the train of 2026-10-25 built on
-- production, each built CONCURRENTLY: present, valid (built whole) and ready, on the columns named.
SELECT c.relname AS index, i.indisvalid AS valid, i.indisready AS ready, i.indisunique AS is_unique,
       pg_get_indexdef(i.indexrelid) AS definition
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
 WHERE c.relname IN ('lounge_messages_reply_to_id', 'lounge_messages_card_names',
                     'interactions_endorse_log_once', 'interactions_endorse_list_once')
 ORDER BY c.relname;
