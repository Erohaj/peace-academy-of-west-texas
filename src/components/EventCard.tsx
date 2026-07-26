import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, MapPin, Clock, Users, ArrowRight, AlertCircle } from 'lucide-react';
import { PAWTXEvent } from '../types';
import { useAppStore } from '../store/useAppStore';

interface EventCardProps {
  event: PAWTXEvent;
}

export const EventCard: React.FC<EventCardProps> = ({ event }) => {
  const { t } = useTranslation();
  const { openRsvpModal, language } = useAppStore();
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  const spotsLeft = event.totalSpots - event.reservedSpots;
  const isWaitlist = spotsLeft <= 0;

  const title = language === 'es' ? event.titleEs : event.title;
  const description = language === 'es' ? event.descriptionEs : event.description;

  return (
    <div className="bg-[#F4F1ED] rounded-[24px] overflow-hidden border border-[#E5E0D8] shadow-sm hover:shadow-md transition-all flex flex-col h-full group">
      
      {/* Event Image & Badges */}
      <div className="relative h-56 overflow-hidden bg-[#E5E0D8]">
        {!isImageLoaded && (
          <div className="absolute inset-0 bg-[#E5E0D8] animate-pulse flex items-center justify-center z-10">
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
            <span className="bg-[#A64D32] text-white backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase flex items-center gap-1.5 shadow-md">
              <Users className="w-3.5 h-3.5" />
              {t('events.spotsLeft', { count: spotsLeft })}
            </span>
          )}
        </div>

        {/* Category Pill */}
        <div className="absolute bottom-4 left-4 z-20">
          <span className="bg-[#5B6346] text-white px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-[0.2em] shadow-sm">
            {event.category}
          </span>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
        
        <div className="space-y-3">
          <h3 className="text-2xl font-serif font-bold text-[#2A2A2A] leading-snug group-hover:text-[#A64D32] transition-colors">
            {title}
          </h3>

          <p className="text-[#5A5A5A] text-sm leading-relaxed line-clamp-3">
            {description}
          </p>

          {/* Date & Location Details */}
          <div className="space-y-2 pt-2 border-t border-[#E5E0D8] text-xs sm:text-sm text-[#5A5A5A]">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#A64D32] shrink-0" />
              <span className="font-semibold text-[#2A2A2A]">{event.date}</span>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#5B6346] shrink-0" />
              <span>{event.time}</span>
            </div>

            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#A64D32] shrink-0" />
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
                ? 'bg-[#2A2A2A] hover:bg-black text-white'
                : 'bg-[#A64D32] hover:bg-[#8b3f28] text-white hover:scale-[1.01]'
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
