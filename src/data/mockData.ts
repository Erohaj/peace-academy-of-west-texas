import { PAWTXEvent, GalleryItem, Shift, VolunteerProfile } from '../types';

// Official Peace Academy of West Texas community photos (bundled & optimized)
import logoImg from '../assets/logo.webp';
import heroParadeImg from '../assets/hero-parade.webp';
import communityOneImg from '../assets/community-one.webp';
import tajikistanBoothImg from '../assets/tajikistan-booth.webp';
import mexicanFolkImg from '../assets/mexican-folk.webp';
import nigeriaBoothImg from '../assets/nigeria-booth.webp';
import turkeyBoothImg from '../assets/turkey-booth.webp';
import jordanBoothImg from '../assets/jordan-booth.webp';
import germanyBoothImg from '../assets/germany-booth.webp';
import cameroonPeruBoothImg from '../assets/cameroon-peru-booth.webp';
import vietnamBoothImg from '../assets/vietnam-booth.webp';
import firefightersGroupImg from '../assets/firefighters-group.webp';
import nativeHeritageDanceImg from '../assets/native-heritage-dance.webp';
import oneCommunityEncoreImg from '../assets/one-community-encore.webp';
import indiaBoothImg from '../assets/india-booth.webp';
import cookingClassImg from '../assets/cooking-class.webp';
import cookingWorkshopImg from '../assets/cooking-workshop.webp';
import coffeeNightImg from '../assets/coffee-night.webp';
import reliefDriveImg from '../assets/relief-drive.webp';
import sportsCampImg from '../assets/sports-camp.webp';
import culturalCostumeExchangeImg from '../assets/cultural-costume-exchange.webp';

// High resolution image assets matching PAWTX community photos
export const IMAGES = {
  logo: logoImg,
  heroBanner: heroParadeImg,
  parade: heroParadeImg,
  communitySign: communityOneImg,
  tajikistanBooth: tajikistanBoothImg,
  mexicanCostume: mexicanFolkImg,
  nigeriaBooth: nigeriaBoothImg,
  turkeyBooth: turkeyBoothImg,
  jordanBooth: jordanBoothImg,
  germanyBooth: germanyBoothImg,
  cameroonPeruBooth: cameroonPeruBoothImg,
  vietnamBooth: vietnamBoothImg,
  firefightersGroup: firefightersGroupImg,
  nativeHeritageDance: nativeHeritageDanceImg,
  oneCommunityEncore: oneCommunityEncoreImg,
  indiaBooth: indiaBoothImg,
  cookingClass: cookingClassImg,
  cookingWorkshop: cookingWorkshopImg,
  coffeeNight: coffeeNightImg,
  reliefDrive: reliefDriveImg,
  sportsCamp: sportsCampImg,
  heroDinner: firefightersGroupImg,
  culturalCostumeExchange: culturalCostumeExchangeImg,
  // No real PAWTX photo available for these two yet (source Drive folders were empty) — still stock:
  seminar: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1200&q=80',
  waterWell: 'https://images.unsplash.com/photo-1541888946425-d0fbb186a5b3?auto=format&fit=crop&w=1200&q=80'
};

export const INITIAL_EVENTS: PAWTXEvent[] = [
  {
    id: 'evt-1',
    title: 'International Cooking Class: Authentic Rendang & Asian Flavors',
    titleEs: 'Clase Internacional de Cocina: Rendang Auténtico y Sabores Asiáticos',
    description: 'Hands-on culinary workshop guided by local community chefs. Learn spice blending, authentic cooking techniques, and share a communal dinner.',
    descriptionEs: 'Taller culinario práctico guiado por chefs locales. Aprende combinación de especias, técnicas auténticas y comparte una cena comunitaria.',
    date: 'Saturday, August 15, 2026',
    time: '5:30 PM - 8:30 PM',
    location: 'Odessa Community Kitchen, 1200 N Texas Ave, Odessa, TX',
    category: 'cooking',
    totalSpots: 20,
    reservedSpots: 8,
    imageUrl: IMAGES.cookingClass,
    status: 'upcoming',
    featured: true
  },
  {
    id: 'evt-2',
    title: 'Ladies Coffee & Cultural Exchange Night',
    titleEs: 'Noche de Café y Intercambio Cultural para Mujeres',
    description: 'A cozy evening for women of all backgrounds to meet, enjoy coffee & traditional pastries, and build lasting friendships in West Texas.',
    descriptionEs: 'Una acogedora velada para que mujeres de todos los orígenes se conozcan, disfruten de café y repostería tradicional, y creen amistades duraderas.',
    date: 'Thursday, August 20, 2026',
    time: '6:30 PM - 8:30 PM',
    location: 'Midland Community Center, 2000 W Wadley Ave, Midland, TX',
    category: 'cultural',
    totalSpots: 25,
    reservedSpots: 17,
    imageUrl: IMAGES.coffeeNight,
    status: 'upcoming',
    featured: true
  },
  {
    id: 'evt-3',
    title: 'West Texas International Heritage Parade & Festival',
    titleEs: 'Desfile y Festival Internacional de la Herencia del Oeste de Tejas',
    description: 'Annual flagship celebration featuring cultural booths (Tajikistan, Kenya, Mexico, USA), traditional dance performances, parade, and global cuisine.',
    descriptionEs: 'Celebración anual principal con stands culturales (Tayikistán, Kenia, México, EE. UU.), bailes tradicionales, desfile y gastronomía global.',
    date: 'Saturday, September 12, 2026',
    time: '10:00 AM - 4:00 PM',
    location: 'Noel Heritage Plaza, Downtown Odessa, TX',
    category: 'cultural',
    totalSpots: 150,
    reservedSpots: 150,
    imageUrl: IMAGES.parade,
    status: 'upcoming',
    featured: true
  },
  {
    id: 'evt-4',
    title: 'Peace & Diversity Seminar: Building Bridges in West Texas',
    titleEs: 'Seminario de Paz y Diversidad: Construyendo Puentes en el Oeste de Tejas',
    description: 'An interactive discussion on community integration, interfaith dialogue, and civil engagement hosted by West Texas educators and leaders.',
    descriptionEs: 'Una discusión interactiva sobre integración comunitaria, diálogo interfe y participación civil con educadores y líderes de Tejas.',
    date: 'Tuesday, September 22, 2026',
    time: '6:00 PM - 8:00 PM',
    location: 'UT Permian Basin Lecture Hall, Odessa, TX',
    category: 'seminars',
    totalSpots: 60,
    reservedSpots: 35,
    imageUrl: IMAGES.seminar,
    status: 'upcoming'
  },
  {
    id: 'evt-5',
    title: 'Fall Family Food & Warm Clothing Emergency Relief Drive',
    titleEs: 'Campaña de Ayuda de Alimentos y Ropa de Invierno para Familias',
    description: 'Community outreach drive collecting non-perishable goods, jackets, and emergency support boxes for West Texas families in need.',
    descriptionEs: 'Campaña de apoyo comunitario recolectando alimentos no perecederos, abrigos y cajas de ayuda para familias necesitadas.',
    date: 'Saturday, October 3, 2026',
    time: '9:00 AM - 2:00 PM',
    location: 'Peace Academy Volunteer Center, Midland, TX',
    category: 'relief',
    totalSpots: 40,
    reservedSpots: 12,
    imageUrl: IMAGES.reliefDrive,
    status: 'upcoming'
  }
];

export const INITIAL_GALLERY: GalleryItem[] = [
  {
    id: 'gal-1',
    title: 'Heritage Parade on the Green',
    titleEs: 'Desfile de la Herencia en la Plaza',
    category: 'cultural',
    imageUrl: IMAGES.parade,
    caption: 'Children and volunteers leading the West Texas International Heritage Parade with American and Texas state flags.',
    captionEs: 'Niños y voluntarios liderando el Desfile Internacional de la Herencia con banderas de EE. UU. y Tejas.',
    date: 'October 2025',
    location: 'Noel Heritage Plaza, Odessa, TX'
  },
  {
    id: 'gal-2',
    title: 'Different Cultures, One Community',
    titleEs: 'Diferentes Culturas, Una Sola Comunidad',
    category: 'cultural',
    imageUrl: IMAGES.communitySign,
    caption: 'Diverse community volunteers coming together with handmade signs celebrating unity in diversity across Midland & Odessa.',
    captionEs: 'Voluntarios comunitarios reunidos con carteles hechos a mano celebrando la unidad en la diversidad.',
    date: 'September 2025',
    location: 'Midland Community Park, TX'
  },
  {
    id: 'gal-3',
    title: 'Tajikistan Cultural Pavilion & Hospitality',
    titleEs: 'Pabellón Cultural de Tayikistán y Hospitalidad',
    category: 'cultural',
    imageUrl: IMAGES.tajikistanBooth,
    caption: 'Local Tajik-American family showcasing traditional embroidered tapestries, fresh tea, non-bread, and cultural heritage.',
    captionEs: 'Familia tayiko-americana exhibiendo bordados tradicionales, té fresco, pan artesanal y herencia cultural.',
    date: 'October 2025',
    location: 'Odessa Heritage Grounds, TX'
  },
  {
    id: 'gal-4',
    title: 'Traditional Folk Costume Celebration',
    titleEs: 'Celebración de Trajes Folclóricos Tradicionales',
    category: 'cultural',
    imageUrl: IMAGES.mexicanCostume,
    caption: 'Young participant wearing hand-embroidered Mexican folk dress and floral straw hat during the cultural dance showcase.',
    captionEs: 'Joven participante vistiendo un traje folclórico mexicano bordado a mano y sombrero de paja con flores.',
    date: 'October 2025',
    location: 'Odessa, TX'
  },
  {
    id: 'gal-5',
    title: 'India Cultural Pavilion',
    titleEs: 'Pabellón Cultural de India',
    category: 'cultural',
    imageUrl: IMAGES.indiaBooth,
    caption: 'Volunteers at the India booth share crafts and hospitality with festival visitors beneath a Taj Mahal backdrop.',
    captionEs: 'Voluntarios en el stand de India comparten artesanías y hospitalidad con los visitantes bajo un fondo del Taj Mahal.',
    date: 'October 2025',
    location: 'Noel Heritage Plaza, Odessa, TX'
  },
  {
    id: 'gal-6',
    title: 'International Dumpling & Cooking Workshop',
    titleEs: 'Taller de Cocina y Empanadas Internacionales',
    category: 'cooking',
    imageUrl: IMAGES.cookingClass,
    caption: 'Community members learning spice techniques and rolling dough in our monthly cooking workshop.',
    captionEs: 'Miembros comunitarios aprendiendo técnicas de especias y amasado en nuestro taller de cocina mensual.',
    date: 'November 2025',
    location: 'Odessa Community Kitchen, TX'
  },
  {
    id: 'gal-7',
    title: 'Nigeria Cultural Pavilion',
    titleEs: 'Pabellón Cultural de Nigeria',
    category: 'cultural',
    imageUrl: IMAGES.nigeriaBooth,
    caption: 'A Nigerian-American family shares traditional dress and heritage with festival visitors at the International Cultural Festival.',
    captionEs: 'Una familia nigeriano-americana comparte vestimenta tradicional y herencia cultural con los visitantes del Festival Cultural Internacional.',
    date: 'October 2025',
    location: 'Noel Heritage Plaza, Odessa, TX'
  },
  {
    id: 'gal-8',
    title: 'Turkish Cultural Pavilion',
    titleEs: 'Pabellón Cultural de Turquía',
    category: 'cultural',
    imageUrl: IMAGES.turkeyBooth,
    caption: 'Volunteers welcome guests to the Turkey booth, sharing flags, crafts, and traditions with the West Texas community.',
    captionEs: 'Voluntarios reciben a los visitantes en el stand de Turquía, compartiendo banderas, artesanías y tradiciones con la comunidad.',
    date: 'October 2025',
    location: 'Noel Heritage Plaza, Odessa, TX'
  },
  {
    id: 'gal-9',
    title: 'Jordan Cultural Pavilion',
    titleEs: 'Pabellón Cultural de Jordania',
    category: 'cultural',
    imageUrl: IMAGES.jordanBooth,
    caption: 'Guests sample traditional treats and tea at the Jordan booth during the International Cultural Festival.',
    captionEs: 'Los invitados prueban dulces y té tradicionales en el stand de Jordania durante el Festival Cultural Internacional.',
    date: 'October 2025',
    location: 'Noel Heritage Plaza, Odessa, TX'
  },
  {
    id: 'gal-10',
    title: 'Germany Cultural Pavilion',
    titleEs: 'Pabellón Cultural de Alemania',
    category: 'cultural',
    imageUrl: IMAGES.germanyBooth,
    caption: 'Volunteers representing Germany welcome festival-goers beneath a Brandenburg Gate backdrop.',
    captionEs: 'Voluntarios representando a Alemania reciben a los asistentes del festival bajo un fondo de la Puerta de Brandeburgo.',
    date: 'October 2025',
    location: 'Noel Heritage Plaza, Odessa, TX'
  },
  {
    id: 'gal-11',
    title: 'Cameroon & Peru Cultural Booths',
    titleEs: 'Stands Culturales de Camerún y Perú',
    category: 'cultural',
    imageUrl: IMAGES.cameroonPeruBooth,
    caption: 'A volunteer in traditional Cameroonian dress welcomes visitors alongside the neighboring Peru pavilion.',
    captionEs: 'Una voluntaria con vestimenta tradicional camerunesa recibe a los visitantes junto al pabellón vecino de Perú.',
    date: 'October 2025',
    location: 'Noel Heritage Plaza, Odessa, TX'
  },
  {
    id: 'gal-12',
    title: 'Vietnam Food Pavilion',
    titleEs: 'Pabellón Gastronómico de Vietnam',
    category: 'cooking',
    imageUrl: IMAGES.vietnamBooth,
    caption: 'Volunteers serve traditional dishes at the Vietnam booth, part of the festival’s global food showcase.',
    captionEs: 'Voluntarios sirven platillos tradicionales en el stand de Vietnam, parte de la muestra gastronómica global del festival.',
    date: 'October 2025',
    location: 'Noel Heritage Plaza, Odessa, TX'
  },
  {
    id: 'gal-13',
    title: 'Community Fire & Rescue Partnership',
    titleEs: 'Asociación Comunitaria con Bomberos y Rescate',
    category: 'relief',
    imageUrl: IMAGES.firefightersGroup,
    caption: 'Local firefighters join the festival grounds, strengthening ties between first responders and the community they serve.',
    captionEs: 'Bomberos locales se unen al festival, fortaleciendo los lazos entre los primeros respondientes y la comunidad a la que sirven.',
    date: 'October 2025',
    location: 'Noel Heritage Plaza, Odessa, TX'
  },
  {
    id: 'gal-14',
    title: 'Native Heritage Dance Performance',
    titleEs: 'Presentación de Danza de Herencia Nativa',
    category: 'cultural',
    imageUrl: IMAGES.nativeHeritageDance,
    caption: 'A dancer in traditional regalia performs for festival guests, honoring Native heritage as part of the cultural showcase.',
    captionEs: 'Un bailarín con atuendo tradicional se presenta ante los invitados del festival, honrando la herencia nativa como parte de la muestra cultural.',
    date: 'October 2025',
    location: 'Noel Heritage Plaza, Odessa, TX'
  },
  {
    id: 'gal-15',
    title: 'Different Cultures, One Community (Encore)',
    titleEs: 'Diferentes Culturas, Una Sola Comunidad (Bis)',
    category: 'cultural',
    imageUrl: IMAGES.oneCommunityEncore,
    caption: 'Another group of volunteers and neighbors rally behind the festival’s signature message of unity in diversity.',
    captionEs: 'Otro grupo de voluntarios y vecinos se une en torno al mensaje distintivo del festival: la unidad en la diversidad.',
    date: 'October 2025',
    location: 'Noel Heritage Plaza, Odessa, TX'
  },
  {
    id: 'gal-16',
    title: 'Trying On Traditions Together',
    titleEs: 'Probando Tradiciones Juntas',
    category: 'cultural',
    imageUrl: IMAGES.culturalCostumeExchange,
    caption: 'Women from different backgrounds share and try on each other’s traditional dress during a community cultural exchange evening.',
    captionEs: 'Mujeres de diferentes orígenes comparten y se prueban trajes tradicionales entre sí durante una velada comunitaria de intercambio cultural.',
    date: 'November 2023',
    location: 'Odessa, TX'
  }
];

export const INITIAL_SHIFTS: Shift[] = [
  {
    id: 'sh-1',
    title: 'Kitchen Assistant & Food Prep',
    titleEs: 'Asistente de Cocina y Preparación de Alimentos',
    role: 'Food Prep',
    roleEs: 'Preparación de Alimentos',
    date: 'Saturday, August 15, 2026',
    time: '4:00 PM - 7:00 PM',
    durationHours: 3,
    spotsTotal: 5,
    spotsFilled: 2,
    description: 'Help chop vegetables, prep cooking stations, and assist chefs during the International Cooking Class.',
    descriptionEs: 'Ayuda a picar verduras, preparar estaciones de cocina y asistir a los chefs durante la Clase Internacional de Cocina.',
    isTakenByMe: false
  },
  {
    id: 'sh-2',
    title: 'Welcome Desk & Greeter',
    titleEs: 'Mesa de Bienvenida y Recepción',
    role: 'Greeter',
    roleEs: 'Recepción',
    date: 'Thursday, August 20, 2026',
    time: '6:00 PM - 8:30 PM',
    durationHours: 2.5,
    spotsTotal: 3,
    spotsFilled: 1,
    description: 'Greet guests, manage check-in lists, and distribute event materials for Ladies Coffee Night.',
    descriptionEs: 'Saluda a las invitadas, gestiona las listas de registro y distribuye materiales en la Noche de Café.',
    isTakenByMe: false
  },
  {
    id: 'sh-3',
    title: 'Festival Pavilion Setup & Logistics',
    titleEs: 'Montaje de Pabellones y Logística del Festival',
    role: 'Event Setup',
    roleEs: 'Montaje de Evento',
    date: 'Saturday, September 12, 2026',
    time: '7:30 AM - 11:00 AM',
    durationHours: 3.5,
    spotsTotal: 10,
    spotsFilled: 6,
    description: 'Help set up tents, tables, signage, and sound equipment for the Heritage Parade & Festival.',
    descriptionEs: 'Ayuda a montar carpas, mesas, señalización y equipo de sonido para el Desfile y Festival.',
    isTakenByMe: false
  },
  {
    id: 'sh-4',
    title: 'Spanish-English Bilingual Translator',
    titleEs: 'Traductor Bilingüe Español-Inglés',
    role: 'Translator',
    roleEs: 'Traductor',
    date: 'Tuesday, September 22, 2026',
    time: '5:30 PM - 8:30 PM',
    durationHours: 3,
    spotsTotal: 4,
    spotsFilled: 2,
    description: 'Provide real-time translation assistance and facilitate small group conversations during the Diversity Seminar.',
    descriptionEs: 'Brinda asistencia de traducción en tiempo real y facilita conversaciones en grupos durante el Seminario de Diversidad.',
    isTakenByMe: false
  },
  {
    id: 'sh-5',
    title: 'Relief Box Assembly & Distribution',
    titleEs: 'Ensamblaje y Distribución de Cajas de Ayuda',
    role: 'Distribution',
    roleEs: 'Distribución',
    date: 'Saturday, October 3, 2026',
    time: '8:30 AM - 1:00 PM',
    durationHours: 4.5,
    spotsTotal: 8,
    spotsFilled: 3,
    description: 'Pack non-perishable food boxes, sort donated winter coats, and assist families loading supplies.',
    descriptionEs: 'Empaca cajas de alimentos no perecederos, clasifica abrigos e incentiva la carga de suministros a las familias.',
    isTakenByMe: false
  }
];

export const MOCK_VOLUNTEER: VolunteerProfile = {
  id: 'vol-77',
  email: 'volunteer.sarah@pawtx.org',
  fullName: 'Sarah Jenkins',
  phone: '(432) 555-8822',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
  totalHours: 18.5,
  shiftsCompleted: 6,
  badges: ['Culinary Ambassador', 'Heritage Helper', 'Community Builder'],
  joinedDate: 'March 2024'
};
