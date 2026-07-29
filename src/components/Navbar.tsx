import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Heart, Menu, X, UserCheck, Calendar, Image as ImageIcon, Home, Mail, Search, Share2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ActiveTab } from '../types';
import { PAWTXLogo } from './PAWTXLogo';

interface NavbarProps {
  onOpenContact?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenContact }) => {
  const { t } = useTranslation();
  const { activeTab, setActiveTab, language, setLanguage, isLoggedIn, volunteer, openSearch } = useAppStore();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // The translucent dark treatment only reads correctly over the home hero
  // photo. Every other tab opens on a cream background (and setActiveTab
  // scrolls to top), so those need the solid light bar from the start.
  const isSolid = isScrolled || activeTab !== 'home';

  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: t('nav.home'), icon: <Home className="w-4 h-4" /> },
    { id: 'events', label: t('nav.events'), icon: <Calendar className="w-4 h-4" /> },
    { id: 'social', label: t('nav.social'), icon: <Share2 className="w-4 h-4" /> },
    { id: 'gallery', label: t('nav.gallery'), icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'volunteer', label: t('nav.volunteer'), icon: <UserCheck className="w-4 h-4" /> },
  ];

  const handleNavClick = (tab: ActiveTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    if (tab === 'social') {
      setTimeout(() => {
        const elem = document.getElementById('social-feed-section');
        if (elem) {
          elem.scrollIntoView({ behavior: 'smooth' });
        }
      }, 50);
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'es' : 'en');
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isSolid
          ? 'bg-parchment/95 backdrop-blur-md shadow-sm border-b border-warm-taupe'
          : 'bg-gradient-to-b from-black/80 via-black/40 to-transparent text-white'
      }`}
    >
      {/* Wider than the max-w-7xl the page content uses. The wordmark next to
          the logo costs ~150px, which the 1216px content box could not spare —
          Spanish wanted 1279px of it. A header bar is not body copy and does
          not need the reading-width cap; the sections below keep it. */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* `gap-2` is a floor, not decoration: justify-between only spaces the
            groups apart while there is slack, and at the tightest width where
            the full row shows (Spanish at 1440px) there are ~55px of it.
            Without the gap the logo ends up touching the first link. */}
        <div className="flex items-center justify-between h-20 gap-2">

          {/* Logo & Brand. This is the first tab stop on every page, and it
              used to kill its own outline without replacing it and announce
              itself as "…Logo, button" off the image's alt text. The button is
              named for what it does; the image inside it is decoration. */}
          <button
            onClick={() => handleNavClick('home')}
            aria-label={t('nav.home')}
            className="flex items-center gap-3 text-left group cursor-pointer pawtx-focus rounded-full"
          >
            <PAWTXLogo
              className="w-12 h-12 transition-transform group-hover:scale-105"
              showText
              decorative
              // Three bands, because the right-hand side of this row is not
              // the same set of controls at every width, and the wordmark
              // used to be gated on the worst of them:
              //
              //  - 360px to sm: shown. Below sm the row carries only the
              //    compact search, language and hamburger icons — 123px
              //    together — leaving 131px, and the wordmark needs 110px.
              //    This band was hidden along with the crowded one below it,
              //    which is why a phone, the way most people reach this site,
              //    got a badge with no name on it.
              //  - sm to md (640–767px): hidden. The full pill cluster has
              //    appeared here (search + language + "Donaciones" = 336px)
              //    and the wordmark leaves 10px of slack in Spanish; the
              //    logged-in volunteer's name badge then adds 124px and puts
              //    the row 124px over. There is nothing to give in this band.
              //  - md and up: shown, as it always was.
              //
              // Under 360px the badge stands alone: the name does not fit
              // there even at the smaller size, and half of it is worse than
              // none. Measured at 360/640 in both languages.
              textVisibilityClassName="hidden min-[360px]:max-sm:block md:block"
              // Over the hero photo the bar is a dark gradient; on every other
              // tab it is solid parchment. Terracotta on the second line is
              // unreadable against the former.
              textColor={isSolid ? 'text-graphite' : 'text-white'}
              subTextColor={isSolid ? 'text-terracotta' : 'text-terracotta-soft'}
            />
          </button>

          {/* Desktop Navigation Links.
              The labels are longest in Spanish ("Portal de Voluntarios",
              "Galería de Fotos"), and they set the width of this whole row.
              With per-link icons the Spanish row wanted 1364px and could not
              fit at any window size, which is why the labels used to break onto
              two lines; dropping the icons here bought back ~130px and the
              search label another ~70px. The drawer below keeps its icons,
              since it has a full row per item.

              Adding the wordmark to the logo then cost ~150px back, taking
              Spanish to ~1279px. That is why the container above is no longer
              capped at max-w-7xl and why this row appears at 1440px rather than
              xl — measured, with ~55px of Spanish slack. `whitespace-nowrap`
              guarantees the fix rather than trusting the measurement to hold.
              Below 1440px the hamburger carries the nav; the wordmark has its
              own three bands, described at the PAWTXLogo call above. */}
          <nav className="hidden min-[1440px]:flex items-center gap-1 lg:gap-2">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`px-3 py-2 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-terracotta text-white shadow-sm'
                      : isSolid
                      ? 'text-graphite hover:bg-aged-paper hover:text-terracotta'
                      : 'text-white/90 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}

            {onOpenContact && (
              <button
                onClick={onOpenContact}
                className={`px-3 py-2 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
                  isSolid
                    ? 'text-graphite hover:bg-aged-paper hover:text-terracotta'
                    : 'text-white/90 hover:text-white hover:bg-white/10'
                }`}
              >
                {t('nav.contactUs')}
              </button>
            )}
          </nav>

          {/* Right Actions: Search, Language Switcher & Quick CTA.
              Below 1440px the nav collapses and justify-between has only three
              groups left to spread, which stranded this cluster in the middle
              of the bar with the hamburger far off to its right. `ml-auto`
              takes the slack so it sits next to the hamburger instead; above
              that the nav is back and the even spacing is what we want, so it
              is switched off again. */}
          <div className="hidden sm:flex items-center gap-2.5 ml-auto min-[1440px]:ml-0">
            {/* Global Search Trigger Button */}
            <button
              onClick={openSearch}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-2 border cursor-pointer ${
                isSolid
                  ? 'border-warm-taupe bg-parchment text-graphite hover:bg-aged-paper hover:border-terracotta'
                  : 'border-white/40 bg-black/30 text-white hover:bg-black/50 hover:border-white'
              }`}
              title="Search (Cmd+K)"
              // The "Search..."/"Buscar..." label used to sit here. It is the
              // one control in the row whose width depends on the language, and
              // the ~70px it took were exactly what pushed the Spanish row past
              // the container. The magnifier and the ⌘K badge already say what
              // the button does; the accessible name is on aria-label.
              aria-label={language === 'es' ? 'Buscar' : 'Search'}
            >
              <Search className="w-3.5 h-3.5 text-terracotta" />
              <kbd className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                isSolid ? 'bg-warm-taupe text-charcoal' : 'bg-white/20 text-white'
              }`}>
                ⌘K
              </kbd>
            </button>

            {/* Language Toggle Button */}
            <button
              onClick={toggleLanguage}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wider transition-all flex items-center gap-1.5 border cursor-pointer ${
                isSolid
                  ? 'border-warm-taupe bg-parchment text-graphite hover:bg-aged-paper'
                  : 'border-white/40 bg-black/30 text-white hover:bg-black/50'
              }`}
              title="Switch Language"
            >
              <Globe className="w-3.5 h-3.5 text-terracotta" />
              <span>{language.toUpperCase()}</span>
              {/* An explicit grey rather than opacity: at 60% this resolved to
                  #7E7E7C on parchment, which is 3.9:1 and fails AA for text
                  this small. #6B6B69 still reads as the inactive option. */}
              <span className="text-[10px] text-[#6B6B69]">| {language === 'en' ? 'ES' : 'EN'}</span>
            </button>

            {/* Quick Donate Button */}
            <button
              onClick={() => handleNavClick('donate')}
              className="bg-terracotta hover:bg-terracotta-deep text-white px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all shadow-md hover:scale-[1.02] flex items-center gap-2 cursor-pointer"
            >
              <Heart className="w-4 h-4 fill-white/20" />
              <span>{t('nav.donate')}</span>
            </button>

            {/* Volunteer Logged In Status Badge */}
            {isLoggedIn && (
              <button
                onClick={() => handleNavClick('volunteer')}
                className="bg-olive text-white text-xs font-bold uppercase tracking-wider px-3.5 py-2 rounded-full flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span className="max-w-[80px] truncate">{volunteer?.fullName.split(' ')[0]}</span>
              </button>
            )}
          </div>

          {/* Compact controls. The hamburger carries the nav below xl; search
              and language duplicate the row above, so they drop away once that
              row appears at sm. */}
          <div className="flex items-center gap-2 min-[1440px]:hidden">
            <button
              onClick={openSearch}
              className={`p-2 rounded-full border transition-colors sm:hidden ${
                isSolid ? 'border-warm-taupe text-graphite' : 'border-white/40 text-white'
              }`}
              title="Search"
            >
              <Search className="w-4 h-4 text-terracotta" />
            </button>

            <button
              onClick={toggleLanguage}
              className={`px-2.5 py-1 rounded-full text-xs font-bold border sm:hidden ${
                isSolid ? 'border-warm-taupe text-graphite' : 'border-white/40 text-white'
              }`}
            >
              {language.toUpperCase()}
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`p-2 rounded-lg transition-colors ${
                isSolid ? 'text-graphite hover:bg-aged-paper' : 'text-white hover:bg-white/10'
              }`}
              aria-label="Toggle Navigation"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="min-[1440px]:hidden bg-parchment border-b border-warm-taupe shadow-xl px-4 pt-3 pb-6 space-y-2 animate-fadeIn">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-3 ${
                  isActive
                    ? 'bg-terracotta text-white'
                    : 'text-graphite hover:bg-aged-paper'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}

          {onOpenContact && (
            <button
              onClick={() => {
                onOpenContact();
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider text-graphite hover:bg-aged-paper flex items-center gap-3"
            >
              <Mail className="w-4 h-4 text-terracotta" />
              {t('nav.contactUs')}
            </button>
          )}

          <div className="pt-3 border-t border-warm-taupe flex flex-col gap-2">
            <button
              onClick={() => handleNavClick('donate')}
              className="w-full bg-terracotta text-white py-3 rounded-full font-bold text-xs uppercase tracking-widest text-center flex items-center justify-center gap-2 shadow-sm"
            >
              <Heart className="w-5 h-5 fill-white/20" />
              <span>{t('nav.donate')}</span>
            </button>

            <button
              onClick={toggleLanguage}
              className="w-full border border-warm-taupe text-graphite py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <Globe className="w-4 h-4 text-terracotta" />
              <span>{t('nav.switchLanguage')}</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

