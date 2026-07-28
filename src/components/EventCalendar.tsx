import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  Users, 
  CheckCircle2, 
  ExternalLink,
  Sparkles,
  ArrowRight,
  Filter
} from 'lucide-react';
import { PAWTXEvent, EventCategory } from '../types';
import { useAppStore } from '../store/useAppStore';
import { getEventDateParts, getGoogleCalendarUrl } from '../lib/eventDates';

interface EventCalendarProps {
  events: PAWTXEvent[];
  selectedCategory: EventCategory;
  searchQuery: string;
}

export const EventCalendar: React.FC<EventCalendarProps> = ({ events, selectedCategory, searchQuery }) => {
  const { t } = useTranslation();
  const { language, openRsvpModal } = useAppStore();
  const isSpanish = language === 'es';

  // Events arrive sorted by start time, so the first one is the soonest. The
  // month used to be hardcoded to August 2026 to match the old seed data —
  // with events now coming from the database, that would strand the calendar
  // on an empty month as soon as the schedule moved on.
  const firstEventParts = events.length > 0 ? getEventDateParts(events[0]) : null;

  const [currentDate, setCurrentDate] = useState<Date>(() =>
    firstEventParts ? new Date(firstEventParts.year, firstEventParts.month, 1) : new Date()
  );

  // Selected day ISO string (e.g. "2026-08-15")
  const [selectedDateIso, setSelectedDateIso] = useState<string | null>(
    firstEventParts?.isoDate ?? null
  );

  // The first render happens before the events request resolves, so the
  // defaults above land on today. Re-centre once the real schedule arrives —
  // but never after the visitor has started navigating months themselves.
  const hasCentred = useRef(false);
  useEffect(() => {
    if (hasCentred.current || !firstEventParts) return;
    hasCentred.current = true;
    setCurrentDate(new Date(firstEventParts.year, firstEventParts.month, 1));
    setSelectedDateIso(firstEventParts.isoDate);
  }, [firstEventParts]);

  // Filter events based on active category & search query
  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      const matchesCategory = selectedCategory === 'all' || evt.category === selectedCategory;
      const title = isSpanish ? evt.titleEs : evt.title;
      const desc = isSpanish ? evt.descriptionEs : evt.description;

      const matchesSearch =
        !searchQuery.trim() ||
        title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        evt.location.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [events, selectedCategory, searchQuery, isSpanish]);

  // Group filtered events by ISO date key ("YYYY-MM-DD")
  const eventsByDate = useMemo(() => {
    const map: Record<string, PAWTXEvent[]> = {};
    filteredEvents.forEach((evt) => {
      const parsed = getEventDateParts(evt);
      if (parsed) {
        if (!map[parsed.isoDate]) {
          map[parsed.isoDate] = [];
        }
        map[parsed.isoDate].push(evt);
      }
    });
    return map;
  }, [filteredEvents]);

  // Months with scheduled events for quick navigation chips
  const eventMonths = useMemo(() => {
    const monthMap = new Map<string, { year: number; month: number; label: string; count: number }>();
    
    events.forEach((evt) => {
      const parsed = getEventDateParts(evt);
      if (parsed) {
        const key = `${parsed.year}-${parsed.month}`;
        const monthName = parsed.dateObj.toLocaleString(isSpanish ? 'es' : 'en-US', { month: 'short', year: 'numeric' });
        const existing = monthMap.get(key) || { year: parsed.year, month: parsed.month, label: monthName, count: 0 };
        existing.count += 1;
        monthMap.set(key, existing);
      }
    });

    return Array.from(monthMap.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }, [events, isSpanish]);

  // Current view calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthName = currentDate.toLocaleString(isSpanish ? 'es' : 'en-US', { month: 'long', year: 'numeric' });

  // Grid calculation
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  // Navigation handlers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date(2026, 7, 1)); // Default back to August 2026 schedule root
  };

  // Weekday header names
  const weekDays = isSpanish
    ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Helper for category badge styling
  const getCategoryBadgeStyle = (cat: EventCategory) => {
    switch (cat) {
      case 'cooking':
        return 'bg-terracotta text-white border-terracotta-deep';
      case 'cultural':
        return 'bg-olive text-white border-[#474e36]';
      case 'seminars':
        return 'bg-[#C27D38] text-white border-[#a0642a]';
      case 'relief':
        return 'bg-[#8C3A2B] text-white border-[#6e2a1e]';
      default:
        return 'bg-graphite text-white border-black';
    }
  };

  // Build grid day items
  const gridCells = useMemo(() => {
    const cells = [];

    // Previous month padding cells
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const pDay = daysInPrevMonth - i;
      const prevMonthDate = new Date(year, month - 1, pDay);
      const iso = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-${String(pDay).padStart(2, '0')}`;
      cells.push({
        dayNumber: pDay,
        isCurrentMonth: false,
        isoDate: iso,
        events: eventsByDate[iso] || [],
      });
    }

    // Current month cells
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNumber: d,
        isCurrentMonth: true,
        isoDate: iso,
        events: eventsByDate[iso] || [],
      });
    }

    // Next month padding cells to complete 35 or 42 total cells
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let n = 1; n <= remaining; n++) {
      const nextMonthDate = new Date(year, month + 1, n);
      const iso = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
      cells.push({
        dayNumber: n,
        isCurrentMonth: false,
        isoDate: iso,
        events: eventsByDate[iso] || [],
      });
    }

    return cells;
  }, [year, month, firstDayOfWeek, daysInMonth, daysInPrevMonth, eventsByDate]);

  // Selected date events
  const selectedDayEvents = selectedDateIso ? eventsByDate[selectedDateIso] || [] : [];

  // Formatted date string for selected header
  const selectedDateFormatted = useMemo(() => {
    if (!selectedDateIso) return '';
    const [y, m, d] = selectedDateIso.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString(isSpanish ? 'es-ES' : 'en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, [selectedDateIso, isSpanish]);

  return (
    <div className="space-y-8">
      {/* Calendar Top Control Header */}
      <div className="bg-aged-paper rounded-3xl p-6 border border-warm-taupe shadow-sm space-y-6">
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Month Title & Nav */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-terracotta/10 rounded-2xl border border-terracotta/20">
              <CalendarIcon className="w-5 h-5 text-terracotta" />
            </div>
            <div>
              <h3 className="pawtx-card-heading capitalize">
                {monthName}
              </h3>
              <p className="text-xs text-charcoal font-medium">
                {filteredEvents.length} {isSpanish ? 'eventos programados' : 'scheduled events'}
              </p>
            </div>
          </div>

          {/* Month Prev/Next Nav Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToday}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-white text-graphite hover:bg-terracotta hover:text-white border border-warm-taupe transition-all cursor-pointer"
            >
              {t('events.today')}
            </button>
            <div className="flex items-center bg-white rounded-full border border-warm-taupe p-1">
              <button
                onClick={handlePrevMonth}
                aria-label="Previous Month"
                className="p-2 rounded-full hover:bg-aged-paper text-graphite transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNextMonth}
                aria-label="Next Month"
                className="p-2 rounded-full hover:bg-aged-paper text-graphite transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>

        {/* Quick Jump Month Pills */}
        {eventMonths.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pt-2 pb-1 scrollbar-none border-t border-warm-taupe/60">
            <span className="text-xs font-bold uppercase tracking-wider text-charcoal shrink-0 mr-1">
              {t('events.quickJump')}:
            </span>
            {eventMonths.map((m) => {
              const isActive = currentDate.getFullYear() === m.year && currentDate.getMonth() === m.month;
              return (
                <button
                  key={`${m.year}-${m.month}`}
                  onClick={() => setCurrentDate(new Date(m.year, m.month, 1))}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-olive text-white shadow-sm'
                      : 'bg-white text-graphite hover:bg-warm-taupe border border-warm-taupe'
                  }`}
                >
                  <span>{m.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-olive/10 text-olive'
                  }`}>
                    {m.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

      </div>

      {/* Main Monthly Calendar Grid */}
      <div className="bg-parchment rounded-3xl border border-warm-taupe shadow-md overflow-hidden">
        
        {/* Weekday Header Row */}
        <div className="grid grid-cols-7 bg-aged-paper border-b border-warm-taupe">
          {weekDays.map((day, idx) => (
            <div 
              key={day} 
              className={`py-3 text-center text-xs font-bold uppercase tracking-wider ${
                idx === 0 || idx === 6 ? 'text-terracotta' : 'text-charcoal'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days Cells Grid */}
        <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-warm-taupe/60 bg-white">
          {gridCells.map((cell, idx) => {
            const hasEvents = cell.events.length > 0;
            const isSelected = selectedDateIso === cell.isoDate;

            return (
              <div
                key={`${cell.isoDate}-${idx}`}
                onClick={() => {
                  setSelectedDateIso(cell.isoDate);
                }}
                className={`min-h-[90px] sm:min-h-[120px] p-1.5 sm:p-2.5 transition-all cursor-pointer flex flex-col justify-between group relative ${
                  !cell.isCurrentMonth ? 'bg-porcelain/60 text-muted-text' : 'bg-white text-graphite'
                } ${isSelected ? 'ring-2 ring-inset ring-terracotta bg-terracotta/5' : 'hover:bg-aged-paper/50'}`}
              >
                {/* Cell Header: Day Number & Event Badge Count */}
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`text-xs sm:text-sm font-bold rounded-full w-6 h-6 flex items-center justify-center ${
                      isSelected
                        ? 'bg-terracotta text-white shadow-sm'
                        : hasEvents
                        ? 'bg-olive/10 text-olive'
                        : 'text-charcoal'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>

                  {hasEvents && (
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-terracotta text-white shadow-2xs">
                      {cell.events.length} {cell.events.length === 1 ? 'event' : 'events'}
                    </span>
                  )}
                </div>

                {/* Event Pills Area */}
                <div className="mt-1.5 space-y-1 overflow-y-auto max-h-[70px] scrollbar-none">
                  {cell.events.map((evt) => {
                    const title = isSpanish ? evt.titleEs : evt.title;
                    const spotsRemaining = evt.totalSpots - evt.reservedSpots;
                    const isFull = spotsRemaining <= 0;

                    return (
                      <div
                        key={evt.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDateIso(cell.isoDate);
                          openRsvpModal(evt);
                        }}
                        title={`${title} (${evt.time})`}
                        className={`p-1.5 rounded-lg text-[11px] font-medium leading-tight border transition-transform hover:scale-[1.02] shadow-2xs ${getCategoryBadgeStyle(evt.category)}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate font-semibold text-[10px] leading-tight">
                            {title}
                          </span>
                          {isFull && (
                            <span className="shrink-0 text-[8px] bg-red-600 text-white font-bold px-1 rounded">
                              FULL
                            </span>
                          )}
                        </div>
                        <div className="text-[9px] opacity-90 truncate mt-0.5 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{evt.time.split('-')[0]}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Mobile event indicator dots */}
                {hasEvents && (
                  <div className="flex sm:hidden items-center justify-center gap-1 mt-1">
                    {cell.events.map((evt) => (
                      <span
                        key={evt.id}
                        className={`w-2 h-2 rounded-full ${
                          evt.category === 'cooking' ? 'bg-terracotta' :
                          evt.category === 'cultural' ? 'bg-olive' :
                          evt.category === 'seminars' ? 'bg-[#C27D38]' : 'bg-[#8C3A2B]'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>

      {/* Selected Day Event Drawer / Detail Cards */}
      <div className="bg-aged-paper rounded-3xl p-6 sm:p-8 border border-warm-taupe shadow-sm space-y-6">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-warm-taupe pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-olive font-bold text-xs uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-olive" />
              <span>{t('events.selectDayEvents', { date: '' })}</span>
            </div>
            <h3 className="text-xl sm:pawtx-card-heading capitalize">
              {selectedDateFormatted || (isSpanish ? 'Selecciona una fecha' : 'Select a date')}
            </h3>
          </div>

          <div className="text-xs text-charcoal font-medium bg-white px-3.5 py-1.5 rounded-full border border-warm-taupe self-start sm:self-auto">
            {selectedDayEvents.length} {isSpanish ? 'evento(s) encontrados' : 'event(s) scheduled'}
          </div>
        </div>

        {/* Selected Day Events List */}
        {selectedDayEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {selectedDayEvents.map((event) => {
              const title = isSpanish ? event.titleEs : event.title;
              const description = isSpanish ? event.descriptionEs : event.description;
              const spotsRemaining = event.totalSpots - event.reservedSpots;
              const isFull = spotsRemaining <= 0;
              const pctReserved = Math.round((event.reservedSpots / event.totalSpots) * 100);

              return (
                <div
                  key={event.id}
                  className="bg-parchment rounded-2xl p-5 border border-warm-taupe shadow-sm flex flex-col justify-between space-y-4 hover:border-terracotta/50 transition-all group"
                >
                  <div className="space-y-3">
                    {/* Category pill & Image preview */}
                    <div className="relative h-44 rounded-xl overflow-hidden">
                      <img
                        src={event.imageUrl}
                        alt={title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                      
                      <span className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm border ${getCategoryBadgeStyle(event.category)}`}>
                        {t(`events.${event.category}`)}
                      </span>

                      <div className="absolute bottom-3 left-3 right-3 text-white">
                        <div className="flex items-center gap-2 text-xs text-white/90">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{event.time}</span>
                        </div>
                      </div>
                    </div>

                    <h4 className="text-lg font-serif font-bold text-graphite leading-snug group-hover:text-terracotta transition-colors">
                      {title}
                    </h4>

                    <p className="text-xs text-charcoal line-clamp-2">
                      {description}
                    </p>

                    <div className="flex items-center gap-2 text-xs text-charcoal">
                      <MapPin className="w-3.5 h-3.5 text-terracotta shrink-0" />
                      <span className="truncate">{event.location}</span>
                    </div>

                    {/* Spots progress */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-charcoal flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-olive" />
                          <span>{event.reservedSpots} / {event.totalSpots} {isSpanish ? 'reservados' : 'reserved'}</span>
                        </span>
                        <span className={isFull ? 'text-red-600 font-bold' : 'text-olive'}>
                          {isFull ? t('events.waitlist') : t('events.spotsLeft', { count: spotsRemaining })}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-warm-taupe rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            isFull ? 'bg-red-600' : 'bg-olive'
                          }`}
                          style={{ width: `${Math.min(100, pctReserved)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-warm-taupe">
                    <button
                      onClick={() => openRsvpModal(event)}
                      className={`w-full sm:flex-1 py-2.5 px-4 rounded-full text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        isFull
                          ? 'bg-graphite text-white hover:bg-black'
                          : 'bg-terracotta text-white hover:bg-terracotta-deep shadow-md hover:shadow-lg'
                      }`}
                    >
                      <span>{isFull ? t('events.joinWaitlist') : t('events.rsvpButton')}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    <a
                      href={getGoogleCalendarUrl(event, isSpanish)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto px-3.5 py-2.5 rounded-full text-xs font-bold text-graphite bg-white hover:bg-warm-taupe border border-warm-taupe flex items-center justify-center gap-1.5 transition-all"
                      title={t('events.addToCalendar')}
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-olive" />
                      <span className="sm:hidden">{t('events.addToCalendar')}</span>
                    </a>
                  </div>

                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 bg-parchment rounded-2xl border border-warm-taupe space-y-3">
            <Filter className="w-8 h-8 text-charcoal/40 mx-auto" />
            <p className="text-sm font-medium text-charcoal">
              {t('events.noEventsOnDay')}
            </p>
            <p className="text-xs text-charcoal/80 max-w-sm mx-auto">
              {isSpanish
                ? 'Haz clic en cualquier día marcado con un distintivo en el calendario para ver sus detalles.'
                : 'Click on any highlighted day in the calendar grid above to explore its schedule.'}
            </p>
          </div>
        )}

      </div>
    </div>
  );
};
