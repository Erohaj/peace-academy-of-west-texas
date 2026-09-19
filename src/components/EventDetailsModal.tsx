import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  Users,
  ArrowRight,
  ExternalLink,
  AlertCircle,
  Ticket
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { categoryBadgeClass, categoryLabelKey } from '../lib/eventCategory';
import { formatEventFee } from '../lib/eventFee';
import { getGoogleCalendarUrl } from '../lib/eventDates';
import { ModalShell } from './ModalShell';

const TITLE_ID = 'event-details-title';

/**
 * The whole of one event: full title, full write-up, and how to book it.
 *
 * Every other surface shows an event abbreviated — the grid and the spotlight
 * clamp the description to three lines, the calendar and the search palette to
 * two — because they are lists and a 1,500-character write-up would bury the
 * next card. That left no place at all to read one, so the text an organiser
 * wrote about what to bring, what it costs and who it is for was simply not
 * reachable. This is that place.
 *
 * The description is rendered with `whitespace-pre-line`: these are pasted out
 * of the organisation's own Facebook posts and carry real paragraph breaks,
 * which HTML would otherwise collapse into one wall of text.
 */
export const EventDetailsModal: React.FC = () => {
  const { t } = useTranslation();
  const { selectedEventForDetails, closeEventDetails, openRsvpModal, language } = useAppStore();
  const isSpanish = language === 'es';

  if (!selectedEventForDetails) return null;

  const event = selectedEventForDetails;
  const title = isSpanish ? event.titleEs : event.title;
  const description = isSpanish ? event.descriptionEs : event.description;
  const spotsLeft = event.totalSpots - event.reservedSpots;
  const isWaitlist = spotsLeft <= 0;
  const fee = formatEventFee(event.fee, language, t('events.free'));

  return (
    <ModalShell
      isOpen={Boolean(selectedEventForDetails)}
      onClose={closeEventDetails}
      labelledBy={TITLE_ID}
      panelClassName="max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
    >
      {/* Photo Header */}
      <div className="relative shrink-0 h-44 sm:h-56 bg-warm-taupe">
        <img
          src={event.imageUrl}
          alt={title}
          decoding="async"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/30" />

        <button
          onClick={closeEventDetails}
          aria-label={t('common.close')}
          className="absolute top-3 right-3 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-md transition-colors cursor-pointer pawtx-focus"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        <span className="absolute top-3 left-3 bg-parchment/90 text-terracotta backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] shadow-sm">
          {t('events.details')}
        </span>

        <span
          className={`absolute bottom-3 left-3 px-3 py-1 rounded-md text-3xs font-bold uppercase tracking-[0.2em] shadow-sm border ${categoryBadgeClass(event.category)}`}
        >
          {t(categoryLabelKey(event.category))}
        </span>
      </div>

      {/* Scrolling Body. min-h-0 is what lets this shrink inside the flex
          column — without it the panel grows past max-h and the footer with
          the RSVP button is pushed off the bottom of the screen. */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-8 space-y-6">

        <h3 id={TITLE_ID} className="text-2xl sm:text-3xl font-serif font-bold text-graphite leading-snug">
          {title}
        </h3>

        {/* Date, Time, Location & Seats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 bg-aged-paper rounded-2xl border border-warm-taupe p-5">
          <div className="space-y-1">
            <div className="pawtx-label mb-0">{t('events.eventDate')}</div>
            <div className="flex items-center gap-2 text-sm text-graphite font-semibold">
              <Calendar className="w-4 h-4 text-terracotta shrink-0" />
              <span>{event.date}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-charcoal">
              <Clock className="w-4 h-4 text-olive shrink-0" />
              <span>{event.time}</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="pawtx-label mb-0">{t('events.eventLocation')}</div>
            <div className="flex items-start gap-2 text-sm text-charcoal">
              <MapPin className="w-4 h-4 text-terracotta shrink-0 mt-0.5" />
              <span>{event.location}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {isWaitlist ? (
                <>
                  <AlertCircle className="w-4 h-4 text-ochre-deep shrink-0" />
                  <span className="font-semibold text-ochre-deep">{t('events.waitlist')}</span>
                </>
              ) : (
                <>
                  <Users className="w-4 h-4 text-olive shrink-0" />
                  <span className="font-semibold text-graphite">
                    {t('events.spotsLeft', { count: spotsLeft })}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Its own labelled block, not a line buried in the description:
              the price is the thing someone scans for before reading a
              word of the write-up. Absent entirely when unstated. */}
          {fee && (
            <div className="space-y-1 sm:col-span-2 pt-1 border-t border-warm-taupe">
              <div className="pawtx-label mb-0">{t('events.fee')}</div>
              <div className="flex items-center gap-2 text-sm text-graphite font-semibold">
                <Ticket className="w-4 h-4 text-olive shrink-0" />
                <span>{fee}</span>
              </div>
            </div>
          )}
        </div>

        {/* The full write-up — the reason this dialog exists. */}
        <p className="text-charcoal text-sm sm:text-base leading-relaxed whitespace-pre-line">
          {description}
        </p>
      </div>

      {/* Action Bar */}
      <div className="shrink-0 p-4 sm:p-6 border-t border-warm-taupe bg-aged-paper flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => openRsvpModal(event)}
          className={`flex-1 py-3.5 px-6 rounded-full font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm pawtx-focus ${
            isWaitlist
              ? 'bg-graphite hover:bg-black text-white'
              : 'bg-terracotta hover:bg-terracotta-deep text-white'
          }`}
        >
          <span>{isWaitlist ? t('events.joinWaitlist') : t('events.rsvpButton')}</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <a
          href={getGoogleCalendarUrl(event, isSpanish)}
          target="_blank"
          rel="noopener noreferrer"
          className="py-3.5 px-6 rounded-full font-bold text-xs uppercase tracking-widest text-graphite bg-parchment hover:bg-warm-taupe border border-warm-taupe flex items-center justify-center gap-2 transition-colors pawtx-focus"
        >
          <ExternalLink className="w-3.5 h-3.5 text-olive" />
          <span>{t('events.addToCalendar')}</span>
        </a>
      </div>
    </ModalShell>
  );
};
