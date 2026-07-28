import React from 'react';
import logoImg from '../assets/logo.webp';

interface LogoProps {
  className?: string;
  showText?: boolean;
  textColor?: string;
  /**
   * Set when the logo sits inside an element that already has an accessible
   * name — the header and footer home buttons. Repeating the org name there
   * makes the control announce as "Peace Academy of West Texas Logo, button"
   * instead of "Home, button".
   */
  decorative?: boolean;
}

export const PAWTXLogo: React.FC<LogoProps> = ({
  className = "w-12 h-12",
  showText = false,
  textColor = "text-graphite",
  decorative = false
}) => {
  return (
    <div className="flex items-center gap-2.5">
      {/* Official Peace Academy of West Texas Shield Badge */}
      <img
        src={logoImg}
        alt={decorative ? '' : 'Peace Academy of West Texas Logo'}
        loading="eager"
        decoding="async"
        className={`${className} object-contain rounded-xl bg-white p-0.5 shadow-sm ring-1 ring-black/5`}
      />

      {/* Optional extra text if explicitly requested, but default is false so only the logo badge displays */}
      {showText && (
        <div className="hidden sm:block">
          <span className={`block font-serif font-bold text-base tracking-tight leading-none ${textColor}`}>
            PEACE ACADEMY
          </span>
          <span className="block text-[9px] font-bold uppercase tracking-[0.2em] text-terracotta">
            WEST TEXAS
          </span>
        </div>
      )}
    </div>
  );
};
