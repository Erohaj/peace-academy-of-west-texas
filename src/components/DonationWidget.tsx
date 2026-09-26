import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageTitleProps, subTitleTag, titleTag } from './pageTitle';
import { Heart, CheckCircle2, ShieldCheck, Sparkles, Lock, ArrowRight, AlertCircle, Mail, MapPin } from 'lucide-react';
import { AnimatedSection } from './AnimatedSection';
import {
  DonationRow,
  createCheckoutSession,
  fetchDonationBySession
} from '../lib/api/donations';
import type { DonationReturn } from '../lib/donationReturn';
import { CONTACT_EMAIL, donationsEnabled, emailEnabled } from '../lib/features';
import { ORG_POSTAL_ADDRESS } from '../data/orgLinks';
import { SITE_NAME } from '../lib/seo';

// Shared by the preset buttons and the impact meter below so both stay in sync.
// The labels carry a Spanish counterpart like every other display string in
// this file — a donor reading Spanish was otherwise shown "$100 Community".
const DONATION_TIERS = [
  { amount: 25, label: 'Seed', labelEs: 'Semilla' },
  { amount: 50, label: 'Scholar', labelEs: 'Becario' },
  { amount: 100, label: 'Community', labelEs: 'Comunidad' },
  { amount: 250, label: 'Benefactor', labelEs: 'Benefactor' },
] as const;

/** How long to keep polling for the webhook to confirm a fresh donation. */
const RECEIPT_POLL_ATTEMPTS = 6;
const RECEIPT_POLL_INTERVAL_MS = 1500;

interface DonationWidgetProps extends PageTitleProps {
  /**
   * What Stripe sent the donor back with, or null on an ordinary visit.
   *
   * Passed in rather than read from the URL here: this component is mounted in
   * two places, the parameters survive only until someone clears them, and a
   * copy that reads them for itself is at the mercy of which copy mounted
   * first. `App` reads them once and clears them once.
   */
  donationReturn?: DonationReturn | null;
}

export const DonationWidget: React.FC<DonationWidgetProps> = ({
  asPageTitle,
  donationReturn = null
}) => {
  const Title = titleTag(asPageTitle);
  const CardTitle = subTitleTag(asPageTitle);
  const { t, i18n } = useTranslation();

  const [frequency, setFrequency] = useState<'one_time' | 'monthly'>('one_time');
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom'>(50);
  const [customAmount, setCustomAmount] = useState<string>('50');
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Populated when Stripe redirects back with ?donation=success|cancelled.
  const [confirmedDonation, setConfirmedDonation] = useState<DonationRow | null>(null);
  const [isConfirming, setIsConfirming] = useState(donationReturn?.status === 'success');

  const isSuccess = donationReturn?.status === 'success';
  const isCancelled = donationReturn?.status === 'cancelled';

  // Stripe redirects the browser and calls the webhook independently, and the
  // redirect usually wins by a second or two. Poll briefly rather than showing
  // "pending" to someone whose payment has in fact gone through.
  useEffect(() => {
    if (!donationReturn) return;

    if (donationReturn.status !== 'success' || !donationReturn.sessionId) {
      setIsConfirming(false);
      return;
    }

    let cancelled = false;
    const sessionId = donationReturn.sessionId;

    (async () => {
      for (let attempt = 0; attempt < RECEIPT_POLL_ATTEMPTS && !cancelled; attempt++) {
        try {
          const donation = await fetchDonationBySession(sessionId);
          if (cancelled) return;

          if (donation) {
            setConfirmedDonation(donation);
            if (donation.status === 'paid') break;
          }
        } catch (error) {
          console.error('[PAWTX] Could not confirm the donation', error);
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, RECEIPT_POLL_INTERVAL_MS));
      }

      if (!cancelled) setIsConfirming(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [donationReturn]);

  const amountToDonate = selectedPreset === 'custom' ? Number(customAmount) || 0 : selectedPreset;

  // Whole dollars for display; the database stores integer cents.
  const confirmedAmount =
    confirmedDonation !== null ? confirmedDonation.amount_cents / 100 : null;

  // A row can exist and still be `pending`: the redirect from Stripe beats the
  // webhook, and the poll above gives up after nine seconds. Only `paid` is a
  // recorded gift, so only `paid` gets a receipt printed for it.
  const isPaid = confirmedDonation?.status === 'paid';

  // What the receipt line may claim depends on what actually happened. The
  // webhook stamps `receipt_sent_at` only once Resend accepted the message, and
  // with VITE_EMAIL_ENABLED off no mail is sent at all — promising a delivery in
  // that case is the same empty promise the flag exists to prevent.
  const receiptNote = !emailEnabled
    ? t('donate.receiptByTeam')
    : confirmedDonation?.receipt_sent_at
      ? t('donate.receiptSent')
      : t('donate.receiptPending');

  // Scale expands past $250 for large custom gifts so the fill bar and tier
  // ticks stay proportionally accurate instead of clipping at 100%. A sqrt
  // curve (rather than linear) spaces out the lower tiers so their tick
  // labels don't collide, while staying monotonic with the fill bar.
  const meterMax = Math.max(DONATION_TIERS[DONATION_TIERS.length - 1].amount, amountToDonate);
  const meterPct = (amount: number) => Math.min(100, (Math.sqrt(amount) / Math.sqrt(meterMax)) * 100);
  const meterFillPct = Math.max(4, meterPct(amountToDonate));

  const selectTier = (amount: number) => {
    setSelectedPreset(amount);
    setCustomAmount(amount.toString());
  };

  // A radiogroup promises arrow-key navigation, so it has to deliver it —
  // announcing the role over four plain buttons tells a screen-reader user the
  // keys work when they do not. Focus follows selection, as it does for a
  // native radio group.
  const tierRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleTierKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = DONATION_TIERS.length - 1;
    let next: number;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }

    event.preventDefault();
    selectTier(DONATION_TIERS[next].amount);
    tierRefs.current[next]?.focus();
  };

  // Roving tabindex: one tab stop for the whole group. With a custom amount
  // typed no tier is checked, so the first one carries the stop.
  const checkedTierIndex = DONATION_TIERS.findIndex(({ amount }) => amount === selectedPreset);
  const tabbableTierIndex = checkedTierIndex === -1 ? 0 : checkedTierIndex;

  const getImpactLabel = (amt: number) => {
    if (amt <= 25) return t('donate.impact25');
    if (amt <= 50) return t('donate.impact50');
    if (amt <= 100) return t('donate.impact100');
    return t('donate.impact250');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (amountToDonate < 1) {
      setCheckoutError(t('donate.minAmountError'));
      return;
    }

    setIsSubmitting(true);
    setCheckoutError(null);

    try {
      const url = await createCheckoutSession({
        amount: amountToDonate,
        frequency,
        donorName,
        donorEmail
      });

      // Full navigation, not a new tab: Stripe's hosted page is the next step
      // of this flow and it redirects back here when it finishes.
      window.location.href = url;
    } catch (error) {
      console.error('[PAWTX] Could not start checkout', error);
      setCheckoutError(t('donate.checkoutError'));
      setIsSubmitting(false);
    }
  };

  return (
    <section id="donate-section" className="py-20 bg-parchment text-graphite relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Section Header */}
        <AnimatedSection direction="up" delayMs={50}>
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 text-olive font-bold text-xs uppercase tracking-[0.2em] bg-olive/10 px-4 py-1.5 rounded-full border border-olive/20">
              <Heart className="w-3.5 h-3.5 fill-terracotta text-terracotta" />
              <span>{t('donate.badge')}</span>
            </div>

            <Title className="text-3xl sm:text-5xl font-serif font-bold text-graphite">
              {t('donate.title')}
            </Title>

            <p className="text-base sm:text-lg text-charcoal max-w-2xl mx-auto">
              {t('donate.subtitle')}
            </p>
          </div>
        </AnimatedSection>

        {/* Donation Interactive Card */}
        <AnimatedSection direction="up" delayMs={150}>
          <div className="bg-aged-paper rounded-[32px] p-6 sm:p-10 border border-warm-taupe shadow-lg relative overflow-hidden">
          
          {isCancelled && (
            <div className="mb-8 flex items-start gap-2.5 bg-terracotta/10 border border-terracotta/25 rounded-2xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-terracotta shrink-0 mt-0.5" />
              <div className="text-xs text-charcoal">
                <div className="font-bold text-terracotta mb-0.5">{t('donate.cancelledTitle')}</div>
                {t('donate.cancelledText')}
              </div>
            </div>
          )}

          {!donationsEnabled ? (
            /* Online payment isn't wired up yet. Show the tax-deductible
               framing and a real way to give, rather than a button that can
               only produce an error. */
            <div className="text-center py-8 space-y-5">
              <div className="w-16 h-16 bg-olive/15 text-olive rounded-2xl flex items-center justify-center mx-auto">
                <Heart className="w-8 h-8" />
              </div>

              <div className="space-y-2 max-w-md mx-auto">
                <CardTitle className="pawtx-card-heading">
                  {t('donate.comingSoonTitle')}
                </CardTitle>
                <p className="text-sm text-charcoal">
                  {t('donate.comingSoonText')}
                </p>
              </div>

              {/* Naming the two ways a gift can actually arrive today, rather
                  than only an address to ask at. Someone who came here to give
                  should not have to open a conversation first. */}
              <div className="grid gap-3 sm:grid-cols-2 text-left max-w-xl mx-auto">
                <div className="bg-parchment border border-warm-taupe rounded-2xl p-5 space-y-2">
                  <div className="flex items-center gap-2 text-graphite font-bold text-xs uppercase tracking-wider">
                    <MapPin className="w-4 h-4 text-olive shrink-0" />
                    <span>{t('donate.offlineByMailTitle')}</span>
                  </div>
                  <p className="text-xs text-charcoal leading-relaxed">
                    {t('donate.offlineByMailText')}
                  </p>
                  <address className="text-xs text-graphite not-italic font-medium leading-relaxed">
                    {SITE_NAME}
                    <br />
                    {ORG_POSTAL_ADDRESS.streetAddress}
                    <br />
                    {ORG_POSTAL_ADDRESS.addressLocality}, {ORG_POSTAL_ADDRESS.addressRegion}{' '}
                    {ORG_POSTAL_ADDRESS.postalCode}
                  </address>
                </div>

                <div className="bg-parchment border border-warm-taupe rounded-2xl p-5 space-y-2">
                  <div className="flex items-center gap-2 text-graphite font-bold text-xs uppercase tracking-wider">
                    <Mail className="w-4 h-4 text-olive shrink-0" />
                    <span>{t('donate.offlineEmailTitle')}</span>
                  </div>
                  <p className="text-xs text-charcoal leading-relaxed">
                    {t('donate.offlineEmailText')}
                  </p>
                </div>
              </div>

              <a
                href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Donation to ${SITE_NAME}`)}`}
                className="inline-flex items-center gap-2 bg-terracotta hover:bg-terracotta-deep text-white px-8 py-3.5 rounded-full text-xs font-bold uppercase tracking-widest transition-colors shadow-md"
              >
                <span>{CONTACT_EMAIL}</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              <div className="flex items-center justify-center gap-2 text-xs text-charcoal pt-2">
                <ShieldCheck className="w-4 h-4 text-olive" />
                <span>{t('donate.taxNote')}</span>
              </div>
            </div>
          ) : !isSuccess ? (
            <form onSubmit={handleSubmit} className="space-y-8">

              {/* Frequency Selector Pills */}
              <div className="grid grid-cols-2 gap-3 p-1.5 bg-parchment rounded-2xl border border-warm-taupe">
                <button
                  type="button"
                  onClick={() => setFrequency('one_time')}
                  className={`py-3 rounded-xl font-bold text-xs sm:text-sm uppercase tracking-wider transition-all cursor-pointer ${
                    frequency === 'one_time'
                      ? 'bg-terracotta text-white shadow-sm'
                      : 'text-charcoal hover:text-graphite'
                  }`}
                >
                  {t('donate.frequencyOneTime')}
                </button>

                <button
                  type="button"
                  onClick={() => setFrequency('monthly')}
                  className={`py-3 rounded-xl font-bold text-xs sm:text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    frequency === 'monthly'
                      ? 'bg-terracotta text-white shadow-sm'
                      : 'text-charcoal hover:text-graphite'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t('donate.frequencyMonthly')}</span>
                </button>
              </div>

              {/* Amount Presets */}
              <div className="space-y-3">
                {/* A span, not a label: a label names one form control, and
                    nothing here is one control. The group is named through
                    aria-labelledby instead. */}
                <span
                  id="donate-tier-label"
                  className="block text-xs font-bold uppercase tracking-[0.2em] text-charcoal"
                >
                  {t('donate.tierLabel')}
                </span>

                <div
                  role="radiogroup"
                  aria-labelledby="donate-tier-label"
                  className="grid grid-cols-2 sm:grid-cols-4 gap-3"
                >
                  {DONATION_TIERS.map(({ amount }, idx) => {
                    const isSelected = selectedPreset === amount;
                    return (
                      <button
                        key={amount}
                        ref={(node) => {
                          tierRefs.current[idx] = node;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={idx === tabbableTierIndex ? 0 : -1}
                        onKeyDown={(event) => handleTierKeyDown(event, idx)}
                        onClick={() => selectTier(amount)}
                        className={`py-4 rounded-2xl border font-serif font-bold text-xl sm:text-2xl transition-all cursor-pointer ${
                          isSelected
                            ? 'border-terracotta bg-terracotta text-white shadow-md scale-[1.02]'
                            : 'border-warm-taupe bg-parchment text-graphite hover:bg-white'
                        }`}
                      >
                        ${amount}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Amount Input */}
                <div className="pt-2">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-charcoal">
                      $
                    </span>
                    <input
                      type="number"
                      min="1"
                      value={customAmount}
                      onChange={(e) => {
                        setSelectedPreset('custom');
                        setCustomAmount(e.target.value);
                      }}
                      // No visible label, so the placeholder cannot be the only
                      // name — a placeholder disappears the moment someone types.
                      aria-label={t('donate.customAmount')}
                      placeholder={t('donate.customAmount')}
                      className="w-full bg-parchment border border-warm-taupe rounded-2xl pl-8 pr-4 py-3 text-base font-bold text-graphite pawtx-focus focus:border-terracotta"
                    />
                  </div>
                </div>
              </div>

              {/* Impact Progress Meter Visualization */}
              <div className="bg-parchment p-5 rounded-2xl border border-warm-taupe space-y-3">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <div className="flex items-center gap-2 text-graphite font-bold">
                    <Sparkles className="w-4 h-4 text-terracotta" />
                    <span>{t('donate.impactTitle')}</span>
                  </div>
                  <span className="font-serif font-bold text-terracotta">
                    ${amountToDonate} {frequency === 'monthly' ? t('donate.perMonth') : ''}
                  </span>
                </div>

                <div className="text-xs sm:text-sm font-medium text-charcoal">
                  {getImpactLabel(amountToDonate)}
                </div>

                {/* Progress bar scale — tick positions are proportional to each
                    tier's actual dollar amount, so they line up with where the
                    fill bar really reaches instead of being evenly spaced. */}
                <div className="pt-1">
                  <div className="w-full bg-warm-taupe h-2.5 rounded-full overflow-hidden p-0.5">
                    <div
                      className="bg-gradient-to-r from-olive via-terracotta to-terracotta-deep h-full rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${meterFillPct}%` }}
                    />
                  </div>
                  <div className="relative h-12 mt-1.5">
                    {DONATION_TIERS.map((tier, idx) => {
                      const leftPct = meterPct(tier.amount);
                      const isReached = amountToDonate >= tier.amount;
                      const edgeAlign =
                        idx === 0 ? 'translate-x-0' : idx === DONATION_TIERS.length - 1 ? '-translate-x-full' : '-translate-x-1/2';
                      // Adjacent low tiers sit close together on the sqrt scale;
                      // staggering labels onto two rows keeps them from colliding.
                      const rowOffset = idx % 2 === 1 ? 'mt-4' : '';
                      return (
                        <div
                          key={tier.amount}
                          className={`absolute top-0 flex flex-col items-center gap-1 ${edgeAlign}`}
                          style={{ left: `${leftPct}%` }}
                        >
                          <span className={`w-1 h-1.5 rounded-full shrink-0 ${isReached ? 'bg-terracotta' : 'bg-[#D6D0C4]'}`} />
                          <span
                            className={`text-[9px] sm:text-[10px] uppercase font-bold tracking-wider whitespace-nowrap ${rowOffset} ${
                              isReached ? 'text-terracotta' : 'text-charcoal'
                            }`}
                          >
                            ${tier.amount}{tier.amount === DONATION_TIERS[DONATION_TIERS.length - 1].amount ? '+' : ''} {i18n.language === 'es' ? tier.labelEs : tier.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Donor Contact Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="pawtx-label">
                    {t('donate.yourName')}
                  </label>
                  <input
                    type="text"
                    value={donorName}
                    onChange={(e) => setDonorName(e.target.value)}
                    placeholder={t('donate.namePlaceholder')}
                    className="pawtx-field"
                  />
                </div>

                <div>
                  <label className="pawtx-label">
                    {t('donate.yourEmail')} *
                  </label>
                  <input
                    type="email"
                    required
                    value={donorEmail}
                    onChange={(e) => setDonorEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="pawtx-field"
                  />
                </div>
              </div>

              {/* Payment is handled entirely on Stripe's hosted page. This
                  form deliberately has no card field: collecting a card number
                  here would put the site inside PCI scope. */}
              <div className="flex items-start gap-2.5 bg-olive/8 border border-olive/20 rounded-2xl px-4 py-3">
                <Lock className="w-4 h-4 text-olive shrink-0 mt-0.5" />
                <span className="text-xs text-charcoal leading-relaxed">{t('donate.secureNote')}</span>
              </div>

              {checkoutError && (
                <div className="pawtx-callout">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{checkoutError}</span>
                </div>
              )}

              {/* Submit Button */}
              <div>
                <button
                  type="submit"
                  disabled={isSubmitting || amountToDonate < 1}
                  className="w-full bg-terracotta hover:bg-terracotta-deep text-white py-4 rounded-full font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-terracotta/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>{t('donate.redirecting')}</span>
                  ) : (
                    <>
                      <span>
                        {frequency === 'monthly'
                          ? t('donate.submitDonationMonthly', { amount: amountToDonate })
                          : t('donate.submitDonation', { amount: amountToDonate })}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {/* Tax Exemption Note */}
              <div className="flex items-center justify-center gap-2 text-xs text-charcoal pt-2">
                <ShieldCheck className="w-4 h-4 text-olive" />
                <span>{t('donate.taxNote')}</span>
              </div>

            </form>
          ) : (
            /* Confirmation screen, reached only by returning from Stripe.
               Every figure below comes from the recorded donation, not from
               the form state the visitor left behind. */
            <div className="text-center py-8 space-y-6 animate-fadeIn">
              <div className="w-20 h-20 bg-olive/20 text-olive rounded-full flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 className="w-12 h-12" />
              </div>

              <div className="space-y-2">
                {/* Not a raw h3: on the donate tab the section title is the h1,
                    and h1 to h3 skips a level in the outline a screen-reader
                    user navigates by. */}
                <CardTitle className="text-3xl font-serif font-bold text-graphite">
                  {t('donate.successTitle')}
                </CardTitle>
                <p className="text-base text-charcoal max-w-md mx-auto">
                  {isPaid && confirmedAmount !== null
                    ? t('donate.successText', { amount: confirmedAmount })
                    : t('donate.awaitingConfirmation')}
                </p>
              </div>

              {/* Keyed off `paid`, not off the row existing: a pending row is
                  found long before the webhook confirms it, and hiding this
                  line then stops telling the donor anything is still happening. */}
              {isConfirming && !isPaid && (
                <p className="text-xs text-charcoal">{t('donate.confirming')}</p>
              )}

              {isPaid && confirmedAmount !== null && (
                <div className="bg-parchment p-6 rounded-2xl border border-warm-taupe text-left max-w-sm mx-auto space-y-2 text-xs text-graphite">
                  <div className="font-bold border-b border-warm-taupe pb-2 text-sm font-serif">
                    {t('donate.receiptTitle')}
                  </div>
                  <div>{t('donate.receiptDonor')}: {confirmedDonation.donor_name || '—'}</div>
                  <div>
                    {t('donate.receiptAmount')}: ${confirmedAmount}
                    {confirmedDonation.frequency === 'monthly' ? ` ${t('donate.perMonth')}` : ''}
                  </div>
                  <div>{t('donate.receiptOrg')}: Peace Academy of West Texas (501(c)(3))</div>
                  {/* The tax ID is deliberately absent here. It belongs on the
                      emailed receipt, which the webhook renders from the real
                      EIN; printing a placeholder would forge an official
                      document. */}
                  <div className="pt-1 text-charcoal">{receiptNote}</div>
                </div>
              )}

              <button
                onClick={() => window.location.reload()}
                className="bg-graphite hover:bg-black text-white px-8 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer"
              >
                {t('donate.makeAnother')}
              </button>
            </div>
          )}

          </div>
        </AnimatedSection>

      </div>
    </section>
  );
};
