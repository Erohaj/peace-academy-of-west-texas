// Registry of the bundled, optimized PAWTX photos.
//
// The name is historical: this file used to hold INITIAL_EVENTS,
// INITIAL_GALLERY, INITIAL_SHIFTS and MOCK_VOLUNTEER as well. That content now
// lives in Postgres (see supabase/seed.sql) and is loaded through
// src/lib/api/*. What remains is the image registry, which cannot move to the
// database: Vite content-hashes these files at build time, so the database
// stores an `image_key` naming an entry here rather than a URL. Admin-uploaded
// photos go to Supabase Storage and carry a real `image_url` instead — see
// resolveImage() in src/lib/api/images.ts.

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
import waterWellImg from '../assets/water-well.webp';
import friendshipDinnerImg from '../assets/friendship-dinner.webp';

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
  // Real PAWTX photos — the Annual Friendship Dinner ("In Times of Polarization")
  // and the Odessa Youth Club water well in Chad/Mouray. These were the last two
  // stock placeholders in IMAGES, so every content photo is now bundled and none
  // can disappear the way the old water-well Unsplash URL did. (Unsplash is still
  // used for mock avatars in socialPosts.ts — demo people, not org content.)
  seminar: friendshipDinnerImg,
  waterWell: waterWellImg
};

/** Valid values for the `image_key` column on events and gallery_items. */
export type ImageKey = keyof typeof IMAGES;
