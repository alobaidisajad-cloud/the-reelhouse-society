$PAT = "sbp_d3002dd928770d4328f745709f2e2027b01d6e7c"
$REF = "gzhntuwosrakevulmcry"
$API = "https://api.supabase.com/v1/projects/$REF/database/query"
$H = @{ "Authorization" = "Bearer $PAT"; "Content-Type" = "application/json" }

function Q {
    param($sql, $lbl)
    $b = @{ query = $sql } | ConvertTo-Json -Depth 5
    try {
        Invoke-WebRequest -Uri $API -Method POST -Headers $H -Body $b -UseBasicParsing -ErrorAction Stop | Out-Null
        Write-Host "OK  $lbl"
    } catch {
        $msg = $_.ErrorDetails.Message
        Write-Host "ERR $lbl -- $msg"
    }
}

Write-Host "=== Applying Premium Notifications Migrations ==="

Q "ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check" "drop_constraint"
Q "ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('follow', 'endorse', 'comment', 'annotate', 'retransmit', 'system', 'reaction'))" "add_constraint"

Q @'
CREATE OR REPLACE FUNCTION public.notify_on_interaction() 
RETURNS TRIGGER AS $$
DECLARE
    target_user UUID;
    sender_user TEXT;
    notif_message TEXT;
BEGIN
    SELECT username INTO sender_user FROM public.profiles WHERE id = NEW.user_id;

    IF NEW.type = 'follow' THEN
        target_user := NEW.target_user_id;
        notif_message := 'started following your frequency.';
        
        IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
            INSERT INTO public.notifications (user_id, type, from_username, message)
            VALUES (target_user, 'follow', sender_user, notif_message);
        END IF;

    ELSIF NEW.type = 'endorse_log' THEN
        SELECT user_id INTO target_user FROM public.logs WHERE id = NEW.target_log_id;
        notif_message := 'certified your dossier ✦';
        
        IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
            INSERT INTO public.notifications (user_id, type, from_username, message)
            VALUES (target_user, 'endorse', sender_user, notif_message);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
'@ "create_interaction_func"

Q "DROP TRIGGER IF EXISTS tr_notify_interaction ON public.interactions" "drop_tr_interaction"
Q "CREATE TRIGGER tr_notify_interaction AFTER INSERT ON public.interactions FOR EACH ROW EXECUTE FUNCTION public.notify_on_interaction()" "create_tr_interaction"

Q @'
CREATE OR REPLACE FUNCTION public.notify_on_log_comment()
RETURNS TRIGGER AS $$
DECLARE
    target_user UUID;
    sender_user TEXT;
    target_film_title TEXT;
BEGIN
    SELECT username INTO sender_user FROM public.profiles WHERE id = NEW.user_id;
    SELECT user_id, film_title INTO target_user, target_film_title FROM public.logs WHERE id = NEW.log_id;

    IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
        INSERT INTO public.notifications (user_id, type, from_username, message)
        VALUES (target_user, 'comment', sender_user, 'added a critique to your log of ' || COALESCE(target_film_title, 'a film'));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
'@ "create_log_comment_func"

Q "DROP TRIGGER IF EXISTS tr_notify_log_comment ON public.log_comments" "drop_tr_log_comment"
Q "CREATE TRIGGER tr_notify_log_comment AFTER INSERT ON public.log_comments FOR EACH ROW EXECUTE FUNCTION public.notify_on_log_comment()" "create_tr_log_comment"

Q @'
CREATE OR REPLACE FUNCTION public.notify_on_list_comment()
RETURNS TRIGGER AS $$
DECLARE
    target_user UUID;
    sender_user TEXT;
BEGIN
    SELECT username INTO sender_user FROM public.profiles WHERE id = NEW.user_id;
    SELECT user_id INTO target_user FROM public.lists WHERE id = NEW.list_id;

    IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
        INSERT INTO public.notifications (user_id, type, from_username, message)
        VALUES (target_user, 'comment', sender_user, 'penned a critique on your curated list ¶');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
'@ "create_list_comment_func"

Q "DROP TRIGGER IF EXISTS tr_notify_list_comment ON public.list_comments" "drop_tr_list_comment"
Q "CREATE TRIGGER tr_notify_list_comment AFTER INSERT ON public.list_comments FOR EACH ROW EXECUTE FUNCTION public.notify_on_list_comment()" "create_tr_list_comment"

Write-Host "=== DONE ==="
