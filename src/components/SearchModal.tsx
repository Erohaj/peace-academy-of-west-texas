import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, Calendar, Image as ImageIcon, UserCheck, ArrowRight, Tag, MapPin, Clock, Sparkles } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ModalShell } from './ModalShell';
import { PAWTXEvent, GalleryItem, Shift } from '../types';

const TITLE_ID = 'search-modal-title';

type ResultCategory = 'all' | 'events' | 'gallery' | 'shifts';

interface SearchResultItem {
  id: string;
  type: 'event' | 'gallery' | 'shift';
  title: string;
  subtitle?: string;
  description: string;
  date?: string;
  location?: string;
  badge: string;
  imageUrl?: string;
  rawItem: PAWTXEvent | GalleryItem | Shift;
}

export const SearchModal: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isEs = i18n.language === 'es';
  const {
    isSearchOpen,
    closeSearch,
    toggleSearch,
    events,
    gallery,
    shifts,
    setActiveTab,
    openRsvpModal,
    openLightbox,
  } = useAppStore();

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ResultCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  // Global Keyboard listener for Cmd+K / Ctrl+K. Escape used to live here too
  // and is now ModalShell's, along with the click-outside this modal had and
  // the other three did not.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSearch]);

  // Auto focus input when opened
  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isSearchOpen]);

  // Index search results
  const results = useMemo<SearchResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    const items: SearchResultItem[] = [];

    // Search Events
    events.forEach((evt) => {
      const title = isEs && evt.titleEs ? evt.titleEs : evt.title;
      const desc = isEs && evt.descriptionEs ? evt.descriptionEs : evt.description;
      const category = evt.category;
      const loc = evt.location;

      const matches =
        !q ||
        title.toLowerCase().includes(q) ||
        desc.toLowerCase().includes(q) ||
        category.toLowerCase().includes(q) ||
        loc.toLowerCase().includes(q);

      if (matches) {
        items.push({
          id: `evt-${evt.id}`,
          type: 'event',
          title,
          subtitle: `${evt.date} • ${evt.time}`,
          description: desc,
          date: evt.date,
          location: loc,
          badge: isEs ? 'Evento' : 'Community Event',
          imageUrl: evt.imageUrl,
          rawItem: evt,
        });
      }
    });

    // Search Gallery
    gallery.forEach((item, index) => {
      const title = isEs && item.titleEs ? item.titleEs : item.title;
      const caption = isEs && item.captionEs ? item.captionEs : item.caption;
      const loc = item.location;

      const matches =
        !q ||
        title.toLowerCase().includes(q) ||
        caption.toLowerCase().includes(q) ||
        loc.toLowerCase().includes(q);

      if (matches) {
        items.push({
          id: `gal-${item.id}-${index}`,
          type: 'gallery',
          title,
          subtitle: item.date,
          description: caption,
          date: item.date,
          location: loc,
          badge: isEs ? 'Galería' : 'Media Gallery',
          imageUrl: item.imageUrl,
          rawItem: item,
        });
      }
    });

    // Search Shifts / Volunteer Roles
    shifts.forEach((shift) => {
      const title = isEs && shift.titleEs ? shift.titleEs : shift.title;
      const role = isEs && shift.roleEs ? shift.roleEs : shift.role;
      const desc = isEs && shift.descriptionEs ? shift.descriptionEs : shift.description;

      const matches =
        !q ||
        title.toLowerCase().includes(q) ||
        role.toLowerCase().includes(q) ||
        desc.toLowerCase().includes(q);

      if (matches) {
        items.push({
          id: `shift-${shift.id}`,
          type: 'shift',
          title,
          subtitle: `${shift.date} (${shift.time})`,
          description: desc,
          date: shift.date,
          badge: isEs ? 'Voluntariado' : 'Volunteer Shift',
          rawItem: shift,
        });
      }
    });

    return items;
  }, [query, events, gallery, shifts, isEs]);

  // Filter by category chip
  const filteredResults = useMemo(() => {
    if (activeCategory === 'all') return results;
    if (activeCategory === 'events') return results.filter((r) => r.type === 'event');
    if (activeCategory === 'gallery') return results.filter((r) => r.type === 'gallery');
    if (activeCategory === 'shifts') return results.filter((r) => r.type === 'shift');
    return results;
  }, [results, activeCategory]);

  // Counts for chips
  const counts = useMemo(() => {
    return {
      all: results.length,
      events: results.filter((r) => r.type === 'event').length,
      gallery: results.filter((r) => r.type === 'gallery').length,
      shifts: results.filter((r) => r.type === 'shift').length,
    };
  }, [results]);

  // Reset selectedIndex when filtered items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredResults.length, activeCategory]);

  const handleSelectResult = (item: SearchResultItem) => {
    closeSearch();
    if (item.type === 'event') {
      setActiveTab('events');
      // Option to trigger RSVP modal for event
      openRsvpModal(item.rawItem as PAWTXEvent);
    } else if (item.type === 'gallery') {
      setActiveTab('gallery');
      const galIndex = gallery.findIndex((g) => g.id === (item.rawItem as GalleryItem).id);
      if (galIndex !== -1) {
        openLightbox(galIndex);
      }
    } else if (item.type === 'shift') {
      setActiveTab('volunteer');
    }
  };

  const handleKeyDownInList = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredResults.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredResults.length) % (filteredResults.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredResults[selectedIndex]) {
        handleSelectResult(filteredResults[selectedIndex]);
      }
    }
  };

  return (
    <ModalShell
      isOpen={isSearchOpen}
      onClose={closeSearch}
      labelledBy={TITLE_ID}
      // The input below takes focus on open; the panel must not steal it back.
      moveFocus={false}
      backdropClassName="items-start justify-center pt-16 sm:pt-24 px-4 pb-6"
      panelClassName="max-w-2xl w-full overflow-hidden flex flex-col max-h-[82vh]"
      onKeyDown={handleKeyDownInList}
    >
        {/* Named for the accessibility tree — the palette has no visible
            heading, and "dialog" with no name says nothing about what opened. */}
        <h2 id={TITLE_ID} className="sr-only">
          {isEs ? 'Buscar en el sitio' : 'Search this site'}
        </h2>

        {/* Top Search Input Bar */}
        <div className="p-4 sm:p-5 border-b border-warm-taupe bg-white flex items-center gap-3">
          <Search className="w-5 h-5 text-terracotta shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isEs
                ? "Buscar eventos, fotos de galería o voluntariado..."
                : "Search events, gallery photos, or volunteer roles..."
            }
            className="w-full bg-transparent text-base sm:text-lg font-medium text-graphite placeholder:text-charcoal/60 pawtx-focus"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-full hover:bg-aged-paper text-charcoal transition-colors cursor-pointer"
              title={isEs ? 'Borrar búsqueda' : 'Clear search'}
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={closeSearch}
            className="px-2.5 py-1 rounded-lg bg-aged-paper text-xs font-mono font-bold text-charcoal hover:bg-warm-taupe transition-colors cursor-pointer shrink-0"
          >
            ESC
          </button>
        </div>

        {/* Category Filter Chips */}
        <div className="px-4 sm:px-5 py-2.5 border-b border-warm-taupe bg-aged-paper/60 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer ${
              activeCategory === 'all'
                ? 'bg-terracotta text-white shadow-sm'
                : 'bg-white text-charcoal hover:bg-white/80 border border-warm-taupe'
            }`}
          >
            {isEs ? 'Todos' : 'All'} ({counts.all})
          </button>
          <button
            onClick={() => setActiveCategory('events')}
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeCategory === 'events'
                ? 'bg-terracotta text-white shadow-sm'
                : 'bg-white text-charcoal hover:bg-white/80 border border-warm-taupe'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            {isEs ? 'Eventos' : 'Events'} ({counts.events})
          </button>
          <button
            onClick={() => setActiveCategory('gallery')}
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeCategory === 'gallery'
                ? 'bg-terracotta text-white shadow-sm'
                : 'bg-white text-charcoal hover:bg-white/80 border border-warm-taupe'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            {isEs ? 'Galería' : 'Gallery'} ({counts.gallery})
          </button>
          <button
            onClick={() => setActiveCategory('shifts')}
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeCategory === 'shifts'
                ? 'bg-terracotta text-white shadow-sm'
                : 'bg-white text-charcoal hover:bg-white/80 border border-warm-taupe'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            {isEs ? 'Voluntariado' : 'Volunteering'} ({counts.shifts})
          </button>
        </div>

        {/* Results List or Zero Query View */}
        {/* tabIndex makes the results scrollable from the keyboard. Without it
            someone navigating by arrow keys can reach the first few results
            and nothing below the fold — the region scrolls, but only a mouse
            or a touch can scroll it. */}
        <div
          className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3"
          tabIndex={0}
          role="region"
          aria-label={isEs ? 'Resultados de búsqueda' : 'Search results'}
        >
          {!query && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-terracotta">
                <Sparkles className="w-4 h-4" />
                <span>{isEs ? 'Búsquedas Sugeridas' : 'Popular Search Topics'}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  'Cooking Class',
                  'Food Pantry',
                  'Cultural Festival',
                  'Odessa TX',
                  'Youth Seminar',
                  'Disaster Relief',
                  'Interfaith',
                  'Volunteer Shifts',
                ].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setQuery(tag)}
                    className="px-3 py-1.5 rounded-full bg-white border border-warm-taupe text-xs font-medium text-graphite hover:border-terracotta hover:text-terracotta transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Tag className="w-3 h-3 text-terracotta" />
                    <span>{tag}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {query && filteredResults.length === 0 && (
            <div className="py-12 text-center space-y-3">
              <Search className="w-10 h-10 text-charcoal/40 mx-auto" />
              <p className="text-base font-bold text-graphite">
                {isEs ? `No se encontraron resultados para "${query}"` : `No matches found for "${query}"`}
              </p>
              <p className="text-xs text-charcoal">
                {isEs
                  ? 'Prueba buscando términos como "cocina", "voluntario", "Midland" o "evento".'
                  : 'Try searching for terms like "cooking", "pantry", "Odessa", or "festival".'}
              </p>
            </div>
          )}

          {filteredResults.map((item, index) => {
            const isSelected = index === selectedIndex;
            return (
              <div
                key={item.id}
                onClick={() => handleSelectResult(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-4 ${
                  isSelected
                    ? 'bg-white border-terracotta shadow-md ring-1 ring-terracotta/20'
                    : 'bg-white/80 border-warm-taupe hover:bg-white hover:border-terracotta/50'
                }`}
              >
                {/* Image Thumbnail or Category Icon */}
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    loading="lazy"
                    decoding="async"
                    className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-xl shrink-0 border border-warm-taupe"
                  />
                ) : (
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl bg-aged-paper border border-warm-taupe flex items-center justify-center shrink-0 text-terracotta">
                    {item.type === 'event' && <Calendar className="w-6 h-6" />}
                    {item.type === 'gallery' && <ImageIcon className="w-6 h-6" />}
                    {item.type === 'shift' && <UserCheck className="w-6 h-6" />}
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        item.type === 'event'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : item.type === 'gallery'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                      }`}
                    >
                      {item.badge}
                    </span>
                    {item.subtitle && (
                      <span className="text-xs text-charcoal flex items-center gap-1">
                        <Clock className="w-3 h-3 text-terracotta" />
                        {item.subtitle}
                      </span>
                    )}
                  </div>

                  <h4 className="text-sm sm:text-base font-serif font-bold text-graphite truncate">
                    {item.title}
                  </h4>

                  <p className="text-xs text-charcoal line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>

                  {/* Full strength, not /80: the alpha resolved to #7B7B7B on
                      white, which is 4.2:1 and fails AA at 11px. */}
                  {item.location && (
                    <div className="flex items-center gap-1 text-[11px] text-charcoal pt-0.5">
                      <MapPin className="w-3 h-3 text-terracotta" />
                      <span className="truncate">{item.location}</span>
                    </div>
                  )}
                </div>

                {/* Arrow Action CTA */}
                <div className="self-center shrink-0 pl-1">
                  <div
                    className={`p-2 rounded-full transition-colors ${
                      isSelected ? 'bg-terracotta text-white' : 'bg-aged-paper text-charcoal'
                    }`}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer Quick Keyboard Hints */}
        <div className="px-4 py-3 border-t border-warm-taupe bg-aged-paper/80 text-[11px] text-charcoal flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="pawtx-kbd">
                ↑↓
              </kbd>{' '}
              {isEs ? 'Navegar' : 'Navigate'}
            </span>
            <span>
              <kbd className="pawtx-kbd">
                ↵
              </kbd>{' '}
              {isEs ? 'Seleccionar' : 'Select'}
            </span>
            <span>
              <kbd className="pawtx-kbd">
                ESC
              </kbd>{' '}
              {isEs ? 'Cerrar' : 'Close'}
            </span>
          </div>
          <span className="font-bold text-terracotta">
            {filteredResults.length} {isEs ? 'resultados' : 'results'}
          </span>
        </div>
    </ModalShell>
  );
};
