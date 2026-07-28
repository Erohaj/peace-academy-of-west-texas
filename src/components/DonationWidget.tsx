import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageTitleProps, subTitleTag, titleTag } from './pageTitle';
import { Heart, CheckCircle2, ShieldCheck, Sparkles, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { AnimatedSection } from './AnimatedSection';
import {
  DonationRow,
  createCheckoutSession,
  fetchDonationBySession
} from '../lib/api/donations';
import { clearDonationParams, readDonationReturn } from '../lib/donationReturn';
import { CONTACT_EMAIL, donationsEnabled } from '../lib/features';

// Shared by the preset buttons and the impact meter below so both stay in sync.
const DONATION_TIERS = [
  { amount: 25, label: 'Seed' },
  { amount: 50, label: 'Scholar' },
  { amount: 100, label: 'Community' },
  { amount: 250, label: 'Benefactor' },
] as const;

/** How long to keep polling for the webhook to confirm a fresh donation. */
const RECEIPT_POLL_ATTEMPTS = 6;
const RECEIPT_POLL_INTERVAL_MS = 1500;

export const DonationWidget: React.FC<PageTitleProps> = ({ asPageTitle }) => {
  const Title = titleTag(asPageTitle);
  const CardTitle = subTitleTag(asPageTitle);
  const { t } = useTranslation();

  const [frequency, setFrequency] = useState<'one_time' | 'monthly'>('one_time');
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom'>(50);
  const [customAmount, setCustomAmount] = useState<string>('50');
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Populated when Stripe redirects back with ?donation=success|cancelled.
  const [donationReturn] = useState(() => readDonationReturn());
  const [confirmedDonation, setConfirmedDonation] = useState<DonationRow | null>(null);
  const [isConfirming, setIsConfirming] = useState(donationReturn?.status === 'success');

  const isSuccess = donationReturn?.status === 'success';
  const isCancelled = donationReturn?.status === 'cancelled';

  // Stripe redirects the browser and calls the webhook independently, and the
  // redirect usually wins by a second or two. Poll briefly rather than showing
  // "pending" to someone whose payment has in fact gone through.
  useEffect(() => {
    if (!donationReturn) return;

    clearDonationParams();

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

  // Scale expands past $250 for large custom gifts so the fill bar and tier
  // ticks stay proportionally accurate instead of clipping at 100%. A sqrt
  // curve (rather than linear) spaces out the lower tiers so their tick
  // labels don't collide, while staying monotonic with the fill bar.
  const meterMax = Math.max(DONATION_TIERS[DONATION_TIERS.length - 1].amount, amountToDonate);
  const meterPct = (amount: number) => Math.min(100, (Math.sqrt(amount) / Math.sqrt(meterMax)) * 100);
  const meterFillPct = Math.max(4, meterPct(amountToDonate));

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
    <section id="donate-section" className="py-20 bg-[#FDFBF7] text-[#2A2A2A] relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Section Header */}
        <AnimatedSection direction="up" delayMs={50}>
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 text-[#5B6346] font-bold text-xs uppercase tracking-[0.2em] bg-[#5B6346]/10 px-4 py-1.5 rounded-full border border-[#5B6346]/20">
              <Heart className="w-3.5 h-3.5 fill-[#A64D32] text-[#A64D32]" />
              <span>501(c)(3) Tax Deductible</span>
            </div>

            <Title className="text-3xl sm:text-5xl font-serif font-bold text-[#2A2A2A]">
              {t('donate.title')}
            </Title>

            <p className="text-base sm:text-lg text-[#5A5A5A] max-w-2xl mx-auto">
              {t('donate.subtitle')}
            </p>
          </div>
        </AnimatedSection>

        {/* Donation Interactive Card */}
        <AnimatedSection direction="up" delayMs={150}>
          <div className="bg-[#F4F1ED] rounded-[32px] p-6 sm:p-10 border border-[#E5E0D8] shadow-lg relative overflow-hidden">
          
          {isCancelled && (
            <div className="mb-8 flex items-start gap-2.5 bg-[#A64D32]/10 border border-[#A64D32]/25 rounded-2xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-[#A64D32] shrink-0 mt-0.5" />
              <div className="text-xs text-[#5A5A5A]">
                <div className="font-bold text-[#A64D32] mb-0.5">{t('donate.cancelledTitle')}</div>
                {t('donate.cancelledText')}
              </div>
            </div>
          )}

          {!donationsEnabled ? (
            /* Online payment isn't wired up yet. Show the tax-deductible
               framing and a real way to give, rather than a button that can
               only produce an error. */
            <div className="text-center py-8 space-y-5">
              <div className="w-16 h-16 bg-[#5B6346]/15 text-[#5B6346] rounded-2xl flex items-center justify-center mx-auto">
                <Heart className="w-8 h-8" />
              </div>

              <div className="space-y-2 max-w-md mx-auto">
                <CardTitle className="text-2xl font-serif font-bold text-[#2A2A2A]">
                  {t('donate.comingSoonTitle')}
                </CardTitle>
                <p className="text-sm text-[#5A5A5A]">
                  {t('donate.comingSoonText')}
                </p>
              </div>

              <a
                href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Donation to Peace Academy of West Texas')}`}
                className="inline-flex items-center gap-2 bg-[#A64D32] hover:bg-[#8b3f28] text-white px-8 py-3.5 rounded-full text-xs font-bold uppercase tracking-widest transition-colors shadow-md"
              >
                <span>{CONTACT_EMAIL}</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              <div className="flex items-center justify-center gap-2 text-xs text-[#5A5A5A] pt-2">
                <ShieldCheck className="w-4 h-4 text-[#5B6346]" />
                <span>{t('donate.taxNote')}</span>
              </div>
            </div>
          ) : !isSuccess ? (
            <form onSubmit={handleSubmit} className="space-y-8">

              {/* Frequency Selector Pills */}
              <div className="grid grid-cols-2 gap-3 p-1.5 bg-[#FDFBF7] rounded-2xl border border-[#E5E0D8]">
                <button
                  type="button"
                  onClick={() => setFrequency('one_time')}
                  className={`py-3 rounded-xl font-bold text-xs sm:text-sm uppercase tracking-wider transition-all cursor-pointer ${
                    frequency === 'one_time'
                      ? 'bg-[#A64D32] text-white shadow-sm'
                      : 'text-[#5A5A5A] hover:text-[#2A2A2A]'
                  }`}
                >
                  {t('donate.frequencyOneTime')}
                </button>

                <button
                  type="button"
                  onClick={() => setFrequency('monthly')}
                  className={`py-3 rounded-xl font-bold text-xs sm:text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    frequency === 'monthly'
                      ? 'bg-[#A64D32] text-white shadow-sm'
                      : 'text-[#5A5A5A] hover:text-[#2A2A2A]'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t('donate.frequencyMonthly')}</span>
                </button>
              </div>

              {/* Amount Presets */}
              <div className="space-y-3">
                <label className="block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A]">
                  Select Contribution Tier
                </label>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {DONATION_TIERS.map(({ amount }) => {
                    const isSelected = selectedPreset === amount;
                    return (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => {
                          setSelectedPreset(amount);
                          setCustomAmount(amount.toString());
                        }}
                        className={`py-4 rounded-2xl border font-serif font-bold text-xl sm:text-2xl transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#A64D32] bg-[#A64D32] text-white shadow-md scale-[1.02]'
                            : 'border-[#E5E0D8] bg-[#FDFBF7] text-[#2A2A2A] hover:bg-white'
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
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[#5A5A5A]">
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
                      placeholder="Custom Amount"
                      className="w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-2xl pl-8 pr-4 py-3 text-base font-bold text-[#2A2A2A] pawtx-focus focus:border-[#A64D32]"
                    />
                  </div>
                </div>
              </div>

              {/* Impact Progress Meter Visualization */}
              <div className="bg-[#FDFBF7] p-5 rounded-2xl border border-[#E5E0D8] space-y-3">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <div className="flex items-center gap-2 text-[#2A2A2A] font-bold">
                    <Sparkles className="w-4 h-4 text-[#A64D32]" />
                    <span>Your Estimated Impact</span>
                  </div>
                  <span className="font-serif font-bold text-[#A64D32]">${amountToDonate} {frequency === 'monthly' ? '/ mo' : ''}</span>
                </div>

                <div className="text-xs sm:text-sm font-medium text-[#5A5A5A]">
                  {getImpactLabel(amountToDonate)}
                </div>

                {/* Progress bar scale — tick positions are proportional to each
                    tier's actual dollar amount, so they line up with where the
                    fill bar really reaches instead of being evenly spaced. */}
                <div className="pt-1">
                  <div className="w-full bg-[#E5E0D8] h-2.5 rounded-full overflow-hidden p-0.5">
                    <div
                      className="bg-gradient-to-r from-[#5B6346] via-[#A64D32] to-[#8b3f28] h-full rounded-full transition-all duration-500 ease-out"
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
                          <span className={`w-1 h-1.5 rounded-full shrink-0 ${isReached ? 'bg-[#A64D32]' : 'bg-[#D6D0C4]'}`} />
                          <span
                            className={`text-[9px] sm:text-[10px] uppercase font-bold tracking-wider whitespace-nowrap ${rowOffset} ${
                              isReached ? 'text-[#A64D32]' : 'text-charcoal'
                            }`}
                          >
                            ${tier.amount}{tier.amount === DONATION_TIERS[DONATION_TIERS.length - 1].amount ? '+' : ''} {tier.label}
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
                  <label className="block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A] mb-1">
                    {t('donate.yourName')}
                  </label>
                  <input
                    type="text"
                    value={donorName}
                    onChange={(e) => setDonorName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl px-4 py-2.5 text-sm pawtx-focus focus:border-[#A64D32]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A] mb-1">
                    {t('donate.yourEmail')} *
                  </label>
                  <input
                    type="email"
                    required
                    value={donorEmail}
                    onChange={(e) => setDonorEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl px-4 py-2.5 text-sm pawtx-focus focus:border-[#A64D32]"
                  />
                </div>
              </div>

              {/* Payment is handled entirely on Stripe's hosted page. This
                  form deliberately has no card field: collecting a card number
                  here would put the site inside PCI scope. */}
              <div className="flex items-start gap-2.5 bg-[#5B6346]/8 border border-[#5B6346]/20 rounded-2xl px-4 py-3">
                <Lock className="w-4 h-4 text-[#5B6346] shrink-0 mt-0.5" />
                <span className="text-xs text-[#5A5A5A] leading-relaxed">{t('donate.secureNote')}</span>
              </div>

              {checkoutError && (
                <div className="flex items-start gap-2 bg-[#A64D32]/10 border border-[#A64D32]/30 rounded-2xl px-4 py-3 text-xs text-[#A64D32]">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{checkoutError}</span>
                </div>
              )}

              {/* Submit Button */}
              <div>
                <button
                  type="submit"
                  disabled={isSubmitting || amountToDonate < 1}
                  className="w-full bg-[#A64D32] hover:bg-[#8b3f28] text-white py-4 rounded-full font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-[#A64D32]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
              <div className="flex items-center justify-center gap-2 text-xs text-[#5A5A5A] pt-2">
                <ShieldCheck className="w-4 h-4 text-[#5B6346]" />
                <span>{t('donate.taxNote')}</span>
              </div>

            </form>
          ) : (
            /* Confirmation screen, reached only by returning from Stripe.
               Every figure below comes from the recorded donation, not from
               the form state the visitor left behind. */
            <div className="text-center py-8 space-y-6 animate-fadeIn">
              <div className="w-20 h-20 bg-[#5B6346]/20 text-[#5B6346] rounded-full flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 className="w-12 h-12" />
              </div>

              <div className="space-y-2">
                <h3 className="text-3xl font-serif font-bold text-[#2A2A2A]">
                  {t('donate.successTitle')}
                </h3>
                <p className="text-base text-[#5A5A5A] max-w-md mx-auto">
                  {confirmedAmount !== null
                    ? t('donate.successText', { amount: confirmedAmount })
                    : t('donate.receiptPending')}
                </p>
              </div>

              {isConfirming && !confirmedDonation && (
                <p className="text-xs text-[#5A5A5A]">{t('donate.confirming')}</p>
              )}

              {confirmedDonation && confirmedAmount !== null && (
                <div className="bg-[#FDFBF7] p-6 rounded-2xl border border-[#E5E0D8] text-left max-w-sm mx-auto space-y-2 text-xs text-[#2A2A2A]">
                  <div className="font-bold border-b border-[#E5E0D8] pb-2 text-sm font-serif">
                    {t('donate.receiptTitle')}
                  </div>
                  <div>{t('donate.receiptDonor')}: {confirmedDonation.donor_name || '—'}</div>
                  <div>
                    {t('donate.receiptAmount')}: ${confirmedAmount}
                    {confirmedDonation.frequency === 'monthly' ? ' / mo' : ''}
                  </div>
                  <div>{t('donate.receiptOrg')}: Peace Academy of West Texas (501(c)(3))</div>
                  {/* The tax ID is deliberately absent here. It belongs on the
                      emailed receipt, which the webhook renders from the real
                      EIN; printing a placeholder would forge an official
                      document. */}
                  <div className="pt-1 text-[#5A5A5A]">{t('donate.receiptPending')}</div>
                </div>
              )}

              <button
                onClick={() => window.location.reload()}
                className="bg-[#2A2A2A] hover:bg-black text-white px-8 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer"
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
