import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  Clock,
  MapPin,
  Users,
  ArrowRight,
  ExternalLink,
  AlertCircle,
  CalendarCheck,
  Info,
  Ticket
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { categoryBadgeClass, categoryLabelKey } from '../lib/eventCategory';
import { formatEventFee } from '../lib/eventFee';
import { getDaysUntilEvent, getGoogleCalendarUrl, isEventInProgress } from '../lib/eventDates';
import { parseTimestamp } from '../lib/formatEventDate';
import { AnimatedSection } from './AnimatedSection';
import { NextEventSkeleton } from './Skeletons';

/**
 * The single soonest event, given pride of place directly under the hero.
 *
 * `EventFeed` further down the page is the whole schedule, with filters and a
 * month calendar; this is the one thing a first-time visitor is most likely to
 * act on, so it sits above the "Who We Are" story rather than below it.
 *
 * `fetchEvents` already returns published, unfinished events sorted soonest
 * first, so this is normally `events[0]`. The sort here is defensive: if
 * anything upstream ever hands the store a different order, this band must not
 * start advertising the wrong event.
 */
export const NextEventSpotlight: React.FC = () => {
  const { t } = useTranslation();
  const { events, language, dataStatus, openRsvpModal, openEventDetails, setActiveTab } =
    useAppStore();
  const isSpanish = language === 'es';

  const nextEvent = useMemo(() => {
    const dated = events.filter((evt) => parseTimestamp(evt.startsAt) !== null);
    const soonestFirst = [...dated].sort(
      (a, b) => parseTimestamp(a.startsAt).getTime() - parseTimestamp(b.startsAt).getTime()
    );
    return soonestFirst[0] ?? null;
  }, [events]);

  // `language` is in the dependency list so the countdown re-renders in the
  // new language on a switch, not only when the event itself changes.
  const countdownLabel = useMemo(() => {
    if (!nextEvent) return null;
    if (isEventInProgress(nextEvent)) return t('nextEvent.happeningNow');

    const days = getDaysUntilEvent(nextEvent);
    if (days === null) return null;
    if (days <= 0) return t('nextEvent.today');
    if (days === 1) return t('nextEvent.tomorrow');
    return t('nextEvent.inDays', { count: days });
  }, [nextEvent, t, language]);

  const isLoading = dataStatus === 'idle' || (dataStatus === 'loading' && events.length === 0);

  if (isLoading) {
    return (
      <section className="py-16 sm:py-20 bg-aged-paper text-graphite border-b border-warm-taupe">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <NextEventSkeleton />
        </div>
      </section>
    );
  }

  // Nothing on the calendar: render no band at all rather than an empty one.
  // The schedule genuinely empties out between seasons, and a "no events"
  // panel as the first thing under the hero reads as an organisation that has
  // stopped running. The story section below simply moves up to take its place.
  if (!nextEvent) return null;

  const title = isSpanish ? nextEvent.titleEs : nextEvent.title;
  const description = isSpanish ? nextEvent.descriptionEs : nextEvent.description;
  const spotsLeft = nextEvent.totalSpots - nextEvent.reservedSpots;
  const isWaitlist = spotsLeft <= 0;
  const fee = formatEventFee(nextEvent.fee, language, t('events.free'));

  return (
    <section
      id="next-event-section"
      className="py-16 sm:py-20 bg-aged-paper text-graphite border-b border-warm-taupe"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">

        {/* Band Header */}
        <AnimatedSection direction="up" delayMs={50}>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 text-terracotta font-bold text-xs uppercase tracking-[0.2em] bg-terracotta/10 px-3 py-1 rounded-md border border-terracotta/20">
                <CalendarCheck className="w-3.5 h-3.5" />
                <span>{t('nextEvent.eyebrow')}</span>
              </div>

              <h2 className="text-3xl sm:text-4xl font-serif font-bold text-graphite leading-tight">
                {t('nextEvent.heading')}
              </h2>
            </div>

            <button
              onClick={() => setActiveTab('events')}
              className="self-start sm:self-auto inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-graphite bg-parchment hover:bg-white border border-warm-taupe px-5 py-2.5 rounded-full transition-colors cursor-pointer pawtx-focus"
            >
              <span>{t('nextEvent.viewAll')}</span>
              <ArrowRight className="w-3.5 h-3.5 text-terracotta" />
            </button>
          </div>
        </AnimatedSection>

        {/* Spotlight Card */}
        <AnimatedSection direction="up" delayMs={150}>
          <div className="grid grid-cols-1 lg:grid-cols-5 bg-parchment rounded-[28px] border border-warm-taupe shadow-xl overflow-hidden">

            {/* Photo Panel */}
            <div className="relative lg:col-span-2 h-60 sm:h-72 lg:h-auto lg:min-h-[22rem] bg-warm-taupe">
              <img
                src={nextEvent.imageUrl}
                alt={title}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

              {/* Countdown — the one thing this band adds over the event grid
                  further down the page. */}
              {countdownLabel && (
                <span className="absolute top-4 left-4 bg-graphite/90 text-parchment backdrop-blur-md px-3.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.15em] shadow-md">
                  {countdownLabel}
                </span>
              )}

              {/* Same colour and label as the grid and the calendar give this
                  category, via lib/eventCategory. */}
              <span
                className={`absolute bottom-4 left-4 px-3 py-1 rounded-md text-3xs font-bold uppercase tracking-[0.2em] shadow-sm border ${categoryBadgeClass(nextEvent.category)}`}
              >
                {t(categoryLabelKey(nextEvent.category))}
              </span>
            </div>

            {/* Details Panel */}
            <div className="lg:col-span-3 p-6 sm:p-8 lg:p-10 flex flex-col justify-center gap-6">

              <div className="space-y-3">
                <h3 className="text-2xl sm:text-3xl font-serif font-bold text-graphite leading-snug">
                  {title}
                </h3>
                <p className="text-charcoal text-sm sm:text-base leading-relaxed line-clamp-3">
                  {description}
                </p>

                {/* The paragraph above is clamped to three lines; this is how
                    the rest of it is reached. */}
                <button
                  onClick={() => openEventDetails(nextEvent)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-terracotta hover:text-terracotta-deep transition-colors cursor-pointer pawtx-focus"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>{t('events.viewDetails')}</span>
                </button>
              </div>

              {/* Date, Time, Location & Seats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 pt-5 border-t border-warm-taupe text-sm text-charcoal">
                <div className="flex items-center gap-2.5">
                  <CalendarDays className="w-4 h-4 text-terracotta shrink-0" />
                  <span className="font-semibold text-graphite">{nextEvent.date}</span>
                </div>

                <div className="flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-olive shrink-0" />
                  <span>{nextEvent.time}</span>
                </div>

                <div className="flex items-center gap-2.5 sm:col-span-2">
                  <MapPin className="w-4 h-4 text-terracotta shrink-0" />
                  <span className="truncate">{nextEvent.location}</span>
                </div>

                {fee && (
                  <div className="flex items-center gap-2.5">
                    <Ticket className="w-4 h-4 text-olive shrink-0" />
                    <span className="font-semibold text-graphite">{fee}</span>
                  </div>
                )}

                {/* Shares a row with the fee when there is one, so the two
                    numbers a visitor weighs sit side by side. */}
                <div className={`flex items-center gap-2.5 ${fee ? '' : 'sm:col-span-2'}`}>
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

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  onClick={() => openRsvpModal(nextEvent)}
                  className={`flex-1 py-3.5 px-6 rounded-full font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm pawtx-focus ${
                    isWaitlist
                      ? 'bg-graphite hover:bg-black text-white'
                      : 'bg-terracotta hover:bg-terracotta-deep text-white hover:scale-[1.01]'
                  }`}
                >
                  <span>{isWaitlist ? t('events.joinWaitlist') : t('events.rsvpButton')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <a
                  href={getGoogleCalendarUrl(nextEvent, isSpanish)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3.5 px-6 rounded-full font-bold text-xs uppercase tracking-widest text-graphite bg-aged-paper hover:bg-warm-taupe border border-warm-taupe flex items-center justify-center gap-2 transition-colors pawtx-focus"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-olive" />
                  <span>{t('events.addToCalendar')}</span>
                </a>
              </div>

            </div>
          </div>
        </AnimatedSection>

      </div>
    </section>
  );
};
