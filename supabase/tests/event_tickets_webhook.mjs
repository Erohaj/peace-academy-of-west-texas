// Drives stripe-webhook with properly signed synthetic events.
//
// Stripe's signature is an HMAC-SHA256 over "<timestamp>.<raw body>" keyed with
// the endpoint secret, and the local runtime is running with a secret this
// script knows -- so the events below are signed exactly as Stripe signs its
// own, and `constructEventAsync` inside the function accepts or rejects them on
// the real rule rather than a stub.
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const SECRET = 'whsec_deliberatelyInvalidForLocalTesting';
const ENDPOINT = 'http://127.0.0.1:54321/functions/v1/stripe-webhook';

const sql = (text) =>
  execFileSync(
    'docker',
    ['exec', '-i', 'supabase_db_peace-academy-of-west-texas',
     'psql', '-U', 'postgres', '-d', 'postgres', '-tAq', '-c', text],
    { encoding: 'utf8' }
  ).trim();

function sign(body, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac('sha256', secret)
    .update(timestamp + '.' + body)
    .digest('hex');
  return 't=' + timestamp + ',v1=' + signature;
}

async function send(event, options = {}) {
  const body = JSON.stringify(event);
  const headers = { 'Content-Type': 'application/json' };

  if (options.header === null) {
    // no signature header at all
  } else if (options.header) {
    headers['stripe-signature'] = options.header;
  } else {
    headers['stripe-signature'] = sign(body, options.secret ?? SECRET);
  }

  const response = await fetch(ENDPOINT, { method: 'POST', headers, body });
  return { status: response.status, text: (await response.text()).slice(0, 120) };
}

let failures = 0;
const check = (label, expected, actual) => {
  if (String(expected) === String(actual)) {
    console.log('  ok   ' + label);
  } else {
    console.log('  FAIL ' + label + ': expected [' + expected + '], got [' + actual + ']');
    failures += 1;
  }
};

console.log('=== setup ===');
sql("delete from public.rsvps where email like '%@whtest.com'");
sql("delete from public.events where title = 'WHTEST prepaid'");
sql(`insert into public.events (title, title_es, description, description_es,
       starts_at, location, category, total_spots, fee, payment_required, published)
     values ('WHTEST prepaid', 'x', 'x', 'x', now() + interval '25 days',
             'Odessa', 'cooking', 6, 30, true, true)`);

const eventId = sql("select id from public.events where title = 'WHTEST prepaid'");

const book = (email, guests) => {
  sql(`select public.create_rsvp('${eventId}', 'WH Tester', '${email}', null, ${guests}, 0, null, 'en')`);
  const id = sql(`select id from public.rsvps where email = '${email}'`);
  const session = 'cs_test_wh_' + randomUUID().replace(/-/g, '');
  sql(`update public.rsvps set stripe_session_id = '${session}' where id = '${id}'`);
  return { id, session };
};

const status = (id) => sql(`select payment_status from public.rsvps where id = '${id}'`);
const reserved = () => Number(sql(`select reserved_spots from public.events where id = '${eventId}'`));

const ticketSession = (rsvp, extra) => ({
  id: 'evt_' + randomUUID(),
  object: 'event',
  type: 'checkout.session.completed',
  data: {
    object: Object.assign({
      id: rsvp.session,
      object: 'checkout.session',
      payment_status: 'paid',
      payment_intent: 'pi_test_' + rsvp.id.slice(0, 8),
      metadata: {
        kind: 'event_ticket',
        rsvp_id: rsvp.id,
        event_id: eventId,
        seats: '1'
      }
    }, extra || {})
  }
});

console.log('\n=== 1. the signature is what authenticates Stripe ===');
const victim = book('sig@whtest.com', 0);

let res = await send(ticketSession(victim), { secret: 'whsec_the_wrong_secret' });
check('a wrongly signed event is refused', 400, res.status);
check('and the booking was not touched', 'pending', status(victim.id));

res = await send(ticketSession(victim), { header: null });
check('an unsigned event is refused', 400, res.status);
check('still untouched', 'pending', status(victim.id));

const stale = ticketSession(victim);
res = await send(stale, {
  header: sign(JSON.stringify(stale), SECRET, Math.floor(Date.now() / 1000) - 7200)
});
check('a two-hour-old signature is refused', 400, res.status);
check('still untouched', 'pending', status(victim.id));

console.log('\n=== 2. checkout.session.completed confirms the seat ===');
const before = reserved();
res = await send(ticketSession(victim));
check('accepted', 200, res.status);
check('the booking is paid', 'paid', status(victim.id));
check('the seat count did not move', before, reserved());
check('the payment intent was recorded',
  'pi_test_' + victim.id.slice(0, 8),
  sql(`select stripe_payment_intent from public.rsvps where id = '${victim.id}'`));
check('recorded as a card payment', 'card',
  sql(`select payment_method from public.rsvps where id = '${victim.id}'`));
check('no deadline left on it', '',
  sql(`select coalesce(hold_expires_at::text, '') from public.rsvps where id = '${victim.id}'`));

res = await send(ticketSession(victim));
check('a duplicate delivery is accepted', 200, res.status);
check('and changes nothing', before, reserved());

console.log('\n=== 3. a session that completed without the money ===');
const unpaid = book('unpaid@whtest.com', 0);
const held = reserved();
res = await send(ticketSession(unpaid, { payment_status: 'unpaid' }));
check('accepted', 200, res.status);
check('the booking stays pending, keeping its seat', 'pending', status(unpaid.id));
check('the seat is still held', held, reserved());

console.log('\n=== 4. checkout.session.expired releases the seat ===');
const abandoned = book('abandoned@whtest.com', 1);
const withHold = reserved();
const expiredEvent = {
  id: 'evt_' + randomUUID(),
  object: 'event',
  type: 'checkout.session.expired',
  data: {
    object: {
      id: abandoned.session,
      object: 'checkout.session',
      metadata: { kind: 'event_ticket', rsvp_id: abandoned.id, event_id: eventId }
    }
  }
};
res = await send(expiredEvent);
check('accepted', 200, res.status);
check('the booking is failed', 'failed', status(abandoned.id));
check('both seats came back', withHold - 2, reserved());

res = await send(expiredEvent);
check('a duplicate expiry is accepted', 200, res.status);
check('and does not release the seats twice', withHold - 2, reserved());

console.log('\n=== 5. charge.refunded frees the seat ===');
const beforeRefund = reserved();
const refundEvent = (intent) => ({
  id: 'evt_' + randomUUID(),
  object: 'event',
  type: 'charge.refunded',
  data: { object: { id: 'ch_' + randomUUID(), object: 'charge', payment_intent: intent } }
});

res = await send(refundEvent('pi_test_' + victim.id.slice(0, 8)));
check('accepted', 200, res.status);
check('the booking is refunded', 'refunded', status(victim.id));
check('its seat came back', beforeRefund - 1, reserved());

res = await send(refundEvent('pi_test_' + victim.id.slice(0, 8)));
check('a duplicate refund is accepted', 200, res.status);
check('and does not release the seat twice', beforeRefund - 1, reserved());

console.log('\n=== 6. a donation session still goes down the donation path ===');
const donationSession = 'cs_test_don_' + randomUUID().replace(/-/g, '');
sql(`insert into public.donations (stripe_session_id, amount_cents, frequency, status)
     values ('${donationSession}', 4200, 'one_time', 'pending')`);

res = await send({
  id: 'evt_' + randomUUID(),
  object: 'event',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: donationSession,
      object: 'checkout.session',
      payment_status: 'paid',
      payment_intent: 'pi_test_donation_path',
      metadata: { donor_name: 'Test Donor', frequency: 'one_time' },
      customer_details: { email: null, name: 'Test Donor' }
    }
  }
});
check('accepted', 200, res.status);
check('the donation is paid', 'paid',
  sql(`select status from public.donations where stripe_session_id = '${donationSession}'`));
check('and no booking was invented for it', '0',
  sql(`select count(*) from public.rsvps where stripe_session_id = '${donationSession}'`));

console.log('\n=== 7. a ticket event with no rsvp_id in it ===');
const orphan = ticketSession({ id: randomUUID(), session: 'cs_test_orphan_abcdefghij' });
delete orphan.data.object.metadata.rsvp_id;
res = await send(orphan);
check('accepted rather than retried forever', 200, res.status);

console.log('\n=== cleanup ===');
sql("delete from public.rsvps where email like '%@whtest.com'");
sql("delete from public.events where title = 'WHTEST prepaid'");
sql("delete from public.donations where stripe_session_id like 'cs_test_don_%'");

console.log('');
if (failures === 0) {
  console.log('ALL WEBHOOK TESTS PASSED');
} else {
  console.log(failures + ' WEBHOOK TEST(S) FAILED');
  process.exitCode = 1;
}
