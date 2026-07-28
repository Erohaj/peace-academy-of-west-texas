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
  /** Colour of the second wordmark line. Terracotta fails on a dark bar. */
  subTextColor?: string;
}

export const PAWTXLogo: React.FC<LogoProps> = ({
  className = "w-12 h-12",
  showText = false,
  textColor = "text-graphite",
  decorative = false,
  subTextColor = "text-terracotta"
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

      {/* The wordmark. Two lines because the full name on one runs ~330px,
          which the header row cannot spare — stacked it is ~140px.
          From md, not sm: at 640px the search, language and donate controls
          have just appeared and Spanish had 5px of slack left, which is not a
          margin so much as a coincidence. Below md the badge stands alone. */}
      {showText && (
        <div className="hidden md:block text-left">
          {/* Same lockup as the shield: condensed gothic, all caps, the second
              line smaller and letter-spaced under the first. */}
          <span
            className={`block font-wordmark font-semibold text-lg uppercase tracking-wide leading-none whitespace-nowrap ${textColor}`}
          >
            Peace Academy
          </span>
          <span
            className={`block font-wordmark font-medium text-2xs uppercase tracking-[0.18em] leading-tight whitespace-nowrap ${subTextColor}`}
          >
            of West Texas
          </span>
        </div>
      )}
    </div>
  );
};
