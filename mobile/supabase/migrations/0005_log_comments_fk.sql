-- 0005_log_comments_fk.sql
-- Description: Adds the missing foreign key constraint between log_comments.user_id and profiles.id

ALTER TABLE public.log_comments
ADD CONSTRAINT log_comments_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id)
ON DELETE CASCADE;
