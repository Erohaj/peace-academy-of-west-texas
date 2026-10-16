import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share2, Check } from 'lucide-react';
import { PAWTXEvent } from '../types';
import { useAppStore } from '../store/useAppStore';
import { eventShareUrl, shareEvent, ShareOutcome } from '../lib/eventShare';

/**
 * "Come with me" — offered on the two screens that confirm a place.
 *
 * Somebody who has just registered is the one person on the site with a
 * reason to tell a friend, and the moment they are handed a confirmation is
 * the moment they have it. Before this, that impulse had nowhere to go but
 * copying whatever was in the address bar, which pointed at the home page.
 *
 * Shared by the free path's success screen (RSVPModal) and the prepaid path's
 * (TicketReturn), which are the same moment rendered in two places because
 * Stripe takes the browser away in between.
 */
export const ShareEventButton: React.FC<{ event: PAWTXEvent }> = ({ event }) => {
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

  return (
    <div className="space-y-1.5">
      <button
        onClick={() => void handleShare()}
        className="w-full border border-warm-taupe hover:bg-aged-paper text-graphite py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer pawtx-focus"
      >
        {copied ? (
          <Check className="w-4 h-4 text-olive" aria-hidden="true" />
        ) : (
          <Share2 className="w-4 h-4 text-olive" aria-hidden="true" />
        )}
        <span>{copied ? t('eventShare.copied') : t('eventShare.button')}</span>
      </button>

      {/* The label swap above is silent to a screen reader unless the button
          happens to hold focus, so the outcome is announced here instead. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? t('eventShare.copied') : ''}
      </span>

      {/* Failure needs more than a word: there is nothing on the clipboard, so
          it has to say where the link can be got instead. */}
      {outcome === 'failed' && (
        <p className="text-[11px] text-terracotta leading-relaxed text-center">
          {t('eventShare.failed')}
        </p>
      )}
    </div>
  );
};
