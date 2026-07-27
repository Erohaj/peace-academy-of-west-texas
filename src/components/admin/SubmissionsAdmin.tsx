import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, AlertCircle, MailOpen, Mail } from 'lucide-react';
import type { Tables } from '../../lib/database.types';
import { fetchAllRsvps } from '../../lib/api/rsvps';
import { fetchDonations } from '../../lib/api/donations';
import { downloadCsv, fetchContactMessages, markContactHandled, toCsv } from '../../lib/api/admin';
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
      registered_at: formatDateTime(rsvp.created_at)
    }));

    downloadCsv(
      `pawtx-rsvps-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows, [
        'event', 'name', 'email', 'phone', 'guests', 'party_size',
        'optional_donation', 'registered_at'
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

  const exportButton = (onClick: () => void) => (
    <button
      onClick={onClick}
      className="flex items-center gap-2 border border-[#E5E0D8] bg-[#FDFBF7] hover:bg-white px-4 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer"
    >
      <Download className="w-4 h-4" />
      <span>Export CSV</span>
    </button>
  );

  if (isLoading) return <p className="text-sm text-[#5A5A5A]">Loading...</p>;

  return (
    <div className="space-y-8">

      {error && (
        <div className="flex items-start gap-2 bg-[#A64D32]/10 border border-[#A64D32]/30 rounded-2xl px-4 py-3 text-xs text-[#A64D32]">
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
            <p className="text-sm text-[#5A5A5A]">No donations recorded yet.</p>
          ) : (
            <div className="bg-[#F4F1ED] border border-[#E5E0D8] rounded-2xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#FDFBF7] text-xs uppercase tracking-wider text-[#5A5A5A]">
                  <tr>
                    <th className="text-left p-4">Date</th>
                    <th className="text-left p-4">Donor</th>
                    <th className="text-left p-4">Amount</th>
                    <th className="text-left p-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {donations.map((donation) => (
                    <tr key={donation.id} className="border-t border-[#E5E0D8]">
                      <td className="p-4 text-xs whitespace-nowrap">{formatDateTime(donation.created_at)}</td>
                      <td className="p-4">
                        <div className="font-bold text-sm">{donation.donor_name || 'Anonymous'}</div>
                        <div className="text-xs text-[#5A5A5A]">{donation.donor_email || '—'}</div>
                      </td>
                      <td className="p-4 whitespace-nowrap font-bold">
                        {formatMoney(donation.amount_cents)}
                        {donation.frequency === 'monthly' && (
                          <span className="text-xs font-normal text-[#5A5A5A]"> / mo</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                          donation.status === 'paid'
                            ? 'bg-[#5B6346]/20 text-[#5B6346]'
                            : donation.status === 'pending'
                              ? 'bg-[#5A5A5A]/15 text-[#5A5A5A]'
                              : 'bg-[#A64D32]/15 text-[#A64D32]'
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
              <p className="text-sm text-[#5A5A5A]">No registrations yet.</p>
            ) : (
              <div className="bg-[#F4F1ED] border border-[#E5E0D8] rounded-2xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#FDFBF7] text-xs uppercase tracking-wider text-[#5A5A5A]">
                    <tr>
                      <th className="text-left p-4">Event</th>
                      <th className="text-left p-4">Attendee</th>
                      <th className="text-left p-4">Party</th>
                      <th className="text-left p-4">Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rsvps.map((rsvp) => (
                      <tr key={rsvp.id} className="border-t border-[#E5E0D8]">
                        <td className="p-4 text-xs">{eventTitles.get(rsvp.event_id) ?? '—'}</td>
                        <td className="p-4">
                          <div className="font-bold text-sm">{rsvp.full_name}</div>
                          <div className="text-xs text-[#5A5A5A]">{rsvp.email}</div>
                          {rsvp.phone && <div className="text-xs text-[#5A5A5A]">{rsvp.phone}</div>}
                        </td>
                        <td className="p-4 text-xs whitespace-nowrap">{rsvp.guest_count + 1}</td>
                        <td className="p-4 text-xs whitespace-nowrap">{formatDateTime(rsvp.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-serif font-bold">Contact messages</h2>

            {messages.length === 0 ? (
              <p className="text-sm text-[#5A5A5A]">No messages yet.</p>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`bg-[#F4F1ED] border rounded-2xl p-4 ${
                      message.handled ? 'border-[#E5E0D8] opacity-60' : 'border-[#A64D32]/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-bold text-sm">{message.full_name}</div>
                        <a href={`mailto:${message.email}`} className="text-xs text-[#A64D32] hover:underline">
                          {message.email}
                        </a>
                        <div className="text-xs text-[#5A5A5A] mt-0.5">
                          {formatDateTime(message.created_at)}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleHandled(message)}
                        title={message.handled ? 'Mark as unread' : 'Mark as handled'}
                        className="shrink-0 p-2 rounded-lg hover:bg-[#FDFBF7] text-[#5A5A5A] cursor-pointer"
                      >
                        {message.handled ? <MailOpen className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-sm text-[#2A2A2A] mt-3 whitespace-pre-wrap break-words">
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
