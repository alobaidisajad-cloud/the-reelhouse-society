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

# Runs as `authenticated`, the role PostgREST uses for a logged-in member.
# Scans the WHOLE output and fails LOUDLY on a dead server or missing object —
# an earlier version used `tail -1` and reported missing functions as ALLOWED.
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
val() { psql -p $PORT -U postgres -d postgres -tAc "$1" 2>&1 | tail -1; }
wipe() { $ADMIN -q -c "DELETE FROM dispatch_dossiers; DELETE FROM lounge_members; DELETE FROM lounges; DELETE FROM physical_archive; DELETE FROM logs; DELETE FROM log_private_notes;"; }
row()  { printf "  %-38s %s\n" "$1" "$2"; }

$ADMIN -q -f b6setup.sql >/dev/null 2>&1
wipe
echo "════════ BEFORE — what production does today ════════"
row "publishes an essay"               "$(act $FREE "INSERT INTO dispatch_dossiers(user_id,title) VALUES ('$FREE','pirate')")"
row "creates a lounge via the RPC"     "$(act $FREE "SELECT public.create_lounge('pirate')")"
row "creates a lounge via direct REST" "$(act $FREE "INSERT INTO lounges(creator_id,name) VALUES ('$FREE','pirate2')")"
row "joins a lounge (RPC)"             "$(act $FREE "SELECT public.join_public_lounge((SELECT id FROM lounges LIMIT 1))")"
row "writes the physical archive"      "$(act $FREE "INSERT INTO physical_archive(user_id,film_id,film_title) VALUES ('$FREE',1,'x')")"
wipe
act $FREE "INSERT INTO logs(user_id,film_title,autopsy,is_autopsied,pull_quote) VALUES ('$FREE','Heat','{\"story\":5}',true,'stolen')" >/dev/null
row "files an autopsy"                 "$([ "$(val "SELECT count(*) FROM logs WHERE autopsy IS NOT NULL")" = "1" ] && echo 'ALLOWED (autopsy saved)' || echo REFUSED)"
wipe
act $FREE "INSERT INTO logs(user_id,film_title,private_notes) VALUES ('$FREE','Heat','secret')" >/dev/null
row "uses the Vault"                   "$([ "$(val "SELECT count(*) FROM log_private_notes")" = "1" ] && echo 'ALLOWED (note saved)' || echo REFUSED)"
row "writes a private note DIRECTLY (REST)" "$(act $FREE "INSERT INTO log_private_notes(log_id,user_id,notes) VALUES (gen_random_uuid(),'$FREE','direct')")"

echo ""
echo "════════ applying the migration ════════"
out=$($ADMIN -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if printf '%s' "$out" | grep -q ERROR; then
  printf '%s\n' "$out" | grep ERROR | sed 's/^/  /'; echo "  >>> FAILED — everything below is meaningless"
else
  echo "  applied cleanly"
fi
wipe

echo ""
echo "════════ AFTER · a FREE member — every one must be REFUSED ════════"
row "publishes an essay"               "$(act $FREE "INSERT INTO dispatch_dossiers(user_id,title) VALUES ('$FREE','pirate')")"
row "creates a lounge via the RPC"     "$(act $FREE "SELECT public.create_lounge('pirate')")"
row "creates a lounge via direct REST" "$(act $FREE "INSERT INTO lounges(creator_id,name) VALUES ('$FREE','pirate2')")"
$ADMIN -q -c "INSERT INTO lounges(id,creator_id,name) VALUES ('cccccccc-0000-0000-0000-000000000001','$ARCH','host lounge');"
row "joins a lounge (RPC)"             "$(act $FREE "SELECT public.join_public_lounge('cccccccc-0000-0000-0000-000000000001')")"
row "writes the physical archive"      "$(act $FREE "INSERT INTO physical_archive(user_id,film_id,film_title) VALUES ('$FREE',1,'x')")"
$ADMIN -q -c "DELETE FROM logs; DELETE FROM log_private_notes;"
act $FREE "INSERT INTO logs(user_id,film_title,autopsy,is_autopsied,pull_quote,editorial_header,alt_poster,drop_cap) VALUES ('$FREE','Heat','{\"story\":5}',true,'stolen','hdr','/alt.jpg',true)" >/dev/null
printf "  %-38s saved=%s autopsy=%s quote=%s poster=%s dropcap=%s\n" "files an autopsy / editorial" \
  "$(val "SELECT count(*) FROM logs")" "$(val "SELECT coalesce(autopsy::text,'NULL') FROM logs LIMIT 1")" \
  "$(val "SELECT coalesce(pull_quote,'NULL') FROM logs LIMIT 1")" \
  "$(val "SELECT coalesce(alt_poster,'NULL') FROM logs LIMIT 1")" \
  "$(val "SELECT drop_cap FROM logs LIMIT 1")"
$ADMIN -q -c "DELETE FROM logs; DELETE FROM log_private_notes;"
act $FREE "INSERT INTO logs(user_id,film_title,private_notes) VALUES ('$FREE','Heat','secret')" >/dev/null
printf "  %-38s log saved=%s  notes stored=%s\n" "uses the Vault" "$(val "SELECT count(*) FROM logs")" "$(val "SELECT count(*) FROM log_private_notes")"
row "writes a private note DIRECTLY (REST)" "$(act $FREE "INSERT INTO log_private_notes(log_id,user_id,notes) VALUES (gen_random_uuid(),'$FREE','direct')")"

echo ""
echo "════════ AFTER · PAYING members — every one must still work ════════"
wipe
row "ARCHIVIST creates a lounge (RPC)"  "$(act $ARCH "SELECT public.create_lounge('salon')")"
row "ARCHIVIST joins a lounge (RPC)"    "$(act $ARCH "SELECT public.join_public_lounge((SELECT id FROM lounges LIMIT 1))")"
row "ARCHIVIST writes physical archive" "$(act $ARCH "INSERT INTO physical_archive(user_id,film_id,film_title) VALUES ('$ARCH',1,'Alien')")"
$ADMIN -q -c "DELETE FROM logs; DELETE FROM log_private_notes;"
act $ARCH "INSERT INTO logs(user_id,film_title,private_notes,pull_quote,drop_cap) VALUES ('$ARCH','Heat','my note','my quote',true)" >/dev/null
printf "  %-38s notes=%s quote=%s dropcap=%s\n" "ARCHIVIST Vault + editorial" \
  "$(val "SELECT count(*) FROM log_private_notes")" "$(val "SELECT coalesce(pull_quote,'NULL') FROM logs LIMIT 1")" "$(val "SELECT drop_cap FROM logs LIMIT 1")"
row "AUTEUR publishes an essay"         "$(act $AUT "INSERT INTO dispatch_dossiers(user_id,title) VALUES ('$AUT','my essay')")"
$ADMIN -q -c "DELETE FROM logs; DELETE FROM log_private_notes;"
act $AUT "INSERT INTO logs(user_id,film_title,autopsy,is_autopsied,alt_poster) VALUES ('$AUT','Heat','{\"story\":5}',true,'/alt.jpg')" >/dev/null
printf "  %-38s autopsy=%s poster=%s\n" "AUTEUR files an autopsy" \
  "$(val "SELECT coalesce(autopsy::text,'NULL') FROM logs LIMIT 1")" "$(val "SELECT coalesce(alt_poster,'NULL') FROM logs LIMIT 1")"
row "FOUNDING member publishes an essay" "$(act $FOUND "INSERT INTO dispatch_dossiers(user_id,title) VALUES ('$FOUND','founder essay')")"
row "OWNER (deliberately free) essay"    "$(act $OWNER "INSERT INTO dispatch_dossiers(user_id,title) VALUES ('$OWNER','x')") <- correct, cinephile"

echo ""
echo "════════ AFTER · a LAPSED member keeps everything they made ════════"
wipe
$ADMIN -q -c "UPDATE profiles SET tier='auteur' WHERE id='$LAPS';"
act $LAPS "SELECT public.create_lounge('lapsy lounge')" >/dev/null
act $LAPS "INSERT INTO dispatch_dossiers(user_id,title) VALUES ('$LAPS','paid essay')" >/dev/null
act $LAPS "INSERT INTO logs(user_id,film_title,review,autopsy,is_autopsied,private_notes) VALUES ('$LAPS','Heat','old review','{\"story\":5}',true,'my paid note')" >/dev/null
echo "  created while paying: dossier=$(val "SELECT count(*) FROM dispatch_dossiers WHERE user_id='$LAPS'")  autopsy=$(val "SELECT count(*) FROM logs WHERE autopsy IS NOT NULL")  note=$(val "SELECT count(*) FROM log_private_notes")  lounge=$(val "SELECT count(*) FROM lounge_members WHERE user_id='$LAPS'")"
$ADMIN -q -c "UPDATE profiles SET tier=NULL WHERE id='$LAPS';"
echo "  -- subscription now lapsed --"
row "edits their own essay"             "$(act $LAPS "UPDATE dispatch_dossiers SET title='edited' WHERE user_id='$LAPS'")"
row "deletes their own essay"           "$(act $LAPS "DELETE FROM dispatch_dossiers WHERE user_id='$LAPS'")"
row "still in their lounge"             "$([ "$(val "SELECT count(*) FROM lounge_members WHERE user_id='$LAPS'")" = "1" ] && echo YES || echo 'EJECTED — BUG')"
act $LAPS "UPDATE logs SET review='edited review' WHERE user_id='$LAPS'" >/dev/null
printf "  %-38s autopsy=%s  review=%s\n" "edits a log's text; autopsy kept" \
  "$(val "SELECT coalesce(autopsy::text,'GONE') FROM logs WHERE user_id='$LAPS'")" "$(val "SELECT review FROM logs WHERE user_id='$LAPS'")"
row "their old private note survives"   "$(val "SELECT coalesce(notes,'GONE') FROM log_private_notes")"
act $LAPS "UPDATE logs SET autopsy='{\"story\":1}' WHERE user_id='$LAPS'" >/dev/null
row "cannot ADD a new autopsy"          "$(val "SELECT CASE WHEN autopsy::text LIKE '%5%' THEN 'REVERTED (kept the old one)' ELSE 'CHANGED — BUG' END FROM logs WHERE user_id='$LAPS'")"
row "cannot publish a NEW essay"        "$(act $LAPS "INSERT INTO dispatch_dossiers(user_id,title) VALUES ('$LAPS','new essay')")"
row "cannot create a NEW lounge"        "$(act $LAPS "SELECT public.create_lounge('new lounge')")"

echo ""
echo "════════ AFTER · the host admitting a member must still work ════════"
$ADMIN -q -c "DELETE FROM lounge_members; INSERT INTO lounge_members(lounge_id,user_id,status) VALUES ((SELECT id FROM lounges LIMIT 1),'$ARCH','pending');"
row "host approves a pending member"    "$(act $ARCH "UPDATE lounge_members SET status='approved' WHERE user_id='$ARCH'")"
