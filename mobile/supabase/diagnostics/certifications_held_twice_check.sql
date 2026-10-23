-- certifications_held_twice_check.sql — read only. How many certifications of a log or a stack
-- the house holds more than once for one member, and how many of each kind it holds in all.
SELECT 'log certifications', count(*) FROM public.interactions WHERE type = 'endorse_log'
UNION ALL
SELECT 'stack certifications', count(*) FROM public.interactions WHERE type = 'endorse_list'
UNION ALL
SELECT 'log certifications held twice', count(*) FROM (
  SELECT 1 FROM public.interactions WHERE type = 'endorse_log' GROUP BY user_id, target_log_id HAVING count(*) > 1) t
UNION ALL
SELECT 'stack certifications held twice', count(*) FROM (
  SELECT 1 FROM public.interactions WHERE type = 'endorse_list' GROUP BY user_id, target_list_id HAVING count(*) > 1) t;
