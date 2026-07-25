import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
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

export const App: React.FC = () => {
  const { activeTab } = useAppStore();
  const [isContactOpen, setIsContactOpen] = useState(false);
  const { t } = useTranslation();

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
