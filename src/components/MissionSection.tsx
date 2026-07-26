import React from 'react';
import { useTranslation } from 'react-i18next';
import { Utensils, Coffee, HeartHandshake, Sparkles, MapPin, Quote } from 'lucide-react';
import { IMAGES } from '../data/mockData';
import { AnimatedSection } from './AnimatedSection';

export const MissionSection: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section className="py-20 bg-[#FDFBF7] text-[#2A2A2A] relative border-t border-b border-[#E5E0D8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        
        {/* Story Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Text Column */}
          <div className="lg:col-span-7 space-y-6">
            <AnimatedSection direction="up" delayMs={50}>
              <div className="inline-flex items-center gap-2 text-[#5B6346] font-bold text-xs uppercase tracking-[0.2em] bg-[#5B6346]/10 px-3 py-1 rounded-md border border-[#5B6346]/20">
                <MapPin className="w-3.5 h-3.5" />
                <span>Odessa & Midland, Texas</span>
              </div>
            </AnimatedSection>

            <AnimatedSection direction="up" delayMs={100}>
              <h2 className="text-3xl sm:text-5xl font-serif font-bold text-[#2A2A2A] leading-tight">
                {t('mission.heading')}
              </h2>
            </AnimatedSection>

            <AnimatedSection direction="up" delayMs={150}>
              <p className="text-base sm:text-lg text-[#5A5A5A] leading-relaxed font-sans">
                {t('mission.text1')}
              </p>
            </AnimatedSection>

            <AnimatedSection direction="up" delayMs={200}>
              <p className="text-base sm:text-lg text-[#5A5A5A] leading-relaxed font-sans">
                {t('mission.text2')}
              </p>
            </AnimatedSection>

            {/* Core Motto Callout Box */}
            <AnimatedSection direction="up" delayMs={250}>
              <div className="bg-[#F4F1ED] rounded-2xl p-6 border-l-4 border-[#A64D32] relative shadow-sm border border-[#E5E0D8]">
                <Quote className="w-8 h-8 text-[#A64D32]/20 absolute top-4 right-4" />
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A64D32]">
                  {t('mission.mottoLabel')}
                </div>
                <blockquote className="text-xl font-serif font-semibold italic text-[#2A2A2A] mt-1">
                  "{t('mission.mottoText')}"
                </blockquote>
              </div>
            </AnimatedSection>
          </div>

          {/* Right Image Showcase */}
          <div className="lg:col-span-5 relative">
            <AnimatedSection direction="left" delayMs={200}>
              <div className="relative rounded-3xl overflow-hidden shadow-2xl border-4 border-[#FDFBF7] transform rotate-1 hover:rotate-0 transition-transform duration-300">
                <img
                  src={IMAGES.communitySign}
                  alt="Community Members with Sign"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-[400px] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-white text-xs sm:text-sm font-medium bg-black/50 backdrop-blur-md p-3 rounded-xl border border-white/10">
                  "Different cultures but ONE community" — West Texas Heritage Festival
                </div>
              </div>

              {/* Decorative Overlay Badge */}
              <div className="absolute -bottom-6 -left-6 bg-[#A64D32] text-white p-4 rounded-2xl shadow-xl flex items-center gap-3">
                <Sparkles className="w-7 h-7 text-amber-200" />
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-widest text-amber-100">Est. 2018</div>
                  <div className="text-sm font-bold">501(c)(3) Registered</div>
                </div>
              </div>
            </AnimatedSection>
          </div>

        </div>

        {/* 3 Core Pillars Cards */}
        <div className="pt-8">
          <AnimatedSection direction="up" delayMs={100}>
            <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
              <h3 className="text-2xl sm:text-4xl font-serif font-bold text-[#2A2A2A]">
                {t('mission.impactHeading')}
              </h3>
              <p className="text-[#5A5A5A]">
                Connecting West Texans through shared meals, conversations, and meaningful service.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Pillar 1: Cooking Classes */}
            <AnimatedSection direction="up" delayMs={150}>
              <div className="bg-[#F4F1ED] rounded-3xl p-8 border border-[#E5E0D8] shadow-sm hover:shadow-md transition-all hover:-translate-y-1 group h-full">
                <div className="w-14 h-14 rounded-2xl bg-[#A64D32] text-white flex items-center justify-center mb-6 shadow-md shadow-[#A64D32]/20 group-hover:scale-110 transition-transform">
                  <Utensils className="w-7 h-7" />
                </div>
                <h4 className="text-xl font-serif font-bold text-[#2A2A2A] mb-3">
                  {t('mission.cookingClasses')}
                </h4>
                <p className="text-[#5A5A5A] text-sm leading-relaxed">
                  {t('mission.cookingDesc')}
                </p>
              </div>
            </AnimatedSection>

            {/* Pillar 2: Ladies Coffee */}
            <AnimatedSection direction="up" delayMs={250}>
              <div className="bg-[#F4F1ED] rounded-3xl p-8 border border-[#E5E0D8] shadow-sm hover:shadow-md transition-all hover:-translate-y-1 group h-full">
                <div className="w-14 h-14 rounded-2xl bg-[#5B6346] text-white flex items-center justify-center mb-6 shadow-md shadow-[#5B6346]/20 group-hover:scale-110 transition-transform">
                  <Coffee className="w-7 h-7" />
                </div>
                <h4 className="text-xl font-serif font-bold text-[#2A2A2A] mb-3">
                  {t('mission.coffeeNights')}
                </h4>
                <p className="text-[#5A5A5A] text-sm leading-relaxed">
                  {t('mission.coffeeDesc')}
                </p>
              </div>
            </AnimatedSection>

            {/* Pillar 3: Relief Drives */}
            <AnimatedSection direction="up" delayMs={350}>
              <div className="bg-[#F4F1ED] rounded-3xl p-8 border border-[#E5E0D8] shadow-sm hover:shadow-md transition-all hover:-translate-y-1 group h-full">
                <div className="w-14 h-14 rounded-2xl bg-[#A64D32] text-white flex items-center justify-center mb-6 shadow-md shadow-[#A64D32]/20 group-hover:scale-110 transition-transform">
                  <HeartHandshake className="w-7 h-7" />
                </div>
                <h4 className="text-xl font-serif font-bold text-[#2A2A2A] mb-3">
                  {t('mission.reliefDrives')}
                </h4>
                <p className="text-[#5A5A5A] text-sm leading-relaxed">
                  {t('mission.reliefDesc')}
                </p>
              </div>
            </AnimatedSection>

          </div>
        </div>

      </div>
    </section>
  );
};
