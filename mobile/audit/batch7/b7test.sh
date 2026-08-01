#!/usr/bin/env bash
export PATH="$HOME/scoop/apps/postgresql/current/bin:$PATH"
cd "$(dirname "$0")"
PORT=55437
ADMIN="psql -p $PORT -U postgres -d postgres"
MIG="C:/Users/OMEN/OneDrive/Desktop/divisionops/reelhouse/mobile/supabase/migrations/20260801_02_ban_and_suspension.sql"

BAN=b0000000-0000-0000-0000-000000000001
SUS=50000000-0000-0000-0000-000000000001
OK=c0000000-0000-0000-0000-000000000001
EXP=e0000000-0000-0000-0000-000000000001
LOUNGE=aaaaaaaa-0000-0000-0000-000000000001

act() {
  local uid="$1" sql="$2" out
  out=$(psql -p $PORT -U authenticated -d postgres -tAc \
        "SELECT set_config('req.uid','$uid',false); $sql" 2>&1)
  if printf '%s' "$out" | grep -qiE 'could not connect|Connection refused|does not exist|No function matches|column .* does not exist'; then
    echo "TEST-BUG"
  elif printf '%s' "$out" | grep -q 'ERROR'; then
    echo "REFUSED"
  else
    echo "ALLOWED"
  fi
}
val() { psql -p $PORT -U postgres -d postgres -tAc "$1" 2>&1 | tail -1; }
row() { printf "  %-42s %s\n" "$1" "$2"; }

suite() {   # $1 = label of the actor, $2 = uid
  local u="$2"
  row "post a log"                 "$(act $u "INSERT INTO logs(user_id,film_title) VALUES ('$u','New')")"
  row "write the physical archive" "$(act $u "INSERT INTO physical_archive(user_id,film_id,film_title) VALUES ('$u',1,'Alien')")"
  row "certify a dossier (RPC)"    "$(act $u "SELECT public.toggle_dossier_certify(gen_random_uuid())")"
  row "react to a message"         "$(act $u "INSERT INTO lounge_message_reactions(lounge_id,user_id,emoji) VALUES ('$LOUNGE','$u','x')")"
  row "create a programme"         "$(act $u "INSERT INTO programmes(user_id,title) VALUES ('$u','p')")"
  row "EDIT an existing list"      "$(act $u "UPDATE lists SET title='ABUSE' WHERE user_id='$u'")"
  row "change their username"      "$(act $u "UPDATE profiles SET username='ABUSE' WHERE id='$u'")"
  printf "  %-42s %s\n" "   -> username now" "$(val "SELECT username FROM profiles WHERE id='$u'")"
}

$ADMIN -q -f b7setup.sql >/dev/null 2>&1
echo "════════ BEFORE — a BANNED member ════════"
suite banned $BAN
echo ""
echo "════════ BEFORE — a SUSPENDED member (Tribunal said 'restricted') ════════"
suite suspended $SUS

echo ""
echo "════════ applying the migration ════════"
out=$($ADMIN -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if printf '%s' "$out" | grep -q ERROR; then
  printf '%s\n' "$out" | grep ERROR | sed 's/^/  /'; echo "  >>> FAILED — everything below is meaningless"
else
  echo "  applied cleanly"
fi
$ADMIN -q -f b7setup.sql >/dev/null 2>&1
$ADMIN -q -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1

echo ""
echo "════════ AFTER — a BANNED member (all must be REFUSED / unchanged) ════════"
suite banned $BAN
echo ""
echo "════════ AFTER — a SUSPENDED member (was totally unrestricted before) ════════"
suite suspended $SUS

echo ""
echo "════════ AFTER — things a restricted member MUST still be able to do ════════"
row "block someone (self-protection)" "$(act $BAN "INSERT INTO user_blocks(blocker_id,blocked_id) VALUES ('$BAN','$OK')")"
row "report abuse / appeal"           "$(act $BAN "INSERT INTO reports(reporter_id,target_user_id,reason) VALUES ('$BAN','$OK','x')")"
row "delete their own log"            "$(act $BAN "DELETE FROM logs WHERE user_id='$BAN'")"
row "LEAVE a lounge (counter trap)"   "$(act $BAN "DELETE FROM lounge_members WHERE user_id='$BAN' AND lounge_id='$LOUNGE'")"
printf "  %-42s %s\n" "   -> lounge member_count updated to" "$(val "SELECT member_count FROM lounges WHERE id='$LOUNGE'")"
row "change their own preferences"    "$(act $BAN "UPDATE profiles SET preferences='{\"notif_system\":false}' WHERE id='$BAN'")"
printf "  %-42s %s\n" "   -> preferences applied" "$(val "SELECT preferences::text FROM profiles WHERE id='$BAN'")"

echo ""
echo "════════ AFTER — an UNRESTRICTED member must be untouched ════════"
suite clean $OK
echo ""
echo "════════ AFTER — an EXPIRED suspension must free the member ════════"
suite expired $EXP

echo ""
echo "════════ AFTER — the moderator can still issue a ban ════════"
row "moderator bans someone"        "$(act $OK "UPDATE profiles SET is_banned=true, banned_at=now() WHERE id='$EXP'")"
printf "  %-42s %s\n" "   -> target is_banned now" "$(val "SELECT is_banned FROM profiles WHERE id='$EXP'")"

echo ""
echo "════════ AFTER — nobody edits their own moderation record ════════"
row "banned member unbans self"        "$(act $BAN "UPDATE profiles SET is_banned=false WHERE id='$BAN'")"
printf "  %-42s %s  (must be t)\n" "   -> still banned?" "$(val "SELECT is_banned FROM profiles WHERE id='$BAN'")"
row "suspended member clears own suspension" "$(act $SUS "UPDATE profiles SET suspended_until=NULL WHERE id='$SUS'")"
printf "  %-42s %s  (must still be set)\n" "   -> suspension still set?" "$(val "SELECT suspended_until IS NOT NULL FROM profiles WHERE id='$SUS'")"
row "clean member clears own warnings"  "$(act $OK "UPDATE profiles SET warning_count=0 WHERE id='$OK'")"
printf "  %-42s %s  (must stay 3)\n" "   -> warning_count" "$(val "SELECT warning_count FROM profiles WHERE id='$OK'")"
row "clean member edits own bio"        "$(act $OK "UPDATE profiles SET bio='hello' WHERE id='$OK'")"
printf "  %-42s %s  (must be hello)\n" "   -> bio" "$(val "SELECT bio FROM profiles WHERE id='$OK'")"
