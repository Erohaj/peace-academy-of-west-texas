import React, { useState } from 'react';
import { PageTitleProps, subTitleTag } from './pageTitle';
import { useTranslation } from 'react-i18next';
import { Calendar, MapPin, Clock, Users, ArrowRight, AlertCircle, Info, Ticket } from 'lucide-react';
import { PAWTXEvent } from '../types';
import { useAppStore } from '../store/useAppStore';
import { categoryBadgeClass, categoryLabelKey } from '../lib/eventCategory';
import { formatEventFee } from '../lib/eventFee';

interface EventCardProps extends PageTitleProps {
  event: PAWTXEvent;
}

export const EventCard: React.FC<EventCardProps> = ({ event, asPageTitle }) => {
  const CardTitle = subTitleTag(asPageTitle);
  const { t } = useTranslation();
  const { openRsvpModal, openEventDetails, language } = useAppStore();
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  const spotsLeft = event.totalSpots - event.reservedSpots;
  const isWaitlist = spotsLeft <= 0;

  const title = language === 'es' ? event.titleEs : event.title;
  const description = language === 'es' ? event.descriptionEs : event.description;
  const fee = formatEventFee(event.fee, language, t('events.free'));

  return (
    <div className="bg-aged-paper rounded-[24px] overflow-hidden border border-warm-taupe shadow-sm hover:shadow-md transition-all flex flex-col h-full group">
      
      {/* Event Image & Badges */}
      <div className="relative h-56 overflow-hidden bg-warm-taupe">
        {!isImageLoaded && (
          <div className="absolute inset-0 bg-warm-taupe animate-pulse flex items-center justify-center z-10">
            <div className="w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
          </div>
        )}
        <button
          type="button"
          onClick={() => openEventDetails(event)}
          aria-label={`${title} — ${t('events.viewDetails')}`}
          className="absolute inset-0 w-full h-full cursor-pointer pawtx-focus"
        >
          <img
            src={event.imageUrl}
            alt={title}
            loading="lazy"
            decoding="async"
            onLoad={() => setIsImageLoaded(true)}
            className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${
              isImageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </button>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent z-10 pointer-events-none" />

        {/* Live Spots Counter Badge */}
        <div className="absolute top-4 right-4 z-20 pointer-events-none">
          {isWaitlist ? (
            <span className="bg-amber-900/90 text-amber-200 border border-amber-600/50 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-md">
              <AlertCircle className="w-3.5 h-3.5 text-amber-300" />
              {t('events.waitlist')}
            </span>
          ) : (
            <span className="bg-terracotta text-white backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase flex items-center gap-1.5 shadow-md">
              <Users className="w-3.5 h-3.5" />
              {t('events.spotsLeft', { count: spotsLeft })}
            </span>
          )}
        </div>

        {/* Category Pill. Coloured and labelled by lib/eventCategory, so this
            event looks the same here as it does in the calendar view. */}
        <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
          <span
            className={`px-3 py-1 rounded-md text-3xs font-bold uppercase tracking-[0.2em] shadow-sm border ${categoryBadgeClass(event.category)}`}
          >
            {t(categoryLabelKey(event.category))}
          </span>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
        
        <div className="space-y-3">
          {/* Clamped like the description below it: an untruncated title runs
              to three lines in Spanish and pushes this card taller than the
              two beside it in the grid. */}
          {/* The clamp lives on the button, not the heading: a button child
              inside the heading's -webkit-box breaks line-clamp, and the title
              ran to three lines again, pushing this card taller than the two
              beside it — exactly what the clamp was added to prevent. */}
          <CardTitle className="pawtx-card-heading leading-snug group-hover:text-terracotta transition-colors">
            <button
              type="button"
              onClick={() => openEventDetails(event)}
              className="text-left line-clamp-2 hover:text-terracotta transition-colors cursor-pointer pawtx-focus"
            >
              {title}
            </button>
          </CardTitle>

          <p className="text-charcoal text-sm leading-relaxed line-clamp-3">
            {description}
          </p>

          {/* Date & Location Details */}
          <div className="space-y-2 pt-2 border-t border-warm-taupe text-xs sm:text-sm text-charcoal">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-terracotta shrink-0" />
              <span className="font-semibold text-graphite">{event.date}</span>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-olive shrink-0" />
              <span>{event.time}</span>
            </div>

            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-terracotta shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>

            {/* Only when a price has actually been stated — see
                formatEventFee on why null and 0 differ. */}
            {fee && (
              <div className="flex items-center gap-2">
                <Ticket className="w-4 h-4 text-olive shrink-0" />
                <span className="font-semibold text-graphite">{fee}</span>
              </div>
            )}
          </div>
        </div>

        {/* RSVP & Details Actions */}
        <div className="pt-2 space-y-2">
          <button
            onClick={() => openRsvpModal(event)}
            className={`w-full py-3 px-6 rounded-full font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
              isWaitlist
                ? 'bg-graphite hover:bg-black text-white'
                : 'bg-terracotta hover:bg-terracotta-deep text-white hover:scale-[1.01]'
            }`}
          >
            <span>{isWaitlist ? t('events.joinWaitlist') : t('events.rsvpButton')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => openEventDetails(event)}
            className="w-full py-2.5 px-6 rounded-full font-bold text-xs uppercase tracking-widest text-graphite bg-parchment hover:bg-warm-taupe border border-warm-taupe transition-colors flex items-center justify-center gap-2 cursor-pointer pawtx-focus"
          >
            <Info className="w-3.5 h-3.5 text-olive" />
            <span>{t('events.viewDetails')}</span>
          </button>
        </div>

      </div>

    </div>
  );
};
