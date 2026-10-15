-- The undo of 20261015_06: every table's a_keeps_what_it_is trigger, then the function they share.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DROP TRIGGER a_keeps_what_it_is ON public.interactions;
DROP TRIGGER a_keeps_what_it_is ON public.lounge_members;
DROP TRIGGER a_keeps_what_it_is ON public.lounge_messages;
DROP TRIGGER a_keeps_what_it_is ON public.log_comments;
DROP TRIGGER a_keeps_what_it_is ON public.list_comments;
DROP TRIGGER a_keeps_what_it_is ON public.dossier_comments_legacy;
DROP TRIGGER a_keeps_what_it_is ON public.dispatch_dossiers_legacy;
DROP TRIGGER a_keeps_what_it_is ON public.lists;
DROP TRIGGER a_keeps_what_it_is ON public.logs;
DROP TRIGGER a_keeps_what_it_is ON public.physical_archive;
DROP TRIGGER a_keeps_what_it_is ON public.watchlists;
DROP TRIGGER a_keeps_what_it_is ON public.notifications;
DROP TRIGGER a_keeps_what_it_is ON public.warnings;
DROP TRIGGER a_keeps_what_it_is ON public.lounges;
DROP FUNCTION public.a_row_keeps_what_it_is();
