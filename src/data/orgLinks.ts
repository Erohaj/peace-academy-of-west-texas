/**
 * The organisation's real public links — single source of truth.
 *
 * Taken from the PAWTX Taplink page (taplink.cc/paowt). Share-tracking
 * parameters are stripped: X handed out `?s=11` and YouTube `?si=…`, both of
 * which identify the share that produced the click and neither of which
 * belongs in a link published on a website.
 *
 * Note the handles are genuinely inconsistent across platforms — `paowtx` on
 * Instagram and X, `pawtx` on Facebook and YouTube. That is how the accounts
 * exist; do not "fix" one to match the others or the link will 404.
 */

export const ORG_LINKS = {
  instagram: 'https://www.instagram.com/paowtx/',
  // Resolved from the facebook.com/share/18G944FCgW/ short link.
  facebook: 'https://www.facebook.com/pawtx',
  youtube: 'https://www.youtube.com/@pawtx',
  x: 'https://x.com/paowtx',
  website: 'https://www.pawtx.org/',
  linkInBio: 'https://taplink.cc/paowt',
  /** Google Maps pin for the Odessa address shown in the footer. */
  map: 'https://maps.app.goo.gl/nv8kZ8gfHZnmALD38'
} as const;

export const ORG_ADDRESS = '3411 Brentwood Dr, Odessa, TX 79762';
