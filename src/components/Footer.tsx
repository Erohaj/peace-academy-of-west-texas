import React from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, Globe, Mail, MapPin, ShieldCheck, Instagram, Facebook, Twitter } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { PAWTXLogo } from './PAWTXLogo';

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
            <div
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <PAWTXLogo className="w-12 h-12 group-hover:scale-105 transition-transform" showText={false} />
            </div>

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
            <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-[#A64D32]">
              Navigation
            </h4>
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
            <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-[#A64D32]">
              Community Outreach
            </h4>
            <div className="space-y-2 text-xs text-[#E5E0D8]/80">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#A64D32]" />
                <span>3411 Brentwood Dr, Odessa, TX 79762</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#A64D32]" />
                <span>paowtx@gmail.com</span>
              </div>
              <p className="pt-2 text-[11px] text-white/50">
                Serving Ector & Midland Counties with cultural education and food security programs.
              </p>
            </div>
          </div>

          {/* Language & Contact */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-[#A64D32]">
              Language / Idioma
            </h4>

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

          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-[#A64D32] transition-colors" title="Instagram">
              <Instagram className="w-4 h-4" />
            </a>
            <a href="#" className="hover:text-[#A64D32] transition-colors" title="Facebook">
              <Facebook className="w-4 h-4" />
            </a>
            <a href="#" className="hover:text-[#A64D32] transition-colors" title="Twitter">
              <Twitter className="w-4 h-4" />
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
};
