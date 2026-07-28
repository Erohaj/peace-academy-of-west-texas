import React from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, Calendar, Users, Award, Compass, ArrowRight, Share2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { IMAGES } from '../data/mockData';

export const Hero: React.FC = () => {
  const { t } = useTranslation();
  const { setActiveTab } = useAppStore();

  const handleSocialClick = () => {
    setActiveTab('social');
    setTimeout(() => {
      const elem = document.getElementById('social-feed-section');
      if (elem) {
        elem.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
  };

  // `-mt-16` cancels the `pt-16` that <main> gives every tab, so the photo
  // starts at the very top of the viewport and fills the area behind the fixed
  // header. Without it the header's upper 64px sat over the cream page
  // background while still rendering its white, transparent-mode text — white
  // on cream, effectively invisible. The section's own pt-24 already clears the
  // 80px bar, so no content moves underneath it.
  return (
    <section className="relative min-h-[90vh] -mt-16 flex items-center justify-center pt-24 pb-16 overflow-hidden">
      {/* Background Image with Warm Overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src={IMAGES.heroBanner}
          alt="Peace Academy West Texas Parade Banner"
          className="w-full h-full object-cover object-center transform filter contrast-[1.05]"
          referrerPolicy="no-referrer"
          // The one image that must win the initial race — everything below the
          // fold is lazy so it doesn't compete for connections.
          fetchPriority="high"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/45 to-black/60" />
        <div className="absolute inset-0 bg-terracotta/10 mix-blend-overlay" />
      </div>

      {/* Hero Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white space-y-8">
        
        {/* Tagline Badge */}
        <div className="inline-flex items-center gap-2 bg-aged-paper/95 text-terracotta backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-bold tracking-[0.2em] uppercase border border-warm-taupe shadow-lg animate-fadeIn">
          <Compass className="w-3.5 h-3.5 text-terracotta" />
          <span>EST. 2018 — Midland & Odessa, TX</span>
        </div>

        {/* Main Heading with Italic Typography */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-serif tracking-tight text-white leading-[0.95] drop-shadow-md">
          {t('hero.titleLine1')}{' '}
          <span className="italic font-serif text-amber-200">
            {t('hero.titleLine2')}
          </span>
        </h1>

        {/* Call to Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 pt-3">
          <button
            onClick={() => setActiveTab('donate')}
            className="w-full sm:w-auto bg-terracotta hover:bg-terracotta-deep text-white px-7 py-3.5 rounded-full font-bold text-xs sm:text-sm tracking-widest uppercase transition-all transform hover:scale-[1.03] shadow-xl shadow-terracotta/20 flex items-center justify-center gap-3 cursor-pointer group"
          >
            <Heart className="w-4 h-4 fill-white/20 group-hover:scale-110 transition-transform" />
            <span>{t('hero.donateCta')}</span>
            <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 transition-transform" />
          </button>

          <button
            onClick={() => setActiveTab('events')}
            className="w-full sm:w-auto bg-parchment hover:bg-white text-graphite px-7 py-3.5 rounded-full font-bold text-xs sm:text-sm tracking-widest uppercase transition-all transform hover:scale-[1.03] shadow-lg flex items-center justify-center gap-3 cursor-pointer border border-warm-taupe"
          >
            <Calendar className="w-4 h-4 text-terracotta" />
            <span>{t('hero.eventsCta')}</span>
          </button>

          <button
            onClick={handleSocialClick}
            className="w-full sm:w-auto bg-black/40 hover:bg-black/60 text-white backdrop-blur-md px-7 py-3.5 rounded-full font-bold text-xs sm:text-sm tracking-widest uppercase transition-all transform hover:scale-[1.03] shadow-lg flex items-center justify-center gap-3 cursor-pointer border border-white/30"
          >
            <Share2 className="w-4 h-4 text-amber-300" />
            <span>{t('nav.social')}</span>
          </button>
        </div>

        {/* Real-time Impact Statistics */}
        <div className="pt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto">
          <div className="bg-black/40 hover:bg-black/50 backdrop-blur-md rounded-2xl p-6 border border-white/20 hover:border-amber-300/50 transition-all duration-300 text-center text-parchment shadow-xl group">
            <div className="w-10 h-10 rounded-full bg-amber-400/10 border border-amber-300/30 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              <Users className="w-5 h-5 text-amber-300" />
            </div>
            <div className="text-3xl sm:text-4xl font-serif font-bold text-white tracking-tight">12,000+</div>
            <div className="text-[11px] tracking-[0.2em] uppercase font-bold text-amber-100/90 mt-1.5">{t('hero.statServed')}</div>
          </div>

          <div className="bg-black/40 hover:bg-black/50 backdrop-blur-md rounded-2xl p-6 border border-white/20 hover:border-amber-300/50 transition-all duration-300 text-center text-parchment shadow-xl group">
            <div className="w-10 h-10 rounded-full bg-amber-400/10 border border-amber-300/30 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              <Award className="w-5 h-5 text-amber-300" />
            </div>
            <div className="text-3xl sm:text-4xl font-serif font-bold text-white tracking-tight">85+</div>
            <div className="text-[11px] tracking-[0.2em] uppercase font-bold text-amber-100/90 mt-1.5">{t('hero.statEvents')}</div>
          </div>

          <div className="bg-black/40 hover:bg-black/50 backdrop-blur-md rounded-2xl p-6 border border-white/20 hover:border-amber-300/50 transition-all duration-300 text-center text-parchment shadow-xl group">
            <div className="w-10 h-10 rounded-full bg-amber-400/10 border border-amber-300/30 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              <Heart className="w-5 h-5 text-amber-300 fill-amber-300/20" />
            </div>
            <div className="text-3xl sm:text-4xl font-serif font-bold text-white tracking-tight">100%</div>
            <div className="text-[11px] tracking-[0.2em] uppercase font-bold text-amber-100/90 mt-1.5">{t('hero.statNonprofit')}</div>
          </div>
        </div>

      </div>
    </section>
  );
};
