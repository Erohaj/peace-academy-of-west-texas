import React, { useState } from 'react';
import { PageTitleProps, subTitleTag } from './pageTitle';
import { useTranslation } from 'react-i18next';
import { Calendar, MapPin, Clock, Users, ArrowRight, AlertCircle } from 'lucide-react';
import { PAWTXEvent } from '../types';
import { useAppStore } from '../store/useAppStore';

interface EventCardProps extends PageTitleProps {
  event: PAWTXEvent;
}

export const EventCard: React.FC<EventCardProps> = ({ event, asPageTitle }) => {
  const CardTitle = subTitleTag(asPageTitle);
  const { t } = useTranslation();
  const { openRsvpModal, language } = useAppStore();
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  const spotsLeft = event.totalSpots - event.reservedSpots;
  const isWaitlist = spotsLeft <= 0;

  const title = language === 'es' ? event.titleEs : event.title;
  const description = language === 'es' ? event.descriptionEs : event.description;

  return (
    <div className="bg-aged-paper rounded-[24px] overflow-hidden border border-warm-taupe shadow-sm hover:shadow-md transition-all flex flex-col h-full group">
      
      {/* Event Image & Badges */}
      <div className="relative h-56 overflow-hidden bg-warm-taupe">
        {!isImageLoaded && (
          <div className="absolute inset-0 bg-warm-taupe animate-pulse flex items-center justify-center z-10">
            <div className="w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
          </div>
        )}
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent z-10 pointer-events-none" />

        {/* Live Spots Counter Badge */}
        <div className="absolute top-4 right-4 z-20">
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

        {/* Category Pill */}
        <div className="absolute bottom-4 left-4 z-20">
          <span className="bg-olive text-white px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-[0.2em] shadow-sm">
            {event.category}
          </span>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
        
        <div className="space-y-3">
          <CardTitle className="pawtx-card-heading leading-snug group-hover:text-terracotta transition-colors">
            {title}
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
          </div>
        </div>

        {/* RSVP Action Button */}
        <div className="pt-2">
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
        </div>

      </div>

    </div>
  );
};
