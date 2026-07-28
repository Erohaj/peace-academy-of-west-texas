import React from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, Globe, Mail, MapPin, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { PAWTXLogo } from './PAWTXLogo';
import { ORG_ADDRESS, ORG_EMAIL, ORG_LINKS } from '../data/orgLinks';

interface FooterProps {
  onOpenContact: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenContact }) => {
  const { t } = useTranslation();
  const { setActiveTab, language, setLanguage, volunteer } = useAppStore();

  return (
    <footer className="bg-[#2A2A2A] text-white pt-16 pb-12 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          {/* Brand Info */}
          <div className="md:col-span-1 space-y-4">
            {/* A button, not a clickable div — it navigates, so it has to be
                reachable by keyboard like every other link in this footer. */}
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              aria-label={t('nav.home')}
              className="flex items-center gap-2 cursor-pointer group pawtx-focus rounded-full"
            >
              <PAWTXLogo
                className="w-12 h-12 group-hover:scale-105 transition-transform"
                showText={false}
                decorative
              />
            </button>

            <p className="text-xs text-[#E5E0D8]/80 leading-relaxed">
              Bridging West Texas cultures through authentic culinary heritage, cross-cultural dialogue, and compassionate volunteer outreach.
            </p>

            <div className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-[11px] text-[#5B6346]/80 font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-[#5B6346]" />
              <span className="text-[#E5E0D8]">501(c)(3) Non-Profit Organization</span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#DE8A6B]">
              Navigation
            </h2>
            <ul className="space-y-2 text-xs text-[#E5E0D8]/80">
              <li>
                <button onClick={() => setActiveTab('home')} className="hover:text-white transition-colors cursor-pointer">
                  {t('nav.home')}
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('gallery')} className="hover:text-white transition-colors cursor-pointer">
                  {t('nav.gallery')}
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('volunteer')} className="hover:text-white transition-colors cursor-pointer">
                  {t('nav.volunteer')}
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('donate')} className="hover:text-white transition-colors cursor-pointer">
                  {t('nav.donate')}
                </button>
              </li>
            </ul>
          </div>

          {/* Regional Reach */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#DE8A6B]">
              Community Outreach
            </h2>
            <div className="space-y-2 text-xs text-[#E5E0D8]/80">
              <a
                href={ORG_LINKS.map}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:text-white transition-colors"
              >
                <MapPin className="w-3.5 h-3.5 text-[#A64D32] shrink-0" />
                <span>{ORG_ADDRESS}</span>
              </a>
              <a
                href={`mailto:${ORG_EMAIL}`}
                className="flex items-center gap-2 hover:text-white transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-[#A64D32] shrink-0" />
                <span>{ORG_EMAIL}</span>
              </a>
              <p className="pt-2 text-[11px] text-white/50">
                Serving Ector & Midland Counties with cultural education and food security programs.
              </p>
            </div>
          </div>

          {/* Language & Contact */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#DE8A6B]">
              Language / Idioma
            </h2>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setLanguage('en')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                  language === 'en'
                    ? 'bg-[#A64D32] border-[#A64D32] text-white'
                    : 'bg-white/5 border-white/10 text-[#E5E0D8] hover:text-white'
                }`}
              >
                English
              </button>

              <button
                onClick={() => setLanguage('es')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                  language === 'es'
                    ? 'bg-[#A64D32] border-[#A64D32] text-white'
                    : 'bg-white/5 border-white/10 text-[#E5E0D8] hover:text-white'
                }`}
              >
                Español
              </button>
            </div>

            <div className="pt-2">
              <button
                onClick={onOpenContact}
                className="w-full bg-white/10 hover:bg-white/20 border border-white/20 text-white py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer"
              >
                {t('nav.contactUs')}
              </button>
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#E5E0D8]/70">
          <p className="flex items-center gap-3">
            <span>© {new Date().getFullYear()} Peace Academy of West Texas. All rights reserved.</span>

            {/* Shown only to staff accounts. This is a convenience, not a
                security control — the panel's writes are gated by RLS on
                profiles.role, which the browser cannot talk its way around. */}
            {volunteer?.role === 'admin' && (
              <button
                onClick={() => setActiveTab('admin')}
                className="text-[#A64D32] hover:text-white transition-colors cursor-pointer font-bold uppercase tracking-wider"
              >
                {t('footer.adminPanel')}
              </button>
            )}
          </p>

        </div>

      </div>
    </footer>
  );
};
