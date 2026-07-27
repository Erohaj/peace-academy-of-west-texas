import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Filter, Sparkles, LayoutGrid, Calendar as CalendarIcon } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { EventCard } from './EventCard';
import { EventCalendar } from './EventCalendar';
import { EventCategory } from '../types';
import { AnimatedSection } from './AnimatedSection';
import { CalendarSkeleton, EventGridSkeleton } from './Skeletons';

export const EventFeed: React.FC = () => {
  const { t } = useTranslation();
  const { events, language, dataStatus } = useAppStore();
  const isLoadingEvents = dataStatus === 'idle' || (dataStatus === 'loading' && events.length === 0);

  const [selectedCategory, setSelectedCategory] = useState<EventCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'calendar'>('grid');

  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      const matchesCategory = selectedCategory === 'all' || evt.category === selectedCategory;
      const title = language === 'es' ? evt.titleEs : evt.title;
      const desc = language === 'es' ? evt.descriptionEs : evt.description;
      
      const matchesSearch =
        title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        evt.location.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [events, selectedCategory, searchQuery, language]);

  const categories: { id: EventCategory; labelKey: string }[] = [
    { id: 'all', labelKey: 'events.all' },
    { id: 'cooking', labelKey: 'events.cooking' },
    { id: 'cultural', labelKey: 'events.cultural' },
    { id: 'seminars', labelKey: 'events.seminars' },
    { id: 'relief', labelKey: 'events.relief' },
  ];

  return (
    <section id="events-section" className="py-20 bg-[#FDFBF7] text-[#2A2A2A]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Section Header */}
        <AnimatedSection direction="up" delayMs={50}>
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <div className="inline-flex items-center gap-2 text-[#5B6346] font-bold text-xs uppercase tracking-[0.2em] bg-[#5B6346]/10 px-4 py-1.5 rounded-full border border-[#5B6346]/20">
              <Sparkles className="w-3.5 h-3.5 text-[#5B6346]" />
              <span>Community Gatherings & Workshops</span>
            </div>

            <h2 className="text-3xl sm:text-5xl font-serif font-bold text-[#2A2A2A]">
              {t('events.sectionTitle')}
            </h2>

            <p className="text-base sm:text-lg text-[#5A5A5A]">
              {t('events.subtitle')}
            </p>
          </div>
        </AnimatedSection>

        {/* Search, Category Filter & View Switcher Controls */}
        <AnimatedSection direction="up" delayMs={100}>
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-[#F4F1ED] p-4 rounded-3xl border border-[#E5E0D8] shadow-sm">
            
            {/* Category Filter Pills — swipeable on small screens, wrapping on
                desktop so a pill label never gets sliced by the search field. */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0 scrollbar-none lg:flex-wrap lg:overflow-visible">
              {categories.map((cat) => {
                const isActive = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-[#A64D32] text-white shadow-sm'
                        : 'bg-[#FDFBF7] text-[#2A2A2A] hover:bg-white border border-[#E5E0D8]'
                    }`}
                  >
                    {t(cat.labelKey)}
                  </button>
                );
              })}
            </div>

            {/* Right Controls: Search Bar, Refresh & View Mode Toggle */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-[#5A5A5A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('events.searchPlaceholder')}
                  className="w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-full pl-10 pr-4 py-2 text-xs text-[#2A2A2A] focus:outline-none focus:border-[#A64D32] focus:ring-1 focus:ring-[#A64D32]"
                />
              </div>

              {/* View Mode Toggle Switch */}
              <div className="flex items-center bg-[#FDFBF7] p-1 rounded-full border border-[#E5E0D8] justify-center">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-[#5B6346] text-white shadow-xs'
                      : 'text-[#5A5A5A] hover:text-[#2A2A2A]'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>{t('events.viewGrid')}</span>
                </button>

                <button
                  onClick={() => setViewMode('calendar')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'calendar'
                      ? 'bg-[#5B6346] text-white shadow-xs'
                      : 'text-[#5A5A5A] hover:text-[#2A2A2A]'
                  }`}
                >
                  <CalendarIcon className="w-3.5 h-3.5" />
                  <span>{t('events.viewCalendar')}</span>
                </button>
              </div>
            </div>

          </div>
        </AnimatedSection>

        {/* Events come from Supabase, so the first paint has none. Without a
            placeholder the visitor briefly sees "no events match your filters",
            which is not what is happening. */}
        {isLoadingEvents ? (
          viewMode === 'calendar' ? <CalendarSkeleton /> : <EventGridSkeleton count={3} />
        ) : viewMode === 'calendar' ? (
          <AnimatedSection direction="fade" delayMs={50}>
            <EventCalendar
              events={events}
              selectedCategory={selectedCategory}
              searchQuery={searchQuery}
            />
          </AnimatedSection>
        ) : filteredEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredEvents.map((event, idx) => (
              <AnimatedSection key={event.id} direction="up" delayMs={50 + (idx % 3) * 60}>
                <EventCard event={event} />
              </AnimatedSection>
            ))}
          </div>
        ) : (
          <AnimatedSection direction="fade" delayMs={100}>
            <div className="text-center py-16 bg-[#F4F1ED] rounded-3xl border border-[#E5E0D8] space-y-3">
              <Filter className="w-8 h-8 text-[#A64D32] mx-auto opacity-50" />
              <p className="text-base text-[#5A5A5A] font-medium">
                {t('events.noEvents')}
              </p>
              <button
                onClick={() => {
                  setSelectedCategory('all');
                  setSearchQuery('');
                }}
                className="text-xs text-[#A64D32] font-bold uppercase tracking-widest underline hover:text-[#8b3f28]"
              >
                Reset Filters
              </button>
            </div>
          </AnimatedSection>
        )}

      </div>
    </section>
  );
};

