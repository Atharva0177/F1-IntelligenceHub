/**
 * driverImages.ts
 *
 * Automatic F1 driver image URL generation.
 *
 * The F1 CDN path is:
 *   https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_{width}/
 *   content/dam/fom-website/drivers/{year}drivers/{slug}.png
 *
 * The slug is almost always the driver's last name in lowercase ASCII
 * (diacritics stripped, spaces → underscores). We also try the full
 * "firstname_lastname" variant as a fallback, plus multiple season folders
 * because the CDN retains images from prior years.
 */

/** Strip diacritics and produce a URL-safe lowercase slug from a name. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics: ü→u, é→e, ä→a …
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z_]/g, '');
}

const CDN_BASE =
  'https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_{W}/content/dam/fom-website/drivers';

// Season folders to try, newest first (kept short to minimise 404 requests).
const ALL_YEARS = [2026, 2025, 2024, 2023, 2022, 2021];

/**
 * Returns an ordered list of candidate F1 CDN image URLs for a driver.
 *
 * The caller should try each URL in sequence, advancing to the next on
 * `<img onError>`. This makes driver images fully automatic — no static
 * lookup table is needed.
 *
 * @param firstName  Driver first name from the DB (e.g. "Lewis")
 * @param lastName   Driver last name from the DB (e.g. "Hamilton")
 * @param season     The primary season to display (tried first)
 * @param width      Desired image width (used in Cloudinary transform)
 */
export function getDriverImageUrls(
  firstName: string,
  lastName: string,
  season: number,
  width = 500,
): string[] {
  const base = CDN_BASE.replace('{W}', String(width));

  const lastSlug  = slugify(lastName || '');
  const fullSlug  = slugify(`${firstName || ''}_${lastName || ''}`);

  // Extra variants for compound last names like "De Vries", "Van Doorne", etc.
  const lastWords  = (lastName || '').trim().split(/\s+/);
  const lastWordSlug  = slugify(lastWords[lastWords.length - 1] || '');          // "vries"
  const nospaceSlug   = slugify((lastName || '').replace(/\s+/g, ''));           // "devries"
  const fullNospaceSlug = slugify(`${firstName || ''}${lastName || ''}`);        // "nyckdevries"

  // Unique slugs — most specific first
  const slugs = [...new Set(
    [lastSlug, fullSlug, lastWordSlug, nospaceSlug, fullNospaceSlug]
      .filter(s => s.length > 0),
  )];

  // Season folders: requested year first, then all others newest→oldest
  const years = [season, ...ALL_YEARS.filter(y => y !== season)];

  const urls: string[] = [];
  for (const year of years) {
    for (const slug of slugs) {
      urls.push(`${base}/${year}drivers/${slug}.png`);
    }
  }
  return urls;
}
