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
  /**
   * Which widths the wordmark shows at. Whether the name fits beside the
   * badge is a fact about the row the lockup was dropped into, not about the
   * lockup — the header has to share its row with a nav, a control cluster
   * and a hamburger that each appear at a different breakpoint, while the
   * error card is a centred box with room to spare. So the caller owns this.
   * The default is the conservative one: badge alone until md.
   */
  textVisibilityClassName?: string;
}

export const PAWTXLogo: React.FC<LogoProps> = ({
  className = "w-12 h-12",
  showText = false,
  textColor = "text-graphite",
  decorative = false,
  subTextColor = "text-terracotta",
  textVisibilityClassName = "hidden md:block"
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
          which the header row cannot spare — stacked it is ~124px.
          `textVisibilityClassName` decides which widths it appears at; see
          the caller. */}
      {showText && (
        <div className={`${textVisibilityClassName} text-left min-w-0 overflow-hidden`}>
          {/* Same lockup as the shield: condensed gothic, all caps, the second
              line smaller and letter-spaced under the first.

              16px until md, not 18px, and it is the fallback font that sets
              that, not taste. Oswald is loaded with `display=swap`, so the
              first paint — and every paint, if Google Fonts is blocked or
              times out — uses the system sans, which is 19% wider: 147px at
              18px against the 131px the header has at 360px. At 16px it fits
              unstyled too. `min-w-0 overflow-hidden` above is the belt to
              that braces: if a wider face than either turns up, the wordmark
              clips at its own edge instead of shunting the row's controls
              off-screen. */}
          <span
            className={`block font-wordmark font-semibold text-base md:text-lg uppercase tracking-wide leading-none whitespace-nowrap ${textColor}`}
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
