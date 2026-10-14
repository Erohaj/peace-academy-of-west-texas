#!/usr/bin/env bash
# Exercises create-ticket-session against the local stack.
#
# STRIPE_SECRET_KEY is deliberately invalid, which is the point: every call
# gets as far as booking the seat and then fails at Stripe. That is the path
# worth testing hardest -- the seat must come back, every time, or an
# organisation's event fills up with bookings nobody can pay for.
set -u

DB="docker exec -i supabase_db_peace-academy-of-west-texas psql -U postgres -d postgres -tAq"
FN="http://127.0.0.1:54321/functions/v1/create-ticket-session"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

fail=0
check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then
    echo "  ok   $1"
  else
    echo "  FAIL $1: expected [$2], got [$3]"
    fail=1
  fi
}

call() { # call <json body>
  curl -s -X POST "$FN" -H "Authorization: Bearer $ANON" \
    -H "Content-Type: application/json" -d "$1"
}

echo "=== setup ==="
$DB <<'SQL'
delete from public.rsvps where email like '%@fntest.com';
delete from public.events where title in ('FNTEST prepaid', 'FNTEST door fee');
insert into public.events (title, title_es, description, description_es,
  starts_at, location, category, total_spots, fee, payment_required, published)
values ('FNTEST prepaid', 'x', 'x', 'x', now() + interval '20 days',
        'Odessa', 'cooking', 4, 25, true, true),
       ('FNTEST door fee', 'x', 'x', 'x', now() + interval '21 days',
        'Midland', 'cultural', 20, 15, false, true);
SQL
PREPAID=$($DB -c "select id from public.events where title = 'FNTEST prepaid';")
DOORFEE=$($DB -c "select id from public.events where title = 'FNTEST door fee';")
echo "  prepaid event $PREPAID"

echo
echo "=== 1. the seat comes back when Stripe cannot be reached ==="
BEFORE=$($DB -c "select reserved_spots from public.events where id = '$PREPAID';")
BODY=$(call "{\"eventId\":\"$PREPAID\",\"fullName\":\"Rollback Tester\",\"email\":\"rollback@fntest.com\",\"guestCount\":1,\"language\":\"en\"}")
AFTER=$($DB -c "select reserved_spots from public.events where id = '$PREPAID';")
STATUS=$($DB -c "select payment_status from public.rsvps where email = 'rollback@fntest.com';")
check "seats held before the attempt" "0" "$BEFORE"
check "the response says the payment could not start" '{"error":"Could not start the payment"}' "$BODY"
check "the seats were given back" "0" "$AFTER"
check "the booking is marked failed, not left pending" "failed" "$STATUS"

echo
echo "=== 2. an unknown event ==="
BODY=$(call '{"eventId":"11111111-2222-4333-8444-555555555555","fullName":"X","email":"x@fntest.com","guestCount":0,"language":"en"}')
check "event_not_found with its SQLSTATE" '{"error":"event_not_found","code":"PA003"}' "$BODY"

echo
echo "=== 3. an event that is not prepaid ==="
BODY=$(call "{\"eventId\":\"$DOORFEE\",\"fullName\":\"X\",\"email\":\"door@fntest.com\",\"guestCount\":0,\"language\":\"en\"}")
COUNT=$($DB -c "select count(*) from public.rsvps where email = 'door@fntest.com';")
check "refused as payment_not_required" '{"error":"payment_not_required","code":"PA007"}' "$BODY"
check "and no booking was made for it" "0" "$COUNT"

echo
echo "=== 4. input validation, before anything is booked ==="
check "a bad email" '{"error":"A valid email is required"}' \
  "$(call "{\"eventId\":\"$PREPAID\",\"fullName\":\"X\",\"email\":\"not-an-email\",\"guestCount\":0,\"language\":\"en\"}")"
check "an empty name" '{"error":"A name is required"}' \
  "$(call "{\"eventId\":\"$PREPAID\",\"fullName\":\"  \",\"email\":\"ok@fntest.com\",\"guestCount\":0,\"language\":\"en\"}")"
check "too many guests" '{"error":"Invalid guest count"}' \
  "$(call "{\"eventId\":\"$PREPAID\",\"fullName\":\"X\",\"email\":\"ok@fntest.com\",\"guestCount\":99,\"language\":\"en\"}")"
check "a fractional guest count" '{"error":"Invalid guest count"}' \
  "$(call "{\"eventId\":\"$PREPAID\",\"fullName\":\"X\",\"email\":\"ok@fntest.com\",\"guestCount\":1.5,\"language\":\"en\"}")"
check "a malformed event id" '{"error":"Invalid event id"}' \
  "$(call '{"eventId":"not-a-uuid","fullName":"X","email":"ok@fntest.com","guestCount":0,"language":"en"}')"
check "nothing was booked by any of those" "0" \
  "$($DB -c "select count(*) from public.rsvps where email = 'ok@fntest.com';")"

echo
echo "=== 5. a full event ==="
$DB <<SQL
select public.create_rsvp('$PREPAID', 'Filler One', 'filler1@fntest.com', null, 1, 0, null, 'en');
select public.create_rsvp('$PREPAID', 'Filler Two', 'filler2@fntest.com', null, 1, 0, null, 'en');
SQL
RESERVED=$($DB -c "select reserved_spots from public.events where id = '$PREPAID';")
check "the room is full" "4" "$RESERVED"
BODY=$(call "{\"eventId\":\"$PREPAID\",\"fullName\":\"Too Late\",\"email\":\"toolate@fntest.com\",\"guestCount\":0,\"language\":\"en\"}")
check "event_full with its SQLSTATE" '{"error":"event_full","code":"PA001"}' "$BODY"
check "and the count did not move" "4" \
  "$($DB -c "select reserved_spots from public.events where id = '$PREPAID';")"

echo
echo "=== 6. the retry path clears a previous hold ==="
# Free the room, then book twice with one address. The second call must release
# the first hold rather than be refused as a duplicate.
$DB -c "update public.rsvps set payment_status = 'failed', hold_expires_at = null where email in ('filler1@fntest.com','filler2@fntest.com');" >/dev/null
$DB -c "update public.events set reserved_spots = 0 where id = '$PREPAID';" >/dev/null
$DB -c "delete from public.rsvps where email = 'rollback@fntest.com';" >/dev/null

# A pending hold that Stripe never got told about, so it stays pending.
$DB -c "select public.create_rsvp('$PREPAID', 'Retry Tester', 'retry@fntest.com', null, 0, 0, null, 'en');" >/dev/null
check "one seat held" "1" "$($DB -c "select reserved_spots from public.events where id = '$PREPAID';")"
check "the hold is pending" "1" \
  "$($DB -c "select count(*) from public.rsvps where email = 'retry@fntest.com' and payment_status = 'pending';")"

BODY=$(call "{\"eventId\":\"$PREPAID\",\"fullName\":\"Retry Tester\",\"email\":\"retry@fntest.com\",\"guestCount\":0,\"language\":\"en\"}")
check "the retry is not refused as a duplicate" '{"error":"Could not start the payment"}' "$BODY"
check "two rows now: the cleared hold and the new attempt" "2" \
  "$($DB -c "select count(*) from public.rsvps where email = 'retry@fntest.com';")"
check "neither is still holding a seat" "0" \
  "$($DB -c "select reserved_spots from public.events where id = '$PREPAID';")"
check "and none is left pending" "0" \
  "$($DB -c "select count(*) from public.rsvps where email = 'retry@fntest.com' and payment_status = 'pending';")"

echo
echo "=== 7. the method guard ==="
check "GET is refused" '{"error":"Method not allowed"}' \
  "$(curl -s "$FN" -H "Authorization: Bearer $ANON")"

echo
echo "=== cleanup ==="
$DB <<'SQL'
delete from public.rsvps where email like '%@fntest.com';
delete from public.events where title in ('FNTEST prepaid', 'FNTEST door fee');
SQL

echo
if [ "$fail" = "0" ]; then
  echo "ALL EDGE FUNCTION TESTS PASSED"
else
  echo "SOME EDGE FUNCTION TESTS FAILED"
  exit 1
fi
