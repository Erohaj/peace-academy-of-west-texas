import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertCircle, Clock, ExternalLink, Ticket } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { TicketStatus, fetchTicketBySession } from '../lib/api/tickets';
import type { TicketReturn as TicketReturnParams } from '../lib/ticketReturn';
import { CONTACT_EMAIL } from '../lib/features';
import { useAppStore } from '../store/useAppStore';
import { getGoogleCalendarUrl } from '../lib/eventDates';

const TITLE_ID = 'ticket-return-title';

/**
 * How long to keep asking whether the webhook has confirmed this payment.
 *
 * Stripe redirects the browser and calls the webhook independently, and the
 * redirect usually wins by a second or two — so the first read almost always
 * finds the booking still `pending`. Nine seconds of polling covers that
 * comfortably without leaving a spinner on screen for a webhook that is not
 * coming, in which case the screen says the payment is still going through
 * rather than claiming either outcome.
 */
const POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 1500;

interface TicketReturnProps {
  /**
   * What Stripe sent the attendee back with.
   *
   * Passed in rather than read from the URL here: `App` reads the parameters
   * once during render and clears them once, for the same reason the donation
   * return is handled that way — a component that reads them for itself is at
   * the mercy of which effect ran first.
   */
  params: TicketReturnParams;
  onClose: () => void;
}

/**
 * What an attendee sees after paying for a seat.
 *
 * The confirmation is read back from the database rather than taken from the
 * query string. `?ticket=success` only says Stripe redirected here; whether
 * the money actually arrived is something only the webhook knows, and a screen
 * that congratulated someone on the strength of a URL would be congratulating
 * them for closing a tab.
 */
export const TicketReturn: React.FC<TicketReturnProps> = ({ params, onClose }) => {
  const { t } = useTranslation();
  const language = useAppStore((state) => state.language);
  const events = useAppStore((state) => state.events);

  const [ticket, setTicket] = useState<TicketStatus | null>(null);
  const [isChecking, setIsChecking] = useState(params.status === 'success');

  useEffect(() => {
    if (params.status !== 'success' || !params.sessionId) {
      setIsChecking(false);
      return;
    }

    let cancelled = false;
    const sessionId = params.sessionId;

    (async () => {
      for (let attempt = 0; attempt < POLL_ATTEMPTS && !cancelled; attempt++) {
        try {
          const row = await fetchTicketBySession(sessionId);
          if (cancelled) return;

          if (row) {
            setTicket(row);
            // Every other status is settled — only `pending` is worth asking
            // about again.
            if (row.payment_status !== 'pending') break;
          }
        } catch (error) {
          console.error('[PAWTX] Could not confirm the ticket', error);
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      if (!cancelled) setIsChecking(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [params.status, params.sessionId]);

  // The event is read from the store rather than returned by `ticket-status`:
  // it is already loaded, it is public, and this way the title follows the
  // language the attendee is reading in without the endpoint having to know
  // which that is.
  const event = ticket ? events.find((candidate) => candidate.id === ticket.event_id) : undefined;
  const eventTitle = event ? (language === 'es' ? event.titleEs : event.title) : '';

  const copy = (() => {
    if (params.status === 'cancelled') {
      return {
        tone: 'neutral' as const,
        title: t('ticketReturn.cancelledTitle'),
        body: t('ticketReturn.cancelledBody')
      };
    }

    if (isChecking || ticket?.payment_status === 'pending') {
      return {
        tone: 'waiting' as const,
        title: t('ticketReturn.pendingTitle'),
        body: t('ticketReturn.pendingBody')
      };
    }

    switch (ticket?.payment_status) {
      case 'paid':
        return {
          tone: 'good' as const,
          title: t('ticketReturn.successTitle'),
          body: t('ticketReturn.successBody', { title: eventTitle })
        };
      case 'failed':
        return {
          tone: 'bad' as const,
          title: t('ticketReturn.failedTitle'),
          body: t('ticketReturn.failedBody')
        };
      case 'refunded':
        return {
          tone: 'bad' as const,
          title: t('ticketReturn.refundedTitle'),
          body: t('ticketReturn.refundedBody', { email: CONTACT_EMAIL })
        };
      default:
        // No row for this session id at all. Either the lookup failed, or
        // somebody arrived on a `?ticket=success` URL that was never ours.
        // Both get the address, because the one case that matters here is a
        // card that was charged and a seat that cannot be found.
        return {
          tone: 'bad' as const,
          title: t('ticketReturn.unknownTitle'),
          body: t('ticketReturn.unknownBody', { email: CONTACT_EMAIL })
        };
    }
  })();

  const amount =
    ticket?.amount_cents === null || ticket?.amount_cents === undefined
      ? null
      : (ticket.amount_cents / 100).toLocaleString(language === 'es' ? 'es-US' : 'en-US', {
          style: 'currency',
          currency: 'USD'
        });

  const icon = {
    good: <CheckCircle2 className="w-10 h-10" aria-hidden="true" />,
    waiting: <Clock className="w-10 h-10" aria-hidden="true" />,
    neutral: <Ticket className="w-10 h-10" aria-hidden="true" />,
    bad: <AlertCircle className="w-10 h-10" aria-hidden="true" />
  }[copy.tone];

  const iconClass = {
    good: 'bg-olive/20 text-olive',
    waiting: 'bg-warm-taupe text-charcoal',
    neutral: 'bg-warm-taupe text-charcoal',
    bad: 'bg-terracotta/15 text-terracotta'
  }[copy.tone];

  const isPaid = ticket?.payment_status === 'paid';

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      labelledBy={TITLE_ID}
      // This panel is the only record of the payment the attendee has in front
      // of them until the email lands. A stray backdrop click should not be
      // what takes it away.
      closeOnBackdrop={false}
      panelClassName="max-w-md w-full overflow-hidden"
    >
      <div className="p-6 text-center space-y-5">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-sm ${iconClass}`}
        >
          {icon}
        </div>

        <div className="space-y-2">
          <h3 id={TITLE_ID} className="pawtx-card-heading">
            {copy.title}
          </h3>
          <p className="text-sm text-charcoal max-w-sm mx-auto">{copy.body}</p>
        </div>

        {/* The receipt, shown only once the payment is real. A confirmation
            number printed beside "your payment is still going through" is the
            one thing an attendee would quote back at the organisation as proof
            of a charge that may not have happened. */}
        {isPaid && ticket && (
          <div className="bg-aged-paper p-4 rounded-2xl border border-warm-taupe text-left text-xs space-y-1.5">
            {eventTitle && (
              <div className="font-bold text-graphite text-sm font-serif">{eventTitle}</div>
            )}
            {amount && (
              <div className="text-charcoal">
                {t('ticketReturn.amountPaid')}: <strong className="text-graphite">{amount}</strong>
              </div>
            )}
            <div className="text-charcoal">
              {t('ticketReturn.partySize')}: {ticket.guest_count + 1}
            </div>
            <div className="text-charcoal">
              {t('ticketReturn.confirmationNumber')}: {ticket.confirmation_number}
            </div>
            <p className="text-[11px] text-charcoal pt-2 border-t border-warm-taupe leading-relaxed">
              {t('ticketReturn.notDeductible')}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1">
          {isPaid && event && (
            <a
              href={getGoogleCalendarUrl(event, language === 'es')}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-graphite hover:bg-black text-white py-3 rounded-full text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm"
            >
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
              <span>{t('rsvpModal.addToCalendar')}</span>
            </a>
          )}

          <button
            onClick={onClose}
            className="w-full border border-warm-taupe hover:bg-aged-paper text-graphite py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            {t('ticketReturn.close')}
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
