/**
 * Advisory ID check for customer registration.
 *
 * Tesseract reads the text on the valid ID photo in the browser, and the name
 * staff typed is looked for in that text. OCR misreads real IDs often (glare,
 * security patterns, stylised fonts), so the result is a hint for the staff,
 * never a reason to block a registration.
 */

export type IdNameMatch = 'match' | 'mismatch' | 'unreadable';

/** Fewer letters and digits than this and the photo is treated as unreadable. */
export const MIN_READABLE_CHARS = 20;

/**
 * Run OCR on an ID photo and return the raw text.
 *
 * Tesseract is loaded on first use so its code stays out of the main bundle.
 * The first run also downloads the English language data, which takes a few
 * seconds on a slow connection.
 */
export async function extractIdText(file: File | Blob): Promise<string> {
  const { default: Tesseract } = await import('tesseract.js');
  const result = await Tesseract.recognize(file, 'eng');
  return result.data.text || '';
}

/**
 * Upper case, accents removed, anything but letters and digits turned into a
 * space. "Dela Cruz, Juan Ñ." becomes "DELA CRUZ JUAN N".
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** Edit distance between two strings, stopping early once it passes `limit`. */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

/** Misread characters allowed for a name word of this length. */
function allowedErrors(length: number): number {
  if (length <= 3) return 0;
  if (length <= 7) return 1;
  return 2;
}

/**
 * Whether one name word appears in the OCR text, allowing a few misread
 * characters. Also looks inside the text with spaces removed, since OCR often
 * runs neighbouring words together ("DELACRUZ").
 */
function wordFound(word: string, tokens: string[], compact: string): boolean {
  const limit = allowedErrors(word.length);
  if (tokens.some(token => editDistance(word, token, limit) <= limit)) return true;
  if (word.length < 4) return false;
  if (compact.includes(word)) return true;
  if (limit === 0) return false;
  for (let start = 0; start + word.length - 1 <= compact.length; start++) {
    for (const size of [word.length - 1, word.length, word.length + 1]) {
      if (size < 1 || start + size > compact.length) continue;
      if (editDistance(word, compact.slice(start, start + size), limit) <= limit) return true;
    }
  }
  return false;
}

/**
 * Compare the typed full name with the text read off the ID.
 *
 * - `unreadable`: the OCR found too little text to judge, usually a blurry,
 *   dark, or cropped photo.
 * - `match`: enough of the name's words were found. One or two word names need
 *   every word; longer names need at least 2 words and 60% of them, so a
 *   middle name printed as an initial, or one misread word, still matches.
 * - `mismatch`: otherwise.
 *
 * Single letters (middle initials) are ignored because OCR noise is full of them.
 */
export function matchNameToIdText(fullName: string, ocrText: string): IdNameMatch {
  const text = normalizeText(ocrText);
  if (text.replace(/ /g, '').length < MIN_READABLE_CHARS) return 'unreadable';

  const words = Array.from(new Set(normalizeText(fullName).split(' ').filter(word => word.length >= 2)));
  if (words.length === 0) return 'mismatch';

  const tokens = text.split(' ');
  const compact = text.replace(/ /g, '');
  const found = words.filter(word => wordFound(word, tokens, compact)).length;

  if (words.length <= 2) return found === words.length ? 'match' : 'mismatch';
  return found >= 2 && found / words.length >= 0.6 ? 'match' : 'mismatch';
}
