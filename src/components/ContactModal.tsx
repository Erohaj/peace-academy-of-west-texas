import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Send, Mail, MapPin, CheckCircle2, AlertCircle } from 'lucide-react';
import { sendContactMessage } from '../lib/api/contact';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ContactModal: React.FC<ContactModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  // Honeypot: hidden from people, irresistible to form-filling bots. The Edge
  // Function discards any submission that carries a value here.
  const [website, setWebsite] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Like the RSVP modal, this stays mounted and only renders null while closed,
  // so clear the form on each open instead of reopening on "Message Sent!".
  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setEmail('');
    setMessage('');
    setWebsite('');
    setIsSubmitting(false);
    setIsSubmitted(false);
    setHasError(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setHasError(false);

    try {
      await sendContactMessage({ fullName: name, email, message, website });
      setIsSubmitted(true);
    } catch (error) {
      // The previous version showed "Message Sent!" unconditionally and sent
      // nothing at all — a silent failure is worse than a visible one.
      console.error('[PAWTX] Contact form submission failed', error);
      setHasError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#FDFBF7] rounded-[28px] border border-[#E5E0D8] shadow-2xl max-w-lg w-full p-6 relative text-[#2A2A2A]">

        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full hover:bg-black/5 text-[#5A5A5A] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {!isSubmitted ? (
          <div className="space-y-6">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#A64D32]">
                {t('contact.eyebrow')}
              </span>
              <h3 className="text-2xl font-serif font-bold text-[#2A2A2A]">
                {t('contact.title')}
              </h3>
              <p className="text-xs text-[#5A5A5A]">
                {t('contact.subtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A] mb-1">
                  {t('contact.fullName')}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('contact.fullNamePlaceholder')}
                  className="w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#A64D32]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A] mb-1">
                  {t('contact.email')}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('contact.emailPlaceholder')}
                  className="w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#A64D32]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A] mb-1">
                  {t('contact.message')}
                </label>
                <textarea
                  rows={4}
                  required
                  maxLength={5000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('contact.messagePlaceholder')}
                  className="w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#A64D32]"
                />
              </div>

              {/* Honeypot — hidden from sighted users and screen readers alike. */}
              <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />

              {hasError && (
                <div className="flex items-start gap-2 bg-[#A64D32]/10 border border-[#A64D32]/30 rounded-xl px-4 py-3 text-xs text-[#A64D32]">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{t('contact.errorText')}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#A64D32] hover:bg-[#8b3f28] text-white py-3 rounded-full font-bold text-xs uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>{isSubmitting ? t('contact.sending') : t('contact.send')}</span>
                {!isSubmitting && <Send className="w-4 h-4" />}
              </button>
            </form>

            <div className="pt-4 border-t border-[#E5E0D8] text-xs text-[#5A5A5A] space-y-1">
              <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-[#A64D32]" /> 3411 Brentwood Dr, Odessa, TX 79762</div>
              <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-[#A64D32]" /> paowtx@gmail.com</div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 space-y-4">
            <CheckCircle2 className="w-12 h-12 text-[#5B6346] mx-auto" />
            <h3 className="text-2xl font-serif font-bold text-[#2A2A2A]">{t('contact.sentTitle')}</h3>
            <p className="text-xs text-[#5A5A5A]">
              {t('contact.sentText')}
            </p>
            <button
              onClick={onClose}
              className="bg-[#2A2A2A] hover:bg-black text-white px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest cursor-pointer"
            >
              {t('contact.close')}
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
