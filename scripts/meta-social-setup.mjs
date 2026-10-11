#!/usr/bin/env node
// One-time helper for turning on the social feed.
//
// fetch-social-posts.mjs needs three repository secrets — FB_PAGE_ACCESS_TOKEN,
// FB_PAGE_ID and IG_USER_ID — and getting them by hand means four separate
// calls through Meta's Graph API Explorer, copying opaque numbers between them.
// This does the same thing in one command, and checks the answers against what
// the site already claims about itself.
//
// Needs Node 22.6+ (tested on 24) because it imports orgLinks.ts directly and
// relies on Node's own type stripping. The workflow's Node 20 cannot do that --
// which is fine, this is a one-time local command, not part of the schedule.
//
// Usage (PowerShell), the short way -- no Facebook password anywhere:
//
//   $env:META_USER_TOKEN="<token extended in the Access Token Debugger>"
//   node scripts/meta-social-setup.mjs
//
// Or let this do the extending, which costs one password prompt to reveal the
// secret on Settings -> Basic:
//
//   $env:META_APP_ID="..."; $env:META_APP_SECRET="..."; $env:META_USER_TOKEN="..."
//   node scripts/meta-social-setup.mjs
//
// Either way the token is read from the environment and never written anywhere:
// this prints what to paste into GitHub's secret form and nothing else. Do not
// commit the output and do not paste the Page token into a chat window -- a
// Page token derived from a long-lived User token does not expire, so a leaked
// one stays useful to whoever finds it until it is revoked by hand.

import { readFileSync } from 'node:fs';

import { ORG_LINKS } from '../src/data/orgLinks.ts';

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v26.0';
const API = `https://graph.facebook.com/${GRAPH_VERSION}`;

const { META_APP_ID, META_APP_SECRET } = process.env;

/**
 * The token, from the environment or from a file beside the project.
 *
 * Meta's Access Token Debugger prints a long-lived token wrapped across three
 * lines, and copying it takes the line breaks along. In cmd.exe a pasted line
 * break ends the `set` command, so only the first third of the token reaches
 * the script -- which Meta rejects as "Cannot parse access token (code 190)",
 * an error that sounds like the token is wrong rather than truncated.
 *
 * Reading from a file sidesteps that: a text editor shows the breaks, and the
 * whitespace strip below removes them wherever they came from. It also keeps a
 * credential out of the shell history.
 */
function readToken() {
  const fromEnv = process.env.META_USER_TOKEN;
  if (fromEnv) return fromEnv.replace(/\s+/g, '');

  try {
    return readFileSync(new URL('../.meta-token', import.meta.url), 'utf-8').replace(/\s+/g, '');
  } catch {
    return '';
  }
}

const META_USER_TOKEN = readToken();

// META_APP_SECRET is optional, and leaving it out is the gentler path: showing
// it on the app's Basic settings page demands the Facebook password, and the
// only thing it buys is performing the long-lived exchange here. Meta will do
// that exchange itself, via the "Extend Access Token" button at the bottom of
// the Access Token Debugger, which needs no password and hands back a token
// already good for sixty days. Supply a token extended that way and this skips
// straight to finding the Page.
const hasAppCredentials = Boolean(META_APP_ID && META_APP_SECRET);

if (!META_USER_TOKEN) {
  console.error(`No token found. Two steps, both at developers.facebook.com:

  1. Graph API Explorer -- generate a User token carrying pages_show_list
     and pages_read_engagement (plus instagram_basic if your app offers it).
  2. Access Token Debugger -- paste it in, press Debug, then "Extend Access
     Token" at the bottom. The token it hands back is the one to use; without
     this step the Page token expires within the hour.

Then save that token into a file named .meta-token in the project root and run
this again. Line breaks in it do not matter -- they are stripped, which is the
point: the Debugger prints the token across three lines, and in cmd.exe a
pasted line break silently truncates it into something Meta rejects as
"Cannot parse access token".

(META_USER_TOKEN in the environment still works, and takes precedence.)`);
  process.exit(1);
}

/** The handles the site publishes, which the chosen Page has to match. */
const expectedFacebook = ORG_LINKS.facebook.replace(/^https?:\/\/(www\.)?facebook\.com\//, '').replace(/\/$/, '');
const expectedInstagram = ORG_LINKS.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');

async function graph(path, params = {}) {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || body.error) {
    const e = body.error || {};
    throw new Error(
      `${e.message || res.statusText}` +
        (e.code ? ` (code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ''})` : '')
    );
  }
  return body;
}

function heading(text) {
  console.log(`\n${text}\n${'-'.repeat(text.length)}`);
}

async function main() {
  heading('1. The User token');

  // A Page token inherits its lifetime from the User token it came from. Taken
  // from the short-lived token straight out of the Explorer it dies in about an
  // hour, and the feed would stop refreshing the same day it was turned on --
  // with the workflow still green, because a rejected token is a failure inside
  // the run, not of the run. Something has to perform the long-lived exchange:
  // either this script with the app secret, or Meta's own "Extend Access Token"
  // button beforehand. Step 4 checks which of the two actually happened rather
  // than trusting that one did.
  let userToken = META_USER_TOKEN;

  if (hasAppCredentials) {
    const longLived = await graph('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      fb_exchange_token: META_USER_TOKEN
    });
    userToken = longLived.access_token;
    console.log(`Exchanged for a long-lived token, good for ~${Math.round((longLived.expires_in || 0) / 86400)} days.`);
  } else {
    console.log('No app secret given, so using the token exactly as supplied.');
    console.log('It must already have been extended, or the Page token expires within the hour.');
  }

  console.log('(That is the User token. The Page token below is the one that should never expire.)');

  heading('2. Pages this account manages');

  const pages = await graph('me/accounts', {
    access_token: userToken,
    fields: 'id,name,username,access_token,tasks'
  });

  const list = pages.data || [];
  if (list.length === 0) {
    console.error(
      'No Pages returned. Either the token is missing pages_show_list, or this\n' +
        'account does not manage any Page.'
    );
    process.exit(1);
  }

  for (const p of list) {
    console.log(`  ${p.name}  id=${p.id}  username=${p.username ?? '(none)'}  tasks=${(p.tasks || []).join(',')}`);
  }

  // Choosing by handle rather than by "the first one" is the whole reason this
  // check exists: an account that manages several Pages would otherwise wire the
  // feed to whichever Meta happened to return first, and the posts would be real
  // while the byline under them belonged to someone else.
  const page = list.find((p) => (p.username || '').toLowerCase() === expectedFacebook.toLowerCase());

  if (!page) {
    console.error(
      `\nNone of these Pages has the username "${expectedFacebook}", which is what\n` +
        `src/data/orgLinks.ts publishes as the organisation's Facebook page\n` +
        `(${ORG_LINKS.facebook}).\n\n` +
        'Stopping rather than guessing. If the real Page is one of the above,\n' +
        'orgLinks.ts is what needs correcting -- it is the source of truth for\n' +
        'every channel link on the site, so changing it here would leave the\n' +
        'footer pointing somewhere else.'
    );
    process.exit(1);
  }

  if (!(page.tasks || []).includes('ANALYZE')) {
    console.warn(
      `\nWarning: this account does not hold the ANALYZE task on "${page.name}".\n` +
        'Reading the Page\'s own posts requires it, so the feed may come back empty.'
    );
  }

  heading('3. Instagram account linked to that Page');

  let igId = '';
  try {
    const linked = await graph(page.id, {
      access_token: page.access_token,
      fields: 'instagram_business_account{id,username}'
    });
    const ig = linked.instagram_business_account;

    if (!ig) {
      console.log(
        'No Instagram Business account is linked to this Page.\n\n' +
          'Instagram posts need the account to be a Business or Creator account\n' +
          'AND linked to this Page. A personal account cannot be read by the API\n' +
          'at all. Convert it in the Instagram app (Settings -> Account type and\n' +
          'tools), link it under the Page\'s Linked accounts, then run this again.\n\n' +
          'Facebook posts will work without this; the feed simply shows no\n' +
          'Instagram ones.'
      );
    } else if (ig.username.toLowerCase() !== expectedInstagram.toLowerCase()) {
      console.error(
        `\nThe linked Instagram account is @${ig.username}, but the site publishes\n` +
          `@${expectedInstagram} (${ORG_LINKS.instagram}). Not using it: the posts\n` +
          'would be real and the handle shown under them would not.'
      );
    } else {
      igId = ig.id;
      console.log(`@${ig.username}  id=${ig.id}`);
    }
  } catch (error) {
    console.log(`Could not read the linked Instagram account: ${error.message}`);
    console.log('Facebook posts will still work. IG_USER_ID can be added later.');
  }

  heading('4. Confirming the Page token really is permanent');

  // Printing "this does not expire" without checking would be a claim rather
  // than a fact, and it is the one property the whole schedule depends on.
  try {
    const debug = await graph('debug_token', {
      input_token: page.access_token,
      // An app token proves it outright; failing that, an app admin's own User
      // token may inspect tokens issued by the same app, which is enough here.
      access_token: hasAppCredentials ? `${META_APP_ID}|${META_APP_SECRET}` : userToken
    });
    const d = debug.data || {};
    console.log(`type=${d.type}  expires_at=${d.expires_at === 0 ? 'never' : new Date((d.expires_at || 0) * 1000).toISOString()}`);
    console.log(`scopes: ${(d.scopes || []).join(', ') || '(none reported)'}`);
    if (d.expires_at !== 0) {
      console.warn(`STOP: this Page token HAS an expiry, so the long-lived exchange
never happened. Used as it is, the feed stops refreshing when the token lapses,
and the workflow goes on reporting success while it does.

Extend the User token first -- Access Token Debugger, "Extend Access Token" at
the bottom -- then run this again with the result.`);
    }
  } catch (error) {
    console.log(`Could not inspect the token: ${error.message}`);
  }

  heading('5. Paste these into GitHub repository secrets');

  console.log('Settings -> Secrets and variables -> Actions -> New repository secret\n');
  console.log(`FB_PAGE_ID            ${page.id}`);
  console.log(`IG_USER_ID            ${igId || '(skip -- no linked Instagram Business account yet)'}`);
  console.log(`FB_PAGE_ACCESS_TOKEN  ${page.access_token}`);
  console.log(
    '\nThe token above is a credential that does not expire. Paste it into the\n' +
      'secret form, then clear your terminal. Do not commit it and do not send it\n' +
      'to anyone, including in a chat window.'
  );
}

main().catch((error) => {
  console.error(`
Failed: ${error.message}`);
  // Not process.exit(): on Windows, exiting while a fetch is still unwinding
  // trips a libuv assertion, so a crash dump lands underneath a message that
  // had just explained the problem in plain words.
  process.exitCode = 1;
});
