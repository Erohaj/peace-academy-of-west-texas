import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass, Target, Heart, Award, Sparkles, Trophy, Users, Utensils, Coffee, Droplet, Globe2, BookOpen, ShieldCheck } from 'lucide-react';
import { IMAGES } from '../data/mockData';
import { AnimatedSection } from './AnimatedSection';

export const BrochureShowcase: React.FC = () => {
  const { i18n } = useTranslation();
  const isEs = i18n.language === 'es';
  const [activeTab, setActiveTab] = useState<'programs' | 'signature' | 'vision'>('signature');

  const servicesAndPrograms = [
    {
      title: isEs ? 'Programas de Diálogo' : 'Dialogue Programs',
      desc: isEs ? 'Facilitando diálogos interculturales e interreligiosos para tender puentes en el oeste de Tejas.' : 'Facilitating intercultural and interfaith dialogues to build bridges across West Texas communities.',
      icon: <Users className="w-6 h-6 text-terracotta" />,
      badge: 'Core Program'
    },
    {
      title: isEs ? 'Festivales Interculturales' : 'Intercultural Festivals',
      desc: isEs ? 'Celebrando la rica diversidad con música, danza, trajes tradicionales y arte culinario.' : 'Celebrating rich cultural diversity with music, dance, traditional attire, and culinary arts.',
      icon: <Sparkles className="w-6 h-6 text-olive" />,
      badge: 'Annual Event'
    },
    {
      title: isEs ? 'Compromiso Comunitario' : 'Community Engagement',
      desc: isEs ? 'Creando oportunidades para que los vecinos compartan experiencias, apoyo e ideas.' : 'Creating ongoing opportunities for neighbors to share experiences, support, and ideas.',
      icon: <Heart className="w-6 h-6 text-terracotta" />,
      badge: 'Community'
    },
    {
      title: isEs ? 'Diálogo Juvenil' : 'Youth Dialogue & Leadership',
      desc: isEs ? 'Empoderando a la juventud con herramientas de liderazgo, respeto mutuo y ciudadanía activa.' : 'Empowering young people with leadership tools, mutual respect, and active civic participation.',
      icon: <BookOpen className="w-6 h-6 text-olive" />,
      badge: 'Youth'
    },
    {
      title: isEs ? 'Proyectos Sociales y de Alivio' : 'Social & Relief Projects',
      desc: isEs ? 'Organizando colectas de alimentos, ropa e iniciativas de respuesta en momentos de necesidad.' : 'Organizing food drives, supply distributions, and emergency response in times of need.',
      icon: <ShieldCheck className="w-6 h-6 text-terracotta" />,
      badge: 'Relief'
    },
    {
      title: isEs ? 'Programas Deportivos' : 'Sports Programs',
      desc: isEs ? 'Promoviendo el trabajo en equipo, la salud y la amistad mediante campamentos de fútbol y baloncesto.' : 'Promoting teamwork, health, and friendship through soccer and basketball youth camps.',
      icon: <Trophy className="w-6 h-6 text-olive" />,
      badge: 'Sports'
    }
  ];

  const signatureActivities = [
    {
      title: isEs ? 'Festival Cultural de Tejas' : 'West Texas Cultural Festival',
      desc: isEs ? 'Un evento emblemático que reúne a docenas de comunidades para celebrar la diversidad.' : 'A flagship gathering bringing dozens of cultural heritage groups together under one roof.',
      image: IMAGES.communitySign,
      category: 'Festival'
    },
    {
      title: isEs ? 'Campamentos de Fútbol y Baloncesto' : 'Youth Soccer & Basketball Camps',
      desc: isEs ? 'Desarrollo de habilidades deportivas y trabajo en equipo para jóvenes de Midland y Odessa.' : 'Building athletic skills, camaraderie, and leadership for West Texas youth.',
      image: IMAGES.sportsCamp,
      category: 'Sports'
    },
    {
      title: isEs ? 'Club de Cocina Internacional' : 'International Cooking Club',
      desc: isEs ? 'Aprende a preparar platos de Turquía, Italia, México, Medio Oriente y más.' : 'Hands-on cooking workshops sharing recipes and stories from around the globe.',
      image: IMAGES.cookingWorkshop,
      category: 'Culinary'
    },
    {
      title: isEs ? 'Noche de Café para Mujeres' : "Ladies' Coffee & Culture Night",
      desc: isEs ? 'Un espacio acogedor para que las mujeres conversen, aprendan y creen lazos de amistad.' : 'A warm, welcoming space for women to connect, converse, and build friendships.',
      image: IMAGES.coffeeNight,
      category: 'Community'
    },
    {
      title: isEs ? 'Acción de Gracias con Héroes Locales' : 'Thanksgiving with Local Heroes',
      desc: isEs ? 'Honrando a bomberos, policías y personal de emergencia con cenas comunitarias.' : 'Honoring first responders, police, firefighters, and healthcare workers with warm dinners.',
      image: IMAGES.heroDinner,
      category: 'Gratitude'
    },
    {
      title: isEs ? 'Pozos de Agua Limpia en África' : 'Clean Water-Well Initiative in Africa',
      desc: isEs ? 'Proyectos caritativos internacionales financiados por el apoyo de la comunidad de Permian Basin.' : 'Charitable international relief providing sustainable clean water to underserved villages.',
      image: IMAGES.waterWell,
      category: 'Global Aid'
    }
  ];

  return (
    <section className="py-20 bg-aged-paper text-graphite border-t border-b border-warm-taupe">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Section Header */}
        <AnimatedSection direction="up" delayMs={50}>
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <div className="inline-flex items-center gap-2 text-terracotta font-bold text-xs uppercase tracking-[0.2em] bg-terracotta/10 px-4 py-1.5 rounded-full border border-terracotta/20">
              <Compass className="w-3.5 h-3.5 text-terracotta" />
              <span>{isEs ? 'Información Oficial de la Academia' : 'Official PAWTX Brochure & Scope'}</span>
            </div>

            <h2 className="text-3xl sm:text-5xl font-serif font-bold text-graphite">
              {isEs ? 'Programas y Actividades Emblemáticas' : 'Programs & Signature Activities'}
            </h2>

            <p className="text-base sm:text-lg text-charcoal">
              {isEs 
                ? 'Desde 2018, Peace Academy of West Texas promueve la paz, la armonía social y el entendimiento mutuo mediante iniciativas educativas, festivales y proyectos comunitarios.' 
                : 'Serving West Texas since 2018 through dialogue, cultural exchanges, youth leadership, and compassionate humanitarian service.'}
            </p>
          </div>
        </AnimatedSection>

        {/* Tab Navigation */}
        <AnimatedSection direction="up" delayMs={100}>
          <div className="flex justify-center border-b border-warm-taupe pb-4 gap-2 sm:gap-4 overflow-x-auto">
            <button
              onClick={() => setActiveTab('signature')}
              className={`px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all cursor-pointer ${
                activeTab === 'signature'
                  ? 'bg-terracotta text-white shadow-md'
                  : 'bg-parchment text-graphite hover:bg-white border border-warm-taupe'
              }`}
            >
              {isEs ? 'Actividades Emblemáticas' : 'Signature Activities'}
            </button>

            <button
              onClick={() => setActiveTab('programs')}
              className={`px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all cursor-pointer ${
                activeTab === 'programs'
                  ? 'bg-terracotta text-white shadow-md'
                  : 'bg-parchment text-graphite hover:bg-white border border-warm-taupe'
              }`}
            >
              {isEs ? 'Servicios y Programas' : 'Services & Programs'}
            </button>

            <button
              onClick={() => setActiveTab('vision')}
              className={`px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all cursor-pointer ${
                activeTab === 'vision'
                  ? 'bg-terracotta text-white shadow-md'
                  : 'bg-parchment text-graphite hover:bg-white border border-warm-taupe'
              }`}
            >
              {isEs ? 'Misión y Visión' : 'Mission & Vision'}
            </button>
          </div>
        </AnimatedSection>

        {/* Signature Activities View */}
        {activeTab === 'signature' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {signatureActivities.map((act, index) => (
              <AnimatedSection key={index} direction="up" delayMs={100 + (index % 3) * 100}>
                <div className="bg-parchment rounded-[24px] overflow-hidden border border-warm-taupe shadow-sm hover:shadow-md transition-all group flex flex-col justify-between h-full">
                  {/* Brand-tinted backdrop so a photo that fails to load degrades
                      to a clean block with its badge rather than a broken icon. */}
                  <div className="relative h-48 overflow-hidden bg-gradient-to-br from-olive to-terracotta">
                    <img
                      src={act.image}
                      alt={act.title}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <span className="absolute top-4 left-4 bg-olive text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm">
                      {act.category}
                    </span>
                  </div>

                  <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-xl font-serif font-bold text-graphite group-hover:text-terracotta transition-colors">
                        {act.title}
                      </h3>
                      <p className="text-charcoal text-sm leading-relaxed mt-2">
                        {act.desc}
                      </p>
                    </div>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        )}

        {/* Services & Programs View */}
        {activeTab === 'programs' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {servicesAndPrograms.map((prog, index) => (
              <AnimatedSection key={index} direction="up" delayMs={100 + (index % 3) * 100}>
                <div className="bg-parchment rounded-[24px] p-8 border border-warm-taupe shadow-sm hover:shadow-md transition-all space-y-4 group h-full">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-aged-paper flex items-center justify-center border border-warm-taupe">
                      {prog.icon}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-terracotta bg-terracotta/10 px-3 py-1 rounded-full">
                      {prog.badge}
                    </span>
                  </div>

                  <h3 className="text-xl font-serif font-bold text-graphite">
                    {prog.title}
                  </h3>

                  <p className="text-charcoal text-sm leading-relaxed">
                    {prog.desc}
                  </p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        )}

        {/* Mission & Vision Detailed View */}
        {activeTab === 'vision' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Our Mission */}
            <AnimatedSection direction="up" delayMs={100}>
              <div className="bg-parchment rounded-[28px] p-8 sm:p-10 border border-warm-taupe space-y-6 shadow-sm border-l-4 border-l-terracotta h-full">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-terracotta text-white flex items-center justify-center font-serif font-bold text-xl">
                    M
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-terracotta">
                      {isEs ? 'Propósito Fundamental' : 'Core Statement'}
                    </div>
                    <h3 className="text-2xl font-serif font-bold text-graphite">
                      {isEs ? 'Nuestra Misión' : 'Our Mission'}
                    </h3>
                  </div>
                </div>

                <p className="text-charcoal text-base leading-relaxed font-sans">
                  {isEs 
                    ? 'Peace Academy of West Texas tiene como misión promover la paz, la comprensión mutua y la armonía social mediante el fomento del diálogo, los intercambios culturales y las iniciativas comunitarias colaborativas en el oeste de Tejas.'
                    : 'To promote peace, mutual understanding, and social harmony by encouraging dialogue, cultural exchanges, and collaborative community initiatives across West Texas.'}
                </p>

                <div className="p-4 bg-aged-paper rounded-xl border border-warm-taupe text-xs font-bold text-graphite uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-terracotta" />
                  <span>{isEs ? 'Lema: Inspirando Mentes, Construyendo Comunidad' : 'Motto: Engaging Minds, Building Community'}</span>
                </div>
              </div>
            </AnimatedSection>

            {/* Our Vision */}
            <AnimatedSection direction="up" delayMs={200}>
              <div className="bg-parchment rounded-[28px] p-8 sm:p-10 border border-warm-taupe space-y-6 shadow-sm border-l-4 border-l-olive h-full">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-olive text-white flex items-center justify-center font-serif font-bold text-xl">
                    V
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-olive">
                      {isEs ? 'Aspiración Futura' : 'Future Horizon'}
                    </div>
                    <h3 className="text-2xl font-serif font-bold text-graphite">
                      {isEs ? 'Nuestra Visión' : 'Our Vision'}
                    </h3>
                  </div>
                </div>

                <p className="text-charcoal text-base leading-relaxed font-sans">
                  {isEs 
                    ? 'Visualizamos un Permian Basin unificado donde la diversidad sea celebrada, los jóvenes sean empoderados como líderes compasivos y cada vecino se sienta valorado e incluido.'
                    : 'A united West Texas where diversity is celebrated as a strength, youth are empowered as compassionate leaders, and every community member feels valued, heard, and supported.'}
                </p>

                <div className="p-4 bg-aged-paper rounded-xl border border-warm-taupe text-xs font-bold text-graphite uppercase tracking-wider flex items-center gap-2">
                  <Compass className="w-4 h-4 text-olive" />
                  <span>{isEs ? 'Organización sin Fines de Lucro 501(c)(3)' : '501(c)(3) Registered Non-Profit'}</span>
                </div>
              </div>
            </AnimatedSection>

          </div>
        )}

      </div>
    </section>
  );
};
