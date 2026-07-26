import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, ChevronLeft, ChevronRight, MapPin, Calendar, Camera } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { GalleryCategory } from '../types';
import { AnimatedSection } from './AnimatedSection';

export const Gallery: React.FC = () => {
  const { t } = useTranslation();
  const {
    gallery,
    lightboxItemIndex,
    openLightbox,
    closeLightbox,
    nextLightbox,
    prevLightbox,
    language
  } = useAppStore();

  const [selectedCategory, setSelectedCategory] = useState<GalleryCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});

  const handleImageLoad = (id: string) => {
    setLoadedImages((prev) => ({ ...prev, [id]: true }));
  };

  const filteredGallery = useMemo(() => {
    return gallery.filter((item) => {
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const title = language === 'es' ? item.titleEs : item.title;
      const caption = language === 'es' ? item.captionEs : item.caption;

      const matchesSearch =
        title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        caption.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.location.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [gallery, selectedCategory, searchQuery, language]);

  // Keyboard navigation for Lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxItemIndex === null) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') nextLightbox();
      if (e.key === 'ArrowLeft') prevLightbox();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxItemIndex, closeLightbox, nextLightbox, prevLightbox]);

  const activeItem = lightboxItemIndex !== null ? gallery[lightboxItemIndex] : null;

  const categories: { id: GalleryCategory; labelKey: string }[] = [
    { id: 'all', labelKey: 'gallery.all' },
    { id: 'cooking', labelKey: 'gallery.cooking' },
    { id: 'cultural', labelKey: 'gallery.cultural' },
    { id: 'seminars', labelKey: 'gallery.seminars' },
    { id: 'relief', labelKey: 'gallery.relief' },
  ];

  return (
    <section className="py-20 bg-[#FDFBF7] text-[#2A2A2A] min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Gallery Title Header */}
        <AnimatedSection direction="up" delayMs={50}>
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <div className="inline-flex items-center gap-2 text-[#5B6346] font-bold text-xs uppercase tracking-[0.2em] bg-[#5B6346]/10 px-4 py-1.5 rounded-full border border-[#5B6346]/20">
              <Camera className="w-3.5 h-3.5 text-[#5B6346]" />
              <span>PAWTX Visual History</span>
            </div>

            <h2 className="text-3xl sm:text-5xl font-serif font-bold text-[#2A2A2A]">
              {t('gallery.title')}
            </h2>

            <p className="text-base sm:text-lg text-[#5A5A5A]">
              {t('gallery.subtitle')}
            </p>
          </div>
        </AnimatedSection>

        {/* Faceted Search & Filters */}
        <AnimatedSection direction="up" delayMs={100}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-[#F4F1ED] p-4 rounded-3xl border border-[#E5E0D8]">
            
            <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-none md:flex-wrap md:overflow-visible">
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

            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-[#5A5A5A] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('gallery.searchPlaceholder')}
                className="w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-full pl-10 pr-4 py-2 text-xs text-[#2A2A2A] focus:outline-none focus:border-[#A64D32]"
              />
            </div>

          </div>
        </AnimatedSection>

        {/* Gallery Image Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGallery.map((item, idx) => {
              const originalIndex = gallery.findIndex((g) => g.id === item.id);
              const title = language === 'es' ? item.titleEs : item.title;
              const caption = language === 'es' ? item.captionEs : item.caption;
              const isLoaded = loadedImages[item.id];

              return (
                <AnimatedSection key={item.id} direction="up" delayMs={30 + (idx % 3) * 60}>
                  <div
                    onClick={() => openLightbox(originalIndex)}
                    className="group relative rounded-3xl overflow-hidden cursor-pointer shadow-sm border border-[#E5E0D8] bg-[#F4F1ED] transform transition-all duration-300 hover:-translate-y-1 hover:shadow-xl h-full"
                  >
                    <div className="aspect-4/3 overflow-hidden bg-[#E5E0D8] relative">
                      {!isLoaded && (
                        <div className="absolute inset-0 bg-[#E5E0D8] animate-pulse">
                          <div className="w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                        </div>
                      )}
                      <img
                        src={item.imageUrl}
                        alt={title}
                        loading="lazy"
                        onLoad={() => handleImageLoad(item.id)}
                        className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${
                          isLoaded ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                    </div>

                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />

                  <div className="absolute bottom-0 left-0 right-0 p-5 text-white space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] bg-[#5B6346] text-white px-2.5 py-0.5 rounded-md inline-block mb-1">
                      {item.category}
                    </span>
                    <h3 className="text-lg font-serif font-bold leading-tight text-white group-hover:text-amber-200 transition-colors">
                      {title}
                    </h3>
                    <p className="text-xs text-stone-200 line-clamp-2">
                      {caption}
                    </p>
                  </div>
                </div>
              </AnimatedSection>
            );
          })}
        </div>

      </div>

      {/* Lightbox Modal */}
      {activeItem && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 animate-fadeIn">
          
          {/* Close Button */}
          <button
            onClick={closeLightbox}
            className="absolute top-6 right-6 z-50 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-3 rounded-full transition-colors cursor-pointer"
            title={t('gallery.close')}
          >
            <X className="w-6 h-6" />
          </button>

          {/* Nav Controls */}
          <button
            onClick={prevLightbox}
            className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 z-50 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-3.5 rounded-full transition-colors cursor-pointer"
            title={t('gallery.prev')}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <button
            onClick={nextLightbox}
            className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 z-50 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-3.5 rounded-full transition-colors cursor-pointer"
            title={t('gallery.next')}
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          {/* Lightbox Content Container */}
          <div className="max-w-4xl w-full max-h-[85vh] flex flex-col md:flex-row bg-[#2A2A2A] rounded-3xl overflow-hidden border border-white/20 shadow-2xl">
            
            {/* Image View */}
            <div className="md:w-2/3 bg-black flex items-center justify-center p-2 relative">
              <img
                src={activeItem.imageUrl}
                alt={activeItem.title}
                className="max-h-[60vh] md:max-h-[80vh] w-auto object-contain rounded-xl"
              />
            </div>

            {/* Image Meta details */}
            <div className="md:w-1/3 p-6 sm:p-8 flex flex-col justify-between text-white space-y-4">
              <div className="space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white bg-[#5B6346] px-3 py-1 rounded-md inline-block">
                  {activeItem.category}
                </span>

                <h3 className="text-2xl font-serif font-bold leading-snug">
                  {language === 'es' ? activeItem.titleEs : activeItem.title}
                </h3>

                <p className="text-sm text-stone-300 leading-relaxed font-sans">
                  {language === 'es' ? activeItem.captionEs : activeItem.caption}
                </p>
              </div>

              <div className="pt-4 border-t border-white/10 text-xs text-stone-400 space-y-2 font-sans">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#A64D32]" />
                  <span>{t('gallery.lightboxDate')}: {activeItem.date}</span>
                </div>

                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#5B6346]" />
                  <span>{t('gallery.lightboxLocation')}: {activeItem.location}</span>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

    </section>
  );
};
