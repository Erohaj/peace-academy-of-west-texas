import { PAWTXEvent } from '../types';

/**
 * Passing one event on to somebody else.
 *
 * The site is a single page with no router, so until now every address led to
 * the same place: a link shared from an event opened the home tab and left the
 * recipient to find the event again themselves. Nobody does. So an event gets
 * an address of its own here — `?event=<id>` — read back in App.tsx, which
 * switches to the events tab and opens that event's details.
 *
 * A query parameter rather than a fragment, for the reason `?verify=` already
 * is one: the fragment is spoken for by the tab router, and a parameter
 * survives being typed out, pasted into a message, or passed through the
 * services that rewrite links.
 *
 * What this does not buy is a rich preview. Crawlers and chat apps read the
 * static tags in index.html without running the bundle, so a shared event
 * unfurls as the organisation, not as that event. Hence the `text` below
 * carrying the title, date and place in words — that is what the recipient
 * actually reads in the message.
 */

export const EVENT_PARAM = 'event';

/**
 * The same idea aimed at the volunteer form rather than the write-up.
 *
 * A one-off event is recruited for in a WhatsApp group, and what gets pasted
 * there has to land on the thing being asked for. `?event=` opens the
 * description, which is right for an invitation and wrong for "we need six
 * people on Saturday" — the recipient then has to find the volunteer button
 * inside the dialog. This one opens the shift list and the form directly.
 */
export const VOLUNTEER_PARAM = 'volunteer';

function paramShareUrl(name: string, eventId: string): string {
  const url = new URL(window.location.href);

  // Drop whatever brought this visitor here — a Stripe return, a tab
  // fragment, another event — so the link carries this event and nothing
  // else. Sharing somebody else's `?session_id=` would be worse than untidy.
  url.search = '';
  url.hash = '';
  url.searchParams.set(name, eventId);

  return url.toString();
}

function readParam(name: string): string | null {
  if (typeof window === 'undefined') return null;

  const requested = new URLSearchParams(window.location.search).get(name);
  return requested?.trim() ? requested.trim() : null;
}

function clearParam(name: string): void {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.searchParams.delete(name);
  window.history.replaceState({}, '', url.toString());
}

/** The address that opens this one event. */
export function eventShareUrl(event: PAWTXEvent): string {
  return paramShareUrl(EVENT_PARAM, event.id);
}

/** The address that opens this one event's volunteer form. */
export function volunteerShareUrl(event: PAWTXEvent): string {
  return paramShareUrl(VOLUNTEER_PARAM, event.id);
}

/** The id asked for by the address the visitor arrived on, if any. */
export function readEventRequest(): string | null {
  return readParam(EVENT_PARAM);
}

/** The event whose volunteer form the address asked for, if any. */
export function readVolunteerRequest(): string | null {
  return readParam(VOLUNTEER_PARAM);
}

/**
 * Strips the parameter once it has been acted on, so a refresh does not
 * reopen the dialog over whatever the visitor has moved on to, and so the
 * address they copy next is not still pointing at somebody else's event.
 * replaceState rather than pushState: this is not a step to go back to.
 */
export function clearEventParam(): void {
  clearParam(EVENT_PARAM);
}

/** Same, for the volunteer form's own parameter. */
export function clearVolunteerParam(): void {
  clearParam(VOLUNTEER_PARAM);
}

export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'failed';

/**
 * Hands the event to whatever the device shares with, and falls back to the
 * clipboard where there is nothing.
 */
export async function shareEvent(payload: {
  title: string;
  text: string;
  url: string;
}): Promise<ShareOutcome> {
  // The phone's own sheet reaches WhatsApp, Messages and Facebook, which is
  // where an invitation to a community event in Odessa actually travels. A
  // copied link is the consolation prize, not the goal.
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share(payload);
      return 'shared';
    } catch (error) {
      // Dismissing the sheet rejects with AbortError. That is a decision, not
      // a failure: falling through to the clipboard here would quietly copy a
      // link the person had just declined to send.
      if (error instanceof DOMException && error.name === 'AbortError') return 'dismissed';
      // Anything else — a browser that advertises the API and then refuses,
      // a share target that errors — is worth the fallback below.
    }
  }

  try {
    await navigator.clipboard.writeText(payload.url);
    return 'copied';
  } catch {
    // `navigator.clipboard` is undefined outside a secure context, and reading
    // `.writeText` off it throws rather than returning a rejected promise —
    // which is why this is a try/catch and not a `.catch`.
    return 'failed';
  }
}
