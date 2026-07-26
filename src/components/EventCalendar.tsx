import React, { useState, useMemo } from 'react';
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
import { parseEventDate, getGoogleCalendarUrl } from '../lib/eventDates';

interface EventCalendarProps {
  events: PAWTXEvent[];
  selectedCategory: EventCategory;
  searchQuery: string;
}

export const EventCalendar: React.FC<EventCalendarProps> = ({ events, selectedCategory, searchQuery }) => {
  const { t } = useTranslation();
  const { language, openRsvpModal } = useAppStore();
  const isSpanish = language === 'es';

  // Default calendar month to August 2026 (where event schedule starts)
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date(2026, 7, 1)); // August 2026
  
  // Selected day ISO string (e.g. "2026-08-15")
  const [selectedDateIso, setSelectedDateIso] = useState<string | null>('2026-08-15');

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
      const parsed = parseEventDate(evt.date);
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
      const parsed = parseEventDate(evt.date);
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
        return 'bg-[#A64D32] text-white border-[#8b3f28]';
      case 'cultural':
        return 'bg-[#5B6346] text-white border-[#474e36]';
      case 'seminars':
        return 'bg-[#C27D38] text-white border-[#a0642a]';
      case 'relief':
        return 'bg-[#8C3A2B] text-white border-[#6e2a1e]';
      default:
        return 'bg-[#2A2A2A] text-white border-black';
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
      <div className="bg-[#F4F1ED] rounded-3xl p-6 border border-[#E5E0D8] shadow-sm space-y-6">
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Month Title & Nav */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#A64D32]/10 rounded-2xl border border-[#A64D32]/20">
              <CalendarIcon className="w-5 h-5 text-[#A64D32]" />
            </div>
            <div>
              <h3 className="text-2xl font-serif font-bold text-[#2A2A2A] capitalize">
                {monthName}
              </h3>
              <p className="text-xs text-[#5A5A5A] font-medium">
                {filteredEvents.length} {isSpanish ? 'eventos programados' : 'scheduled events'}
              </p>
            </div>
          </div>

          {/* Month Prev/Next Nav Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToday}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-white text-[#2A2A2A] hover:bg-[#A64D32] hover:text-white border border-[#E5E0D8] transition-all cursor-pointer"
            >
              {t('events.today')}
            </button>
            <div className="flex items-center bg-white rounded-full border border-[#E5E0D8] p-1">
              <button
                onClick={handlePrevMonth}
                aria-label="Previous Month"
                className="p-2 rounded-full hover:bg-[#F4F1ED] text-[#2A2A2A] transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNextMonth}
                aria-label="Next Month"
                className="p-2 rounded-full hover:bg-[#F4F1ED] text-[#2A2A2A] transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>

        {/* Quick Jump Month Pills */}
        {eventMonths.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pt-2 pb-1 scrollbar-none border-t border-[#E5E0D8]/60">
            <span className="text-xs font-bold uppercase tracking-wider text-[#5A5A5A] shrink-0 mr-1">
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
                      ? 'bg-[#5B6346] text-white shadow-sm'
                      : 'bg-white text-[#2A2A2A] hover:bg-[#E5E0D8] border border-[#E5E0D8]'
                  }`}
                >
                  <span>{m.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-[#5B6346]/10 text-[#5B6346]'
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
      <div className="bg-[#FDFBF7] rounded-3xl border border-[#E5E0D8] shadow-md overflow-hidden">
        
        {/* Weekday Header Row */}
        <div className="grid grid-cols-7 bg-[#F4F1ED] border-b border-[#E5E0D8]">
          {weekDays.map((day, idx) => (
            <div 
              key={day} 
              className={`py-3 text-center text-xs font-bold uppercase tracking-wider ${
                idx === 0 || idx === 6 ? 'text-[#A64D32]' : 'text-[#5A5A5A]'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days Cells Grid */}
        <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-[#E5E0D8]/60 bg-white">
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
                  !cell.isCurrentMonth ? 'bg-[#F9F8F5]/60 text-[#A0A0A0]' : 'bg-white text-[#2A2A2A]'
                } ${isSelected ? 'ring-2 ring-inset ring-[#A64D32] bg-[#A64D32]/5' : 'hover:bg-[#F4F1ED]/50'}`}
              >
                {/* Cell Header: Day Number & Event Badge Count */}
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`text-xs sm:text-sm font-bold rounded-full w-6 h-6 flex items-center justify-center ${
                      isSelected
                        ? 'bg-[#A64D32] text-white shadow-sm'
                        : hasEvents
                        ? 'bg-[#5B6346]/10 text-[#5B6346]'
                        : 'text-[#5A5A5A]'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>

                  {hasEvents && (
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-[#A64D32] text-white shadow-2xs">
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
                          evt.category === 'cooking' ? 'bg-[#A64D32]' :
                          evt.category === 'cultural' ? 'bg-[#5B6346]' :
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
      <div className="bg-[#F4F1ED] rounded-3xl p-6 sm:p-8 border border-[#E5E0D8] shadow-sm space-y-6">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E0D8] pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-[#5B6346] font-bold text-xs uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-[#5B6346]" />
              <span>{t('events.selectDayEvents', { date: '' })}</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-serif font-bold text-[#2A2A2A] capitalize">
              {selectedDateFormatted || (isSpanish ? 'Selecciona una fecha' : 'Select a date')}
            </h3>
          </div>

          <div className="text-xs text-[#5A5A5A] font-medium bg-white px-3.5 py-1.5 rounded-full border border-[#E5E0D8] self-start sm:self-auto">
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
                  className="bg-[#FDFBF7] rounded-2xl p-5 border border-[#E5E0D8] shadow-sm flex flex-col justify-between space-y-4 hover:border-[#A64D32]/50 transition-all group"
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

                    <h4 className="text-lg font-serif font-bold text-[#2A2A2A] leading-snug group-hover:text-[#A64D32] transition-colors">
                      {title}
                    </h4>

                    <p className="text-xs text-[#5A5A5A] line-clamp-2">
                      {description}
                    </p>

                    <div className="flex items-center gap-2 text-xs text-[#5A5A5A]">
                      <MapPin className="w-3.5 h-3.5 text-[#A64D32] shrink-0" />
                      <span className="truncate">{event.location}</span>
                    </div>

                    {/* Spots progress */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-[#5A5A5A] flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-[#5B6346]" />
                          <span>{event.reservedSpots} / {event.totalSpots} {isSpanish ? 'reservados' : 'reserved'}</span>
                        </span>
                        <span className={isFull ? 'text-red-600 font-bold' : 'text-[#5B6346]'}>
                          {isFull ? t('events.waitlist') : t('events.spotsLeft', { count: spotsRemaining })}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-[#E5E0D8] rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            isFull ? 'bg-red-600' : 'bg-[#5B6346]'
                          }`}
                          style={{ width: `${Math.min(100, pctReserved)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-[#E5E0D8]">
                    <button
                      onClick={() => openRsvpModal(event)}
                      className={`w-full sm:flex-1 py-2.5 px-4 rounded-full text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        isFull
                          ? 'bg-[#2A2A2A] text-white hover:bg-black'
                          : 'bg-[#A64D32] text-white hover:bg-[#8b3f28] shadow-md hover:shadow-lg'
                      }`}
                    >
                      <span>{isFull ? t('events.joinWaitlist') : t('events.rsvpButton')}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    <a
                      href={getGoogleCalendarUrl(event, isSpanish)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto px-3.5 py-2.5 rounded-full text-xs font-bold text-[#2A2A2A] bg-white hover:bg-[#E5E0D8] border border-[#E5E0D8] flex items-center justify-center gap-1.5 transition-all"
                      title={t('events.addToCalendar')}
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-[#5B6346]" />
                      <span className="sm:hidden">{t('events.addToCalendar')}</span>
                    </a>
                  </div>

                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 bg-[#FDFBF7] rounded-2xl border border-[#E5E0D8] space-y-3">
            <Filter className="w-8 h-8 text-[#5A5A5A]/40 mx-auto" />
            <p className="text-sm font-medium text-[#5A5A5A]">
              {t('events.noEventsOnDay')}
            </p>
            <p className="text-xs text-[#5A5A5A]/80 max-w-sm mx-auto">
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
