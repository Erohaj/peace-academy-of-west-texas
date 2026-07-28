import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, AlertCircle, MailOpen, Mail, Trash2 } from 'lucide-react';
import type { Tables } from '../../lib/database.types';
import { fetchAllRsvps } from '../../lib/api/rsvps';
import { fetchDonations } from '../../lib/api/donations';
import {
  deleteContactMessage,
  downloadCsv,
  fetchContactMessages,
  markContactHandled,
  toCsv
} from '../../lib/api/admin';
import { useAppStore } from '../../store/useAppStore';
import { EVENT_TIME_ZONE } from '../../lib/formatEventDate';

type RsvpRow = Tables<'rsvps'>;
type DonationRow = Tables<'donations'>;
type MessageRow = Tables<'contact_messages'>;

interface SubmissionsAdminProps {
  view: 'rsvps' | 'donations';
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: EVENT_TIME_ZONE
  });

const formatMoney = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/**
 * Photo/video permission, as a badge someone can scan a roster for.
 *
 * A refusal is the one value that must never be missed, so it is the only red
 * thing in the table. "Not asked" is deliberately not green: the event simply
 * never put the question, which is not permission to publish anyone.
 */
const MEDIA_CONSENT_BADGE: Record<string, { label: string; hint: string; className: string }> = {
  yes: {
    label: 'Yes',
    hint: 'Consented to photography and recording, and to it being shared publicly.',
    className: 'bg-olive/15 text-[#3F462F] border border-olive/30'
  },
  photos_only: {
    label: 'Photos only',
    hint: 'Still photography only — no video or audio recording.',
    className: 'bg-amber-100 text-amber-900 border border-amber-300'
  },
  no: {
    label: 'Do not photograph',
    hint: 'Declined. Do not include this person in anything intended for publication.',
    className: 'bg-red-100 text-red-800 border border-red-300'
  },
  unasked: {
    label: '—',
    hint: 'This event did not ask. Treat as no permission rather than assuming consent.',
    className: 'bg-warm-taupe text-charcoal border border-[#D6D0C4]'
  }
};

/**
 * Read-only views over the submissions tables, with CSV export.
 *
 * These rows hold attendee and donor personal data. They are only reachable
 * because the RLS policies allow `select` to a profile with `role = 'admin'` —
 * for everyone else the same queries return an empty set.
 */
export const SubmissionsAdmin: React.FC<SubmissionsAdminProps> = ({ view }) => {
  const events = useAppStore((state) => state.events);

  const [rsvps, setRsvps] = useState<RsvpRow[]>([]);
  const [donations, setDonations] = useState<DonationRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const eventTitles = useMemo(
    () => new Map(events.map((event) => [event.id, event.title])),
    [events]
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (view === 'rsvps') {
        const [rsvpRows, messageRows] = await Promise.all([
          fetchAllRsvps(),
          fetchContactMessages()
        ]);
        setRsvps(rsvpRows);
        setMessages(messageRows);
      } else {
        setDonations(await fetchDonations());
      }
    } catch (loadError) {
      console.error('[PAWTX] Failed to load submissions', loadError);
      setError('Could not load this data.');
    } finally {
      setIsLoading(false);
    }
  }, [view]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportRsvps = () => {
    const rows = rsvps.map((rsvp) => ({
      event: eventTitles.get(rsvp.event_id) ?? rsvp.event_id,
      name: rsvp.full_name,
      email: rsvp.email,
      phone: rsvp.phone ?? '',
      guests: rsvp.guest_count,
      party_size: rsvp.guest_count + 1,
      optional_donation: rsvp.optional_donation,
      // Exported as the raw value, not the badge label: this column is the
      // record someone may have to rely on later.
      media_consent: rsvp.media_consent ?? 'not_asked',
      registered_at: formatDateTime(rsvp.created_at)
    }));

    downloadCsv(
      `pawtx-rsvps-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows, [
        'event', 'name', 'email', 'phone', 'guests', 'party_size',
        'optional_donation', 'media_consent', 'registered_at'
      ])
    );
  };

  const exportDonations = () => {
    const rows = donations.map((donation) => ({
      date: formatDateTime(donation.created_at),
      donor: donation.donor_name ?? '',
      email: donation.donor_email ?? '',
      amount_usd: (donation.amount_cents / 100).toFixed(2),
      frequency: donation.frequency,
      status: donation.status,
      stripe_session: donation.stripe_session_id ?? ''
    }));

    downloadCsv(
      `pawtx-donations-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows, [
        'date', 'donor', 'email', 'amount_usd', 'frequency', 'status', 'stripe_session'
      ])
    );
  };

  const toggleHandled = async (message: MessageRow) => {
    try {
      await markContactHandled(message.id, !message.handled);
      setMessages((current) =>
        current.map((row) => (row.id === message.id ? { ...row, handled: !row.handled } : row))
      );
    } catch (toggleError) {
      console.error('[PAWTX] Failed to update message', toggleError);
      setError('Could not update that message.');
    }
  };

  const handleDeleteMessage = async (message: MessageRow) => {
    // Deletion is permanent and there is no undo, so the prompt quotes the
    // message itself — enough to notice you are about to remove a real
    // enquiry rather than the spam you meant to clear.
    const preview = message.message.length > 120
      ? `${message.message.slice(0, 120)}…`
      : message.message;

    const confirmed = window.confirm(
      `Delete this message permanently?\n\nFrom: ${message.full_name} <${message.email}>\n\n"${preview}"`
    );
    if (!confirmed) return;

    try {
      await deleteContactMessage(message.id);
      setMessages((current) => current.filter((row) => row.id !== message.id));
    } catch (deleteError) {
      console.error('[PAWTX] Failed to delete message', deleteError);
      setError('Could not delete that message.');
    }
  };

  const exportButton = (onClick: () => void) => (
    <button
      onClick={onClick}
      className="flex items-center gap-2 border border-warm-taupe bg-parchment hover:bg-white px-4 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer"
    >
      <Download className="w-4 h-4" />
      <span>Export CSV</span>
    </button>
  );

  if (isLoading) return <p className="text-sm text-charcoal">Loading...</p>;

  return (
    <div className="space-y-8">

      {error && (
        <div className="flex items-start gap-2 bg-terracotta/10 border border-terracotta/30 rounded-2xl px-4 py-3 text-xs text-terracotta">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {view === 'donations' ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-serif font-bold">Donations</h2>
            {donations.length > 0 && exportButton(exportDonations)}
          </div>

          {donations.length === 0 ? (
            <p className="text-sm text-charcoal">No donations recorded yet.</p>
          ) : (
            <div className="bg-aged-paper border border-warm-taupe rounded-2xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-parchment text-xs uppercase tracking-wider text-charcoal">
                  <tr>
                    <th className="text-left p-4">Date</th>
                    <th className="text-left p-4">Donor</th>
                    <th className="text-left p-4">Amount</th>
                    <th className="text-left p-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {donations.map((donation) => (
                    <tr key={donation.id} className="border-t border-warm-taupe">
                      <td className="p-4 text-xs whitespace-nowrap">{formatDateTime(donation.created_at)}</td>
                      <td className="p-4">
                        <div className="font-bold text-sm">{donation.donor_name || 'Anonymous'}</div>
                        <div className="text-xs text-charcoal">{donation.donor_email || '—'}</div>
                      </td>
                      <td className="p-4 whitespace-nowrap font-bold">
                        {formatMoney(donation.amount_cents)}
                        {donation.frequency === 'monthly' && (
                          <span className="text-xs font-normal text-charcoal"> / mo</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                          donation.status === 'paid'
                            ? 'bg-olive/20 text-olive'
                            : donation.status === 'pending'
                              ? 'bg-charcoal/15 text-charcoal'
                              : 'bg-terracotta/15 text-terracotta'
                        }`}>
                          {donation.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-serif font-bold">RSVPs</h2>
              {rsvps.length > 0 && exportButton(exportRsvps)}
            </div>

            {rsvps.length === 0 ? (
              <p className="text-sm text-charcoal">No registrations yet.</p>
            ) : (
              <div className="bg-aged-paper border border-warm-taupe rounded-2xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-parchment text-xs uppercase tracking-wider text-charcoal">
                    <tr>
                      <th className="text-left p-4">Event</th>
                      <th className="text-left p-4">Attendee</th>
                      <th className="text-left p-4">Party</th>
                      <th className="text-left p-4">Photos</th>
                      <th className="text-left p-4">Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rsvps.map((rsvp) => {
                      const consent = MEDIA_CONSENT_BADGE[rsvp.media_consent ?? 'unasked'];
                      return (
                        <tr key={rsvp.id} className="border-t border-warm-taupe">
                          <td className="p-4 text-xs">{eventTitles.get(rsvp.event_id) ?? '—'}</td>
                          <td className="p-4">
                            <div className="font-bold text-sm">{rsvp.full_name}</div>
                            <div className="text-xs text-charcoal">{rsvp.email}</div>
                            {rsvp.phone && <div className="text-xs text-charcoal">{rsvp.phone}</div>}
                          </td>
                          <td className="p-4 text-xs whitespace-nowrap">{rsvp.guest_count + 1}</td>
                          <td className="p-4 whitespace-nowrap">
                            <span
                              title={consent.hint}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${consent.className}`}
                            >
                              {consent.label}
                            </span>
                          </td>
                          <td className="p-4 text-xs whitespace-nowrap">{formatDateTime(rsvp.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-serif font-bold">Contact messages</h2>

            {messages.length === 0 ? (
              <p className="text-sm text-charcoal">No messages yet.</p>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`bg-aged-paper border rounded-2xl p-4 ${
                      message.handled ? 'border-warm-taupe opacity-60' : 'border-terracotta/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-bold text-sm">{message.full_name}</div>
                        <a href={`mailto:${message.email}`} className="text-xs text-terracotta hover:underline">
                          {message.email}
                        </a>
                        <div className="text-xs text-charcoal mt-0.5">
                          {formatDateTime(message.created_at)}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
                        <button
                          onClick={() => toggleHandled(message)}
                          title={message.handled ? 'Mark as unread' : 'Mark as handled'}
                          className="p-2 rounded-lg hover:bg-parchment text-charcoal cursor-pointer"
                        >
                          {message.handled ? <MailOpen className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDeleteMessage(message)}
                          title="Delete permanently"
                          className="p-2 rounded-lg hover:bg-terracotta/10 text-terracotta cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-graphite mt-3 whitespace-pre-wrap break-words">
                      {message.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
