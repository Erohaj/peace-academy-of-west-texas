import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share2, Check } from 'lucide-react';
import { PAWTXEvent } from '../types';
import { useAppStore } from '../store/useAppStore';
import { eventShareUrl, shareEvent, ShareOutcome } from '../lib/eventShare';

interface ShareEventButtonProps {
  event: PAWTXEvent;
  /**
   * `full` is a labelled pill, for the action stacks where the buttons beside
   * it are labelled too — the confirmation screens and the details dialog.
   *
   * `compact` is the icon alone, for the event card: the grid shows these
   * three to a row, and a third full-width button on each would push the next
   * row of events further down every screen on the site.
   */
  variant?: 'full' | 'compact';
}

/**
 * Passing an event on to somebody else.
 *
 * Offered in three places, because sharing happens at two different moments
 * and they are not the same person's. Someone browsing the events sends one
 * to a friend who would like it — that is the card and the details dialog.
 * Someone who has just registered says "come with me" — that is the two
 * confirmation screens, free and prepaid, which are one moment rendered twice
 * because Stripe takes the browser away in between.
 */
export const ShareEventButton: React.FC<ShareEventButtonProps> = ({
  event,
  variant = 'full'
}) => {
  const { t } = useTranslation();
  const language = useAppStore((state) => state.language);
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);

  const title = language === 'es' ? event.titleEs : event.title;

  // Say so for a few seconds, then go back to offering. A button stuck on
  // "Link copied" cannot be used a second time without a reload, and the
  // person inviting two friends is exactly who this is for.
  useEffect(() => {
    if (outcome !== 'copied') return;

    const timer = window.setTimeout(() => setOutcome(null), 4000);
    return () => window.clearTimeout(timer);
  }, [outcome]);

  const handleShare = async () => {
    // Cleared first so a second copy re-runs the timer above rather than
    // landing on the same value and leaving the old one to expire.
    setOutcome(null);

    const result = await shareEvent({
      title,
      text: t('eventShare.message', {
        title,
        date: event.date,
        location: event.location
      }),
      url: eventShareUrl(event)
    });

    // The share sheet has already spoken for itself, and a dismissal is not
    // something to comment on. Only the two outcomes that change nothing on
    // screen need a word from us.
    setOutcome(result === 'copied' || result === 'failed' ? result : null);
  };

  const copied = outcome === 'copied';
  const failed = outcome === 'failed';

  const Icon = copied ? Check : Share2;

  // The compact button has no label to change, so its accessible name carries
  // the outcome instead — including the failure, which otherwise has nowhere
  // to go in a row of card buttons without pushing the grid about.
  const accessibleName = copied
    ? t('eventShare.copied')
    : failed
      ? t('eventShare.failed')
      : t('eventShare.button');

  if (variant === 'compact') {
    return (
      <>
        <button
          type="button"
          onClick={() => void handleShare()}
          aria-label={accessibleName}
          title={accessibleName}
          className={`shrink-0 px-4 py-2.5 rounded-full border transition-colors cursor-pointer pawtx-focus flex items-center justify-center ${
            failed
              ? 'border-terracotta text-terracotta'
              : 'border-warm-taupe hover:bg-warm-taupe text-graphite'
          }`}
        >
          <Icon
            className={`w-4 h-4 ${copied ? 'text-olive' : failed ? 'text-terracotta' : 'text-olive'}`}
            aria-hidden="true"
          />
        </button>

        <span role="status" aria-live="polite" className="sr-only">
          {copied || failed ? accessibleName : ''}
        </span>
      </>
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => void handleShare()}
        className="w-full border border-warm-taupe hover:bg-aged-paper text-graphite py-2.5 px-6 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer pawtx-focus"
      >
        <Icon className={`w-4 h-4 ${copied ? 'text-olive' : 'text-olive'}`} aria-hidden="true" />
        <span>{copied ? t('eventShare.copied') : t('eventShare.button')}</span>
      </button>

      {/* The label swap above is silent to a screen reader unless the button
          happens to hold focus, so the outcome is announced here instead. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? t('eventShare.copied') : ''}
      </span>

      {/* Failure needs more than a word: there is nothing on the clipboard, so
          it has to say where the link can be got instead. */}
      {failed && (
        <p className="text-[11px] text-terracotta leading-relaxed text-center">
          {t('eventShare.failed')}
        </p>
      )}
    </div>
  );
};
