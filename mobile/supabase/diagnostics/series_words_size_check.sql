-- How large is the Dispatch's table that a stored word count would rewrite (P4.53, the series page)?
--   node mobile/supabase/diagnostics/read-only.cjs series_words_size_check.sql
SELECT 'rows ' || count(*) || ' | essays ' || count(full_content) || ' | series parts ' || count(series_id)
       || ' | longest essay ' || coalesce(max(char_length(full_content)), 0)
       || ' | table ' || pg_size_pretty(pg_total_relation_size('public.dispatch_posts'))
  FROM public.dispatch_posts;
