import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useAppStore } from './store/useAppStore';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { MissionSection } from './components/MissionSection';
import { BrochureShowcase } from './components/BrochureShowcase';
import { EventFeed } from './components/EventFeed';
import { SocialMediaFeed } from './components/SocialMediaFeed';
import { Gallery } from './components/Gallery';
import { VolunteerPortal } from './components/VolunteerPortal';
import { DonationWidget } from './components/DonationWidget';
import { RSVPModal } from './components/RSVPModal';
import { ContactModal } from './components/ContactModal';
import { SearchModal } from './components/SearchModal';
import { Footer } from './components/Footer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { readDonationReturn } from './lib/donationReturn';

// Staff-only, and a sizeable chunk of forms and tables. Loading it lazily
// keeps it out of the bundle every ordinary visitor downloads.
const AdminPanel = lazy(() =>
  import('./components/admin/AdminPanel').then((module) => ({ default: module.AdminPanel }))
);

export const App: React.FC = () => {
  const { activeTab, setActiveTab, initialize, dataStatus, dataError, refreshContent } =
    useAppStore();
  const [isContactOpen, setIsContactOpen] = useState(false);
  const { t } = useTranslation();

  // Loads events, gallery and shifts, and subscribes to auth changes. Guarded
  // inside the store against StrictMode's double effect in development.
  useEffect(() => {
    void initialize();
  }, [initialize]);

  // Stripe returns the donor to this page with ?donation=... . There is no
  // router, so route it by hand: the donation widget lives on the donate tab
  // (and on home), and the thank-you screen belongs on the former.
  useEffect(() => {
    if (readDonationReturn()) setActiveTab('donate');
  }, [setActiveTab]);

  const getMetaData = (tab: string) => {
    switch (tab) {
      case 'events':
        return {
          title: `${t('nav.events')} | Peace Academy of West Texas`,
          description: 'Discover upcoming cultural workshops, interfaith dinners, community service projects, and youth educational programs in West Texas.',
          keywords: 'events, Peace Academy, West Texas, Odessa, Midland, interfaith, community workshops',
        };
      case 'social':
        return {
          title: `${t('nav.social')} | Peace Academy of West Texas`,
          description: 'Stay connected with official live updates, event highlights, and community stories from Peace Academy of West Texas across Instagram, Facebook, YouTube, and X.',
          keywords: 'social media, feed, Peace Academy, West Texas, Odessa TX, Midland TX, community updates',
        };
      case 'gallery':
        return {
          title: `${t('nav.gallery')} | Peace Academy of West Texas`,
          description: 'Explore photos and videos from past Peace Academy events, cultural celebrations, food drives, and interfaith dialogue forums.',
          keywords: 'gallery, photos, community events, West Texas, Odessa TX, Peace Academy',
        };
      case 'volunteer':
        return {
          title: `${t('nav.volunteer')} | Peace Academy of West Texas`,
          description: 'Join our volunteer team in Ector and Midland Counties. Help with food pantry distribution, event coordination, and educational programs.',
          keywords: 'volunteer, Odessa TX, Midland TX, community service, food pantry, volunteer portal',
        };
      case 'donate':
        return {
          title: `${t('nav.donate')} | Peace Academy of West Texas`,
          description: 'Support Peace Academy of West Texas food security initiatives, youth workshops, and cross-cultural community outreach.',
          keywords: 'donate, support, non-profit, West Texas, Peace Academy, community aid',
        };
      case 'admin':
        return {
          title: `${t('footer.adminPanel')} | Peace Academy of West Texas`,
          description: 'Staff-only administration for Peace Academy of West Texas.',
          keywords: 'admin, staff, Peace Academy',
        };
      case 'home':
      default:
        return {
          title: 'Peace Academy of West Texas | Engaging Minds, Building Community',
          description: 'Promoting cross-cultural education, interfaith dialogue, and food security in Midland & Odessa, Texas.',
          keywords: 'Peace Academy, West Texas, Odessa TX, Midland TX, non-profit, community organization',
        };
    }
  };

  const currentMeta = getMetaData(activeTab);

  return (
    <div className="min-h-screen bg-[#fef9ef] font-sans antialiased text-[#292930] flex flex-col selection:bg-[#b05a36] selection:text-white">
      {/* Dynamic SEO Meta Header */}
      <Helmet>
        <title>{currentMeta.title}</title>
        <meta name="description" content={currentMeta.description} />
        <meta name="keywords" content={currentMeta.keywords} />
        <meta property="og:title" content={currentMeta.title} />
        <meta property="og:description" content={currentMeta.description} />
        <meta property="og:type" content="website" />
      </Helmet>

      {/* Sticky Top Navigation */}
      <Navbar onOpenContact={() => setIsContactOpen(true)} />

      {/* Dynamic View Routing */}
      <main className="flex-grow pt-16">
        <ErrorBoundary>
          {/* Content comes from Supabase now, so a failed load has to be
              visible. Donations and the volunteer portal talk to the backend
              directly and surface their own errors, so this banner sits above
              the page rather than replacing it. */}
          {dataStatus === 'error' && (
            <div className="max-w-3xl mx-auto px-4 pt-8">
              <div className="flex items-start gap-3 bg-[#A64D32]/10 border border-[#A64D32]/30 rounded-2xl px-5 py-4">
                <AlertCircle className="w-5 h-5 text-[#A64D32] shrink-0 mt-0.5" />
                <div className="flex-1 text-sm">
                  <div className="font-bold text-[#A64D32]">
                    {dataError === 'not_configured'
                      ? t('common.notConfiguredTitle')
                      : t('common.loadErrorTitle')}
                  </div>
                  <p className="text-xs text-[#5A5A5A] mt-1">
                    {dataError === 'not_configured'
                      ? t('common.notConfiguredText')
                      : t('common.loadErrorText')}
                  </p>
                </div>
                {dataError !== 'not_configured' && (
                  <button
                    onClick={() => void refreshContent()}
                    className="shrink-0 flex items-center gap-1.5 bg-[#A64D32] hover:bg-[#8b3f28] text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t('common.retry')}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'home' && (
            <>
              <Hero />
              <MissionSection />
              <BrochureShowcase />
              <EventFeed />
              <SocialMediaFeed />
              <Gallery />
              <DonationWidget />
            </>
          )}

          {activeTab === 'events' && <EventFeed />}

          {activeTab === 'social' && <SocialMediaFeed />}

          {activeTab === 'gallery' && <Gallery />}

          {activeTab === 'volunteer' && <VolunteerPortal />}

          {activeTab === 'donate' && <DonationWidget />}

          {activeTab === 'admin' && (
            <Suspense
              fallback={
                <div className="py-20 text-center text-sm text-[#5A5A5A]">{t('common.loading')}</div>
              }
            >
              <AdminPanel />
            </Suspense>
          )}
        </ErrorBoundary>
      </main>

      {/* Global Footer */}
      <Footer onOpenContact={() => setIsContactOpen(true)} />

      {/* Modal Dialogs */}
      <RSVPModal />
      <ContactModal isOpen={isContactOpen} onClose={() => setIsContactOpen(false)} />
      <SearchModal />

    </div>
  );
};

export default App;
