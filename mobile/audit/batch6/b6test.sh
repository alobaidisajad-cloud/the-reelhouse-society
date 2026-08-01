#!/usr/bin/env bash
export PATH="$HOME/scoop/apps/postgresql/current/bin:$PATH"
cd "$(dirname "$0")"
PORT=55436
ADMIN="psql -p $PORT -U postgres -d postgres"
MIG="C:/Users/OMEN/OneDrive/Desktop/divisionops/reelhouse/mobile/supabase/migrations/20260801_01_tier_enforcement.sql"

FREE=f0000000-0000-0000-0000-000000000001
ARCH=a0000000-0000-0000-0000-000000000001
AUT=e0000000-0000-0000-0000-000000000001
LAPS=10000000-0000-0000-0000-000000000001
FOUND=d0000000-0000-0000-0000-000000000001
OWNER=50000000-0000-0000-0000-000000000001

# Runs as the `authenticated` role, which is what PostgREST uses for a logged-in
# member. Fails LOUDLY on a dead server or a missing object.
act() {
  local uid="$1" sql="$2" out
  out=$(psql -p $PORT -U authenticated -d postgres -tAc \
        "SELECT set_config('req.uid','$uid',false); $sql" 2>&1)
  if printf '%s' "$out" | grep -qiE 'could not connect|Connection refused|does not exist|No function matches'; then
    echo "TEST-BUG"
  elif printf '%s' "$out" | grep -q 'ERROR'; then
    echo "REFUSED"
  else
    echo "ALLOWED"
  fi
}
val() {
  psql -p $PORT -U postgres -d postgres -tAc "$1" 2>&1 | tail -1
}

$ADMIN -q -f b6setup.sql >/dev/null 2>&1
echo "════════ BEFORE — what production does today ════════"
printf "  FREE member publishes an essay      %s\n" "$(act $FREE "INSERT INTO dispatch_dossiers(user_id,title) VALUES ('$FREE','pirate')")"
printf "  FREE member creates a lounge        %s\n" "$(act $FREE "INSERT INTO lounges(creator_id,name) VALUES ('$FREE','pirate')")"
printf "  FREE member joins a lounge          %s\n" "$(act $FREE "SELECT public.join_public_lounge((SELECT id FROM lounges LIMIT 1))")"
printf "  FREE member writes physical archive %s\n" "$(act $FREE "INSERT INTO physical_archive(user_id,film_id,film_title) VALUES ('$FREE',1,'x')")"
$ADMIN -q -c "DELETE FROM dispatch_dossiers; DELETE FROM lounges; DELETE FROM lounge_members; DELETE FROM physical_archive; DELETE FROM logs; DELETE FROM log_private_notes;"
act $FREE "INSERT INTO logs(user_id,film_title,autopsy,is_autopsied,pull_quote) VALUES ('$FREE','Heat','{\"story\":5}','true','stolen')" >/dev/null
printf "  FREE member files an autopsy        %s\n" "$([ "$(val "SELECT count(*) FROM logs WHERE autopsy IS NOT NULL")" = "1" ] && echo 'ALLOWED (autopsy saved)' || echo REFUSED)"
$ADMIN -q -c "DELETE FROM logs; DELETE FROM log_private_notes;"
act $FREE "INSERT INTO logs(user_id,film_title,private_notes) VALUES ('$FREE','Heat','secret')" >/dev/null
printf "  FREE member uses the Vault          %s\n" "$([ "$(val "SELECT count(*) FROM log_private_notes")" = "1" ] && echo 'ALLOWED (note saved)' || echo REFUSED)"

echo ""
echo "════════ applying the migration ════════"
out=$($ADMIN -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if printf '%s' "$out" | grep -q ERROR; then
  printf '%s\n' "$out" | grep ERROR | sed 's/^/  /'; echo "  >>> FAILED — everything below is meaningless"
else
  echo "  applied cleanly"
fi
$ADMIN -q -c "DELETE FROM dispatch_dossiers; DELETE FROM lounges; DELETE FROM lounge_members; DELETE FROM physical_archive; DELETE FROM logs; DELETE FROM log_private_notes;"

echo ""
echo "════════ AFTER · a FREE member — every one must be REFUSED ════════"
printf "  publishes an essay                  %s\n" "$(act $FREE "INSERT INTO dispatch_dossiers(user_id,title) VALUES ('$FREE','pirate')")"
printf "  creates a lounge                    %s\n" "$(act $FREE "INSERT INTO lounges(creator_id,name) VALUES ('$FREE','pirate')")"
printf "  joins a lounge                      %s\n" "$(act $FREE "SELECT public.join_public_lounge((SELECT id FROM lounges LIMIT 1))")"
printf "  writes the physical archive         %s\n" "$(act $FREE "INSERT INTO physical_archive(user_id,film_id,film_title) VALUES ('$FREE',1,'x')")"
$ADMIN -q -c "DELETE FROM logs; DELETE FROM log_private_notes;"
act $FREE "INSERT INTO logs(user_id,film_title,autopsy,is_autopsied,pull_quote,editorial_header,alt_poster) VALUES ('$FREE','Heat','{\"story\":5}',true,'stolen','hdr','/alt.jpg')" >/dev/null
printf "  files an autopsy                    log saved=%s  autopsy=%s  pull_quote=%s  alt_poster=%s\n" \
  "$(val "SELECT count(*) FROM logs")" \
  "$(val "SELECT coalesce(autopsy::text,'NULL') FROM logs LIMIT 1")" \
  "$(val "SELECT coalesce(pull_quote,'NULL') FROM logs LIMIT 1")" \
  "$(val "SELECT coalesce(alt_poster,'NULL') FROM logs LIMIT 1")"
$ADMIN -q -c "DELETE FROM logs; DELETE FROM log_private_notes;"
act $FREE "INSERT INTO logs(user_id,film_title,private_notes) VALUES ('$FREE','Heat','secret')" >/dev/null
printf "  uses the Vault                      log saved=%s  notes stored=%s\n" \
  "$(val "SELECT count(*) FROM logs")" "$(val "SELECT count(*) FROM log_private_notes")"

echo ""
echo "════════ AFTER · PAYING members — every one must still work ════════"
printf "  ARCHIVIST creates a lounge          %s\n" "$(act $ARCH "INSERT INTO lounges(creator_id,name) VALUES ('$ARCH','salon')")"
printf "  ARCHIVIST joins a lounge            %s\n" "$(act $ARCH "SELECT public.join_public_lounge((SELECT id FROM lounges LIMIT 1))")"
printf "  ARCHIVIST writes physical archive   %s\n" "$(act $ARCH "INSERT INTO physical_archive(user_id,film_id,film_title) VALUES ('$ARCH',1,'Alien')")"
$ADMIN -q -c "DELETE FROM logs; DELETE FROM log_private_notes;"
act $ARCH "INSERT INTO logs(user_id,film_title,private_notes,pull_quote) VALUES ('$ARCH','Heat','my note','my quote')" >/dev/null
printf "  ARCHIVIST Vault + editorial         notes=%s  pull_quote=%s\n" \
  "$(val "SELECT count(*) FROM log_private_notes")" "$(val "SELECT coalesce(pull_quote,'NULL') FROM logs LIMIT 1")"
printf "  AUTEUR publishes an essay           %s\n" "$(act $AUT "INSERT INTO dispatch_dossiers(user_id,title) VALUES ('$AUT','my essay')")"
$ADMIN -q -c "DELETE FROM logs; DELETE FROM log_private_notes;"
act $AUT "INSERT INTO logs(user_id,film_title,autopsy,is_autopsied,alt_poster) VALUES ('$AUT','Heat','{\"story\":5}',true,'/alt.jpg')" >/dev/null
printf "  AUTEUR files an autopsy             autopsy=%s  alt_poster=%s\n" \
  "$(val "SELECT coalesce(autopsy::text,'NULL') FROM logs LIMIT 1")" "$(val "SELECT coalesce(alt_poster,'NULL') FROM logs LIMIT 1")"
printf "  FOUNDING member publishes an essay  %s\n" "$(act $FOUND "INSERT INTO dispatch_dossiers(user_id,title) VALUES ('$FOUND','founder essay')")"
printf "  OWNER (deliberately free) essay     %s  <- correct, he is a cinephile\n" "$(act $OWNER "INSERT INTO dispatch_dossiers(user_id,title) VALUES ('$OWNER','x')")"

echo ""
echo "════════ AFTER · a LAPSED member keeps everything they made ════════"
$ADMIN -q -c "DELETE FROM logs; DELETE FROM log_private_notes; DELETE FROM dispatch_dossiers; DELETE FROM lounge_members;"
# while still paying:
act $LAPS "INSERT INTO dispatch_dossiers(user_id,title) VALUES ('$LAPS','paid essay')" >/dev/null
act $LAPS "SELECT public.join_public_lounge((SELECT id FROM lounges LIMIT 1))" >/dev/null
act $LAPS "INSERT INTO logs(user_id,film_title,review,autopsy,is_autopsied,private_notes) VALUES ('$LAPS','Heat','old review','{\"story\":5}',true,'my paid note')" >/dev/null
echo "  created while paying: dossier=$(val "SELECT count(*) FROM dispatch_dossiers WHERE user_id='$LAPS'")  autopsy=$(val "SELECT count(*) FROM logs WHERE autopsy IS NOT NULL")  note=$(val "SELECT count(*) FROM log_private_notes")  lounge=$(val "SELECT count(*) FROM lounge_members WHERE user_id='$LAPS'")"
# subscription ends:
$ADMIN -q -c "UPDATE profiles SET tier=NULL WHERE id='$LAPS';"
echo "  -- subscription now lapsed --"
printf "  edits their own essay               %s\n" "$(act $LAPS "UPDATE dispatch_dossiers SET title='edited' WHERE user_id='$LAPS'")"
printf "  deletes their own essay             %s\n" "$(act $LAPS "DELETE FROM dispatch_dossiers WHERE user_id='$LAPS'")"
printf "  still in their lounge               %s\n" "$([ "$(val "SELECT count(*) FROM lounge_members WHERE user_id='$LAPS'")" = "1" ] && echo YES || echo 'EJECTED — BUG')"
act $LAPS "UPDATE logs SET review='edited review' WHERE user_id='$LAPS'" >/dev/null
printf "  edits a log's text; autopsy kept    autopsy=%s  review=%s\n" \
  "$(val "SELECT coalesce(autopsy::text,'GONE') FROM logs WHERE user_id='$LAPS'")" \
  "$(val "SELECT review FROM logs WHERE user_id='$LAPS'")"
printf "  their old private note survives     %s\n" "$(val "SELECT coalesce(notes,'GONE') FROM log_private_notes")"
printf "  cannot ADD a new autopsy            %s\n" "$(act $LAPS "UPDATE logs SET autopsy='{\"story\":1}' WHERE user_id='$LAPS'" >/dev/null; val "SELECT CASE WHEN autopsy::text LIKE '%5%' THEN 'REVERTED (kept the old one)' ELSE 'CHANGED — BUG' END FROM logs WHERE user_id='$LAPS'")"
printf "  cannot publish a NEW essay          %s\n" "$(act $LAPS "INSERT INTO dispatch_dossiers(user_id,title) VALUES ('$LAPS','new essay')")"

echo ""
echo "════════ AFTER · the host admitting a member must still work ════════"
$ADMIN -q -c "DELETE FROM lounge_members; INSERT INTO lounge_members(lounge_id,user_id,status) VALUES ((SELECT id FROM lounges LIMIT 1),'$ARCH','pending');"
printf "  host approves a pending member      %s\n" "$(act $ARCH "UPDATE lounge_members SET status='approved' WHERE user_id='$ARCH'")"
