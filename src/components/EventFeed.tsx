import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PageTitleProps, titleTag } from './pageTitle';
import { Search, Filter, Sparkles, LayoutGrid, Calendar as CalendarIcon } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { EventCard } from './EventCard';
import { EventCalendar } from './EventCalendar';
import { EventCategory } from '../types';
import { AnimatedSection } from './AnimatedSection';
import { CalendarSkeleton, EventGridSkeleton } from './Skeletons';

export const EventFeed: React.FC<PageTitleProps> = ({ asPageTitle }) => {
  const Title = titleTag(asPageTitle);
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
    <section id="events-section" className="py-20 bg-parchment text-graphite">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Section Header */}
        <AnimatedSection direction="up" delayMs={50}>
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <div className="inline-flex items-center gap-2 text-olive font-bold text-xs uppercase tracking-[0.2em] bg-olive/10 px-4 py-1.5 rounded-full border border-olive/20">
              <Sparkles className="w-3.5 h-3.5 text-olive" />
              <span>{t('events.eyebrow')}</span>
            </div>

            <Title className="text-3xl sm:text-5xl font-serif font-bold text-graphite">
              {t('events.sectionTitle')}
            </Title>

            <p className="text-base sm:text-lg text-charcoal">
              {t('events.subtitle')}
            </p>
          </div>
        </AnimatedSection>

        {/* Search, Category Filter & View Switcher Controls */}
        <AnimatedSection direction="up" delayMs={100}>
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-aged-paper p-4 rounded-3xl border border-warm-taupe shadow-sm">
            
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
                        ? 'bg-terracotta text-white shadow-sm'
                        : 'bg-parchment text-graphite hover:bg-white border border-warm-taupe'
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
                <Search className="w-4 h-4 text-charcoal absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('events.searchPlaceholder')}
                  className="w-full bg-parchment border border-warm-taupe rounded-full pl-10 pr-4 py-2 text-xs text-graphite pawtx-focus focus:border-terracotta focus:ring-1 focus:ring-terracotta"
                />
              </div>

              {/* View Mode Toggle Switch */}
              <div className="flex items-center bg-parchment p-1 rounded-full border border-warm-taupe justify-center">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-olive text-white shadow-xs'
                      : 'text-charcoal hover:text-graphite'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>{t('events.viewGrid')}</span>
                </button>

                <button
                  onClick={() => setViewMode('calendar')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'calendar'
                      ? 'bg-olive text-white shadow-xs'
                      : 'text-charcoal hover:text-graphite'
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
                <EventCard event={event} asPageTitle={asPageTitle} />
              </AnimatedSection>
            ))}
          </div>
        ) : (
          <AnimatedSection direction="fade" delayMs={100}>
            <div className="text-center py-16 bg-aged-paper rounded-3xl border border-warm-taupe space-y-3">
              <Filter className="w-8 h-8 text-terracotta mx-auto opacity-50" />
              <p className="text-base text-charcoal font-medium">
                {t('events.noEvents')}
              </p>
              <button
                onClick={() => {
                  setSelectedCategory('all');
                  setSearchQuery('');
                }}
                className="text-xs text-terracotta font-bold uppercase tracking-widest underline hover:text-terracotta-deep"
              >
                {t('common.resetFilters')}
              </button>
            </div>
          </AnimatedSection>
        )}

      </div>
    </section>
  );
};

