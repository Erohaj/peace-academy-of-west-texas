import { SocialPost } from '../types';
import { IMAGES } from './mockData';

export const INITIAL_SOCIAL_POSTS: SocialPost[] = [
  {
    id: 'post-1',
    platform: 'instagram',
    author: {
      name: 'Peace Academy West Texas',
      handle: '@pawtx_org',
      avatarUrl: IMAGES.logo,
      verified: true
    },
    content: '✨ What a magical night at our International Dumpling & Cooking Workshop in Odessa! Over 25 community members learned spice techniques and shared authentic stories around the kitchen table. Next workshop is August 15th! 🥟❤️ #PeaceAcademyWTX #WestTexas #OdessaTX #CommunityCooking #InterfaithDialogue',
    contentEs: '✨ ¡Qué noche tan mágica en nuestro Taller de Empanadas y Cocina Internacional en Odessa! Más de 25 miembros comunitarios aprendieron técnicas de especias y compartieron historias auténticas. ¡Próximo taller el 15 de agosto! 🥟❤️ #PeaceAcademyWTX #WestTexas #OdessaTX',
    mediaUrl: IMAGES.cookingClass,
    mediaType: 'image',
    publishedAt: '2026-07-24T15:00:00Z',
    publishedAtRelative: '2 hours ago',
    publishedAtRelativeEs: 'Hace 2 horas',
    likesCount: 142,
    commentsCount: 18,
    sharesCount: 12,
    postUrl: 'https://instagram.com/p/pawtx_cooking_aug2026',
    tags: ['CommunityCooking', 'WestTexas', 'OdessaTX', 'InterfaithDialogue'],
    isLiked: false,
    commentsList: [
      {
        id: 'c1',
        authorName: 'Elena Ramirez',
        authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80',
        text: 'The food was delicious! Can’t wait for the next workshop!',
        createdAt: '1 hour ago'
      },
      {
        id: 'c2',
        authorName: 'David Miller',
        authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80',
        text: 'Loved meeting new neighbors from Midland & Odessa!',
        createdAt: '30 mins ago'
      }
    ]
  },
  {
    id: 'post-2',
    platform: 'facebook',
    author: {
      name: 'Peace Academy of West Texas',
      handle: '@PeaceAcademyWestTexas',
      avatarUrl: IMAGES.logo,
      verified: true
    },
    content: '📢 ANNOUNCEMENT: Registration for the 2026 West Texas International Heritage Parade & Festival is officially OPEN! We are hosting over 15 cultural pavilions representing Tajikistan, Kenya, Mexico, USA, and more at Noel Heritage Plaza in Downtown Odessa. Reserve your free tickets or sign up to volunteer today! 🌟',
    contentEs: '📢 ANUNCIO: ¡Las inscripciones para el Desfile y Festival Internacional de la Herencia del Oeste de Tejas 2026 ya están OFICIALMENTE ABIERTAS! Tendremos más de 15 pabellones culturales representando a Tayikistán, Kenia, México, EE. UU. y más. ¡Reserva tus pases o inscríbete como voluntario! 🌟',
    mediaUrl: IMAGES.parade,
    mediaType: 'image',
    publishedAt: '2026-07-24T12:00:00Z',
    publishedAtRelative: '5 hours ago',
    publishedAtRelativeEs: 'Hace 5 horas',
    likesCount: 289,
    commentsCount: 43,
    sharesCount: 67,
    postUrl: 'https://facebook.com/PeaceAcademyWestTexas/posts/festival2026',
    tags: ['HeritageParade', 'WestTexasFestival', 'OdessaEvents', 'Volunteer'],
    isLiked: true,
    commentsList: [
      {
        id: 'c3',
        authorName: 'Maria Santos',
        authorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80',
        text: 'Our family goes every year! So excited for the parade!',
        createdAt: '4 hours ago'
      }
    ]
  },
  {
    id: 'post-3',
    platform: 'youtube',
    author: {
      name: 'Peace Academy West Texas Official',
      handle: '@PeaceAcademyWTX_Official',
      avatarUrl: IMAGES.logo,
      verified: true
    },
    content: '🎥 NEW VIDEO: "Building Bridges in Permian Basin - Highlights from 2025 Interfaith Seminars & Cultural Dinners". Watch how neighbors from Midland & Odessa are coming together to create lasting cross-cultural understanding. Click to watch the full mini-documentary! 🔔 Subscribe for more stories.',
    contentEs: '🎥 NUEVO VIDEO: "Construyendo Puentes en Permian Basin - Destacados de Seminarios Interfe y Cenas Culturales". Mira cómo los vecinos de Midland y Odessa se unen para promover el entendimiento cultural. ¡Suscríbete!',
    mediaUrl: IMAGES.seminar,
    mediaType: 'video',
    publishedAt: '2026-07-23T18:00:00Z',
    publishedAtRelative: '1 day ago',
    publishedAtRelativeEs: 'Hace 1 día',
    likesCount: 512,
    commentsCount: 39,
    sharesCount: 88,
    postUrl: 'https://youtube.com/watch?v=pawtx_interfaith_documentary',
    tags: ['PermianBasin', 'InterfaithDialogue', 'WestTexasDocu', 'BuildingBridges'],
    isLiked: false,
    commentsList: []
  },
  {
    id: 'post-4',
    platform: 'x',
    author: {
      name: 'Peace Academy WTX',
      handle: '@PAWTX_Org',
      avatarUrl: IMAGES.logo,
      verified: true
    },
    content: 'Heartfelt gratitude to our 40+ volunteers who packed and distributed 150+ emergency food & clothing kits in Midland this morning! Together, we make West Texas stronger. 🧥📦 #PermianBasin #WestTexasStrong #VolunteerImpact #NonProfit',
    contentEs: '¡Profundo agradecimiento a nuestros más de 40 voluntarios que empacaron y distribuyeron más de 150 kits de alimentos y ropa de emergencia en Midland esta mañana! Juntos fortalecemos el oeste de Tejas. 🧥📦',
    mediaUrl: IMAGES.reliefDrive,
    mediaType: 'image',
    publishedAt: '2026-07-22T14:00:00Z',
    publishedAtRelative: '2 days ago',
    publishedAtRelativeEs: 'Hace 2 días',
    likesCount: 198,
    commentsCount: 14,
    sharesCount: 42,
    postUrl: 'https://x.com/PAWTX_Org/status/relief_drive_2026',
    tags: ['PermianBasin', 'WestTexasStrong', 'VolunteerImpact'],
    isLiked: false,
    commentsList: []
  },
  {
    id: 'post-5',
    platform: 'instagram',
    author: {
      name: 'Peace Academy West Texas',
      handle: '@pawtx_org',
      avatarUrl: IMAGES.logo,
      verified: true
    },
    content: '☕ Ladies Coffee & Cultural Exchange Night in Midland was filled with warm conversations, delicious traditional pastries, and inspiring connections. Swipe to see the beautiful smiles from Thursday evening! 🌸 #WestTexasWomen #CulturalExchange #MidlandTX #CommunityFirst',
    contentEs: '☕ La Noche de Café y Cultura para Mujeres en Midland estuvo llena de cálidas conversaciones, deliciosos pasteles e inspiradoras conexiones. ¡Desliza para ver las hermosas sonrisas! 🌸',
    mediaUrl: IMAGES.coffeeNight,
    mediaType: 'image',
    publishedAt: '2026-07-21T20:00:00Z',
    publishedAtRelative: '3 days ago',
    publishedAtRelativeEs: 'Hace 3 días',
    likesCount: 310,
    commentsCount: 27,
    sharesCount: 19,
    postUrl: 'https://instagram.com/p/ladies_coffee_night',
    tags: ['WestTexasWomen', 'CulturalExchange', 'MidlandTX'],
    isLiked: true,
    commentsList: [
      {
        id: 'c4',
        authorName: 'Sarah Jenkins',
        authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80',
        text: 'Such an uplifting evening! Thank you Peace Academy!',
        createdAt: '2 days ago'
      }
    ]
  },
  {
    id: 'post-6',
    platform: 'facebook',
    author: {
      name: 'Peace Academy of West Texas',
      handle: '@PeaceAcademyWestTexas',
      avatarUrl: IMAGES.logo,
      verified: true
    },
    content: 'Did you know? All Peace Academy events are 100% community-funded and volunteer-run. Your small contribution helps us keep cooking workshops and youth cultural events accessible for everyone in West Texas. 💙 Learn how to support us!',
    contentEs: '¿Sabías que? Todos los eventos de Peace Academy son 100% financiados por la comunidad y dirigidos por voluntarios. Tu contribución nos ayuda a mantener los talleres accesibles para todos. 💙 ¡Descubre cómo apoyarnos!',
    mediaUrl: IMAGES.communitySign,
    mediaType: 'image',
    publishedAt: '2026-07-20T10:00:00Z',
    publishedAtRelative: '4 days ago',
    publishedAtRelativeEs: 'Hace 4 días',
    likesCount: 245,
    commentsCount: 19,
    sharesCount: 31,
    postUrl: 'https://facebook.com/PeaceAcademyWestTexas/posts/community_impact',
    tags: ['NonProfit', 'WestTexas', 'CommunitySupport'],
    isLiked: false,
    commentsList: []
  }
];
