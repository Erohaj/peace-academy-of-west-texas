import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, CheckCircle2, ShieldCheck, CreditCard, Sparkles, Lock, ArrowRight } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { AnimatedSection } from './AnimatedSection';

// Shared by the preset buttons and the impact meter below so both stay in sync.
const DONATION_TIERS = [
  { amount: 25, label: 'Seed' },
  { amount: 50, label: 'Scholar' },
  { amount: 100, label: 'Community' },
  { amount: 250, label: 'Benefactor' },
] as const;

export const DonationWidget: React.FC = () => {
  const { t } = useTranslation();
  const { addDonation } = useAppStore();

  const [frequency, setFrequency] = useState<'one_time' | 'monthly'>('one_time');
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom'>(50);
  const [customAmount, setCustomAmount] = useState<string>('50');
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const amountToDonate = selectedPreset === 'custom' ? Number(customAmount) || 0 : selectedPreset;

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
    if (amountToDonate <= 0) return;

    setIsSubmitting(true);
    await addDonation({
      amount: amountToDonate,
      frequency,
      donorName: donorName || 'Anonymous Friend of PAWTX',
      donorEmail,
      impactLabel: getImpactLabel(amountToDonate),
      impactLabelEs: getImpactLabel(amountToDonate)
    });
    setIsSubmitting(false);
    setIsSuccess(true);
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

            <h2 className="text-3xl sm:text-5xl font-serif font-bold text-[#2A2A2A]">
              {t('donate.title')}
            </h2>

            <p className="text-base sm:text-lg text-[#5A5A5A] max-w-2xl mx-auto">
              {t('donate.subtitle')}
            </p>
          </div>
        </AnimatedSection>

        {/* Donation Interactive Card */}
        <AnimatedSection direction="up" delayMs={150}>
          <div className="bg-[#F4F1ED] rounded-[32px] p-6 sm:p-10 border border-[#E5E0D8] shadow-lg relative overflow-hidden">
          
          {!isSuccess ? (
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
                      className="w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-2xl pl-8 pr-4 py-3 text-base font-bold text-[#2A2A2A] focus:outline-none focus:border-[#A64D32]"
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
                              isReached ? 'text-[#A64D32]' : 'text-[#8A8A8A]'
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
                    className="w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#A64D32]"
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
                    className="w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#A64D32]"
                  />
                </div>
              </div>

              {/* Credit Card Mockup */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A]">
                  {t('donate.cardInformation')}
                </label>
                <div className="relative">
                  <CreditCard className="w-4 h-4 text-[#5A5A5A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder={t('donate.cardNumberPlaceholder')}
                    className="w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#A64D32]"
                  />
                  <Lock className="w-4 h-4 text-[#5B6346] absolute right-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {/* Submit Button */}
              <div>
                <button
                  type="submit"
                  disabled={isSubmitting || amountToDonate <= 0}
                  className="w-full bg-[#A64D32] hover:bg-[#8b3f28] text-white py-4 rounded-full font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-[#A64D32]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Securing Donation...</span>
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
            /* Success Receipt Screen */
            <div className="text-center py-8 space-y-6 animate-fadeIn">
              <div className="w-20 h-20 bg-[#5B6346]/20 text-[#5B6346] rounded-full flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 className="w-12 h-12" />
              </div>

              <div className="space-y-2">
                <h3 className="text-3xl font-serif font-bold text-[#2A2A2A]">
                  {t('donate.successTitle')}
                </h3>
                <p className="text-base text-[#5A5A5A] max-w-md mx-auto">
                  {t('donate.successText', { amount: amountToDonate })}
                </p>
              </div>

              <div className="bg-[#FDFBF7] p-6 rounded-2xl border border-[#E5E0D8] text-left max-w-sm mx-auto space-y-2 text-xs text-[#2A2A2A]">
                <div className="font-bold border-b border-[#E5E0D8] pb-2 text-sm font-serif">Official Donation Receipt</div>
                <div>Donor: {donorName || 'Anonymous'}</div>
                <div>Amount: ${amountToDonate} ({frequency})</div>
                <div>Organization: Peace Academy of West Texas (501(c)(3))</div>
                <div>Tax ID: XX-XXXXXXX</div>
              </div>

              <button
                onClick={() => setIsSuccess(false)}
                className="bg-[#2A2A2A] hover:bg-black text-white px-8 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer"
              >
                Make Another Gift
              </button>
            </div>
          )}

          </div>
        </AnimatedSection>

      </div>
    </section>
  );
};
