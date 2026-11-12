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

/**
 * Characters OCR confuses with letters, read as the letter. Folding both the
 * name and the text this way lets "M1GUEL" match "MIGUEL" while a real letter
 * difference ("MERRY" against "MARY") still counts as a different name.
 */
const OCR_LOOKALIKES: Record<string, string> = { '0': 'O', '1': 'I', '|': 'I', '5': 'S', '8': 'B', '2': 'Z', '6': 'G', '4': 'A' };
const foldLookalikes = (text: string) => text.replace(/[0-9|]/g, char => OCR_LOOKALIKES[char] ?? char);

/**
 * One stray or dropped character allowed in a long name word (7+ letters),
 * where OCR noise is likelier than a different name. Shorter words must match
 * exactly, since one letter there is a different name: MARY and MERY.
 */
function allowedErrors(length: number): number {
  return length >= 7 ? 1 : 0;
}

/**
 * Whether one name word appears in the OCR text. Also looks inside the text
 * with spaces removed, since OCR often runs neighbouring words together
 * ("DELACRUZ").
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
 * - `match`: every word of the typed name is on the ID, in any order. A
 *   middle initial typed as one letter is skipped.
 * - `mismatch`: any word is missing, so "Merry Dela Cruz" does not pass for
 *   "Mary Dela Cruz" just because the surname is right.
 */
export function matchNameToIdText(fullName: string, ocrText: string): IdNameMatch {
  const text = foldLookalikes(normalizeText(ocrText));
  if (text.replace(/ /g, '').length < MIN_READABLE_CHARS) return 'unreadable';

  const words = Array.from(new Set(foldLookalikes(normalizeText(fullName)).split(' ').filter(word => word.length >= 2)));
  if (words.length === 0) return 'mismatch';

  const tokens = text.split(' ');
  const compact = text.replace(/ /g, '');
  return words.every(word => wordFound(word, tokens, compact)) ? 'match' : 'mismatch';
}

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

/**
 * The ways Philippine IDs print a date, normalized like the OCR text:
 * "JANUARY 15 1990" (PhilSys), "1990 01 15" (license, UMID), "15 JAN 1990"
 * (passport), and day/month numbers either way round.
 */
function dateSpellings(isoDate: string): string[] {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return [];
  const [, year, month, day] = match;
  const name = MONTHS[Number(month) - 1];
  const short = name.slice(0, 3);
  const days = Array.from(new Set([day, String(Number(day))]));
  const out: string[] = [];
  for (const d of days) {
    out.push(`${year} ${month} ${d}`, `${month} ${d} ${year}`, `${d} ${month} ${year}`);
    for (const m of [name, short]) out.push(`${m} ${d} ${year}`, `${d} ${m} ${year}`);
  }
  return out;
}

/**
 * Whether the typed date of birth is printed on the ID, in any of the usual
 * layouts. `unreadable` when the OCR found too little text to judge.
 */
export function matchBirthdateToIdText(isoDate: string, ocrText: string): IdNameMatch {
  const text = normalizeText(ocrText);
  if (text.replace(/ /g, '').length < MIN_READABLE_CHARS) return 'unreadable';
  const compact = text.replace(/ /g, '');
  return dateSpellings(isoDate).some(spelling => compact.includes(spelling.replace(/ /g, ''))) ? 'match' : 'mismatch';
}

/**
 * Whether the typed ID number is printed on the ID. Spaces and dashes are
 * ignored, and letters OCR confuses with digits count as those digits.
 */
export function matchIdNumberToIdText(idNumber: string, ocrText: string): IdNameMatch {
  const text = normalizeText(ocrText);
  if (text.replace(/ /g, '').length < MIN_READABLE_CHARS) return 'unreadable';
  const number = foldLookalikes(normalizeText(idNumber).replace(/ /g, ''));
  if (number.length < 4) return 'mismatch';
  return foldLookalikes(text.replace(/ /g, '')).includes(number) ? 'match' : 'mismatch';
}

/** Fields read off an ID photo, each missing when it could not be found. */
export type IdFields = {
  fullName?: string;
  idType?: string;
  idNumber?: string;
  address?: string;
  /** Date of birth as YYYY-MM-DD. */
  birthdate?: string;
};

/**
 * ID types by words printed on the card. The first three match the Valid ID
 * Type suggestions; the rest are typed in as custom types. Order matters: a
 * UMID also says "Social Security System".
 */
const ID_TYPES: Array<{ type: string; words: RegExp }> = [
  { type: 'National ID', words: /PHILIPPINE IDENTIFICATION|PAMBANSANG PAGKAKAKILANLAN|PHILSYS/ },
  { type: "Driver's License", words: /DRIVER.?S LICEN[SC]E|LAND TRANSPORTATION OFFICE|NON.?PROFESSIONAL|\bLTO\b/ },
  { type: 'Passport', words: /PASSPORT|PASAPORTE|^P<PHL/m },
  { type: 'UMID', words: /UNIFIED MULTI.?PURPOSE|\bUMID\b|\bCRN\b/ },
  { type: 'SSS ID', words: /SOCIAL SECURITY SYSTEM/ },
  { type: 'PRC ID', words: /PROFESSIONAL REGULATION/ },
  { type: 'Postal ID', words: /POSTAL IDENTITY|PHLPOST|PHILPOST/ },
  { type: "Voter's ID", words: /COMMISSION ON ELECTIONS|COMELEC|VOTER/ },
  { type: 'TIN ID', words: /BUREAU OF INTERNAL REVENUE|TAX(PAYER)? IDENTIFICATION/ },
  { type: 'PhilHealth ID', words: /PHILHEALTH|PHILIPPINE HEALTH INSURANCE/ },
];

/**
 * ID number layouts, tried for the detected type first and then all of them.
 * OCR often reads the dashes as spaces, so either is accepted.
 */
const ID_NUMBERS: Record<string, RegExp> = {
  'National ID': /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/,
  "Driver's License": /\b[A-Z]\d{2}[- ]\d{2}[- ]\d{6}\b/,
  Passport: /\b[A-Z]{1,2}\d{6,7}[A-Z]?(?=[^A-Z]|$)/,
  UMID: /\b\d{4}[- ]\d{7}[- ]\d\b/,
  'SSS ID': /\b\d{2}[- ]\d{7}[- ]\d\b/,
  'TIN ID': /\b\d{3}[- ]\d{3}[- ]\d{3}(?:[- ]\d{3,5})?\b/,
  'PhilHealth ID': /\b\d{2}[- ]\d{9}[- ]\d\b/,
  'PRC ID': /\b\d{7}\b/,
};

/** Name particles kept lower case after the first word: "Juan de los Santos". */
const PARTICLES = new Set(['de', 'del', 'la', 'los', 'y']);

/** "DELA CRUZ" as "Dela Cruz". */
const titleCase = (text: string) =>
  text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => (index > 0 && PARTICLES.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');

/** Words that mark a label or heading line, never a name. */
const NOT_A_NAME = /\b(NAMES?|APELYIDO|PANGALAN|REPUBLI[CK]A?|PILIPINAS|PHILIPPINES?|DATE|PETSA|SEX|ADDRESS|TIRAHAN|CARD|OFFICE|LICENSE)\b/;

/** A line that could be a name: letters, spaces, dots, dashes and Ñ only. */
const isNameLine = (line: string) => /^[A-ZÑ][A-ZÑ .'-]{1,40}$/.test(line) && !NOT_A_NAME.test(line);

/** The first name-like value on the line matching `label`, or on the next two lines. */
function valueAfter(lines: string[], label: RegExp): string | undefined {
  const index = lines.findIndex(line => label.test(line));
  if (index < 0) return undefined;
  const sameLine = lines[index].replace(new RegExp(`.*(${label.source})`), '').replace(/^[\s:/.-]+/, '').trim();
  if (sameLine && isNameLine(sameLine)) return sameLine;
  return lines.slice(index + 1, index + 3).find(isNameLine);
}

/** Name from a passport's machine readable line: P<PHLDELA<CRUZ<<JUAN<MIGUEL<<<. */
function passportName(lines: string[]): string | undefined {
  const mrz = lines.map(line => line.replace(/\s/g, '')).find(line => /^P<[A-Z]{3}[A-Z<]+$/.test(line));
  if (!mrz) return undefined;
  const [surname, given = ''] = mrz.slice(5).split('<<');
  const last = surname.replace(/</g, ' ').trim();
  const first = given.replace(/</g, ' ').trim();
  return last && first ? `${first} ${last}` : undefined;
}

/** A date in one of the ID layouts, as YYYY-MM-DD, or undefined. */
function readDate(text: string): string | undefined {
  const pad = (n: number) => String(n).padStart(2, '0');
  const valid = (y: number, m: number, d: number) => y > 1900 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  let found = text.match(/\b(\d{4})[/ .-](\d{1,2})[/ .-](\d{1,2})\b/);
  if (found && valid(+found[1], +found[2], +found[3])) return `${found[1]}-${pad(+found[2])}-${pad(+found[3])}`;
  found = text.match(/\b([A-Z]{3,9})\.? (\d{1,2}),? (\d{4})\b/);
  if (found) {
    const month = MONTHS.findIndex(name => name.startsWith(found![1].slice(0, 3))) + 1;
    if (month && valid(+found[3], month, +found[2])) return `${found[3]}-${pad(month)}-${pad(+found[2])}`;
  }
  found = text.match(/\b(\d{1,2}) ([A-Z]{3,9})\.? (\d{4})\b/);
  if (found) {
    const month = MONTHS.findIndex(name => name.startsWith(found![2].slice(0, 3))) + 1;
    if (month && valid(+found[3], month, +found[1])) return `${found[3]}-${pad(month)}-${pad(+found[1])}`;
  }
  found = text.match(/\b(\d{1,2})[/ .-](\d{1,2})[/ .-](\d{4})\b/);
  if (found && valid(+found[3], +found[1], +found[2])) return `${found[3]}-${pad(+found[1])}-${pad(+found[2])}`;
  return undefined;
}

/** The date of birth on the card: after a birth label first, else the first date. */
function readBirthdate(lines: string[]): string | undefined {
  const label = lines.findIndex(line => /BIRTH|KAPANGANAKAN|\bDOB\b/.test(line));
  if (label >= 0) {
    for (const line of lines.slice(label, label + 3)) {
      const date = readDate(line);
      if (date) return date;
    }
  }
  for (const line of lines) {
    const date = readDate(line);
    if (date) return date;
  }
  return undefined;
}

/**
 * Read the customer's details off the OCR text of an ID.
 *
 * Best effort for Philippine IDs: labelled name fields (Last Name / Surname /
 * Apelyido, Given Names / First Name, Middle Name), a driver's license's
 * "LAST, FIRST MIDDLE" line, or a passport's machine readable line. Any field
 * can be missing or misread, which is why staff confirm each one before it is
 * used.
 */
export function parseIdText(ocrText: string): IdFields {
  const upper = ocrText.normalize('NFC').toUpperCase();
  const lines = upper.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const fields: IdFields = {};

  const idType = ID_TYPES.find(entry => entry.words.test(upper))?.type;
  if (idType) fields.idType = idType;

  // Name: labelled fields first, then the license's one-line form, then a passport MRZ.
  const last = valueAfter(lines, /APELYIDO\/LAST ?NAME|LAST ?NAME|SURNAME/);
  const given = valueAfter(lines, /GIVEN ?NAMES?|FIRST ?NAME|MGA PANGALAN/);
  const middle = valueAfter(lines, /MIDDLE ?NAME|GITNANG APELYIDO/);
  const licenseLine = lines.find(line => /^[A-ZÑ .'-]{2,30}, ?[A-ZÑ .'-]{2,40}$/.test(line) && !NOT_A_NAME.test(line));
  if (last && given && last !== given) {
    const middleName = middle && middle !== last && middle !== given ? middle : '';
    fields.fullName = titleCase([given, middleName, last].filter(Boolean).join(' '));
  } else if (licenseLine) {
    const [surname, rest] = licenseLine.split(',').map(part => part.trim());
    fields.fullName = titleCase(`${rest} ${surname}`);
  } else {
    const fromPassport = passportName(lines);
    if (fromPassport) fields.fullName = titleCase(fromPassport);
  }

  // ID number: the detected type's layout first, then any known layout.
  const patterns = idType && ID_NUMBERS[idType] ? [ID_NUMBERS[idType], ...Object.values(ID_NUMBERS)] : Object.values(ID_NUMBERS);
  for (const pattern of patterns) {
    const found = upper.match(pattern);
    if (found) { fields.idNumber = found[0].replace(/ /g, '-'); break; }
  }

  // Date of birth: the first date after a birth label, or failing that the
  // first full date on the card, as YYYY-MM-DD.
  const birthdate = readBirthdate(lines);
  if (birthdate) fields.birthdate = birthdate;

  // Address: the rest of the Address / Tirahan line, plus up to two lines after it.
  const addressAt = lines.findIndex(line => /\b(ADDRESS|TIRAHAN)\b/.test(line));
  if (addressAt >= 0) {
    const sameLine = lines[addressAt].replace(/.*\b(ADDRESS|TIRAHAN)\b[\s:/]*/, '').trim();
    const next = lines
      .slice(addressAt + 1, addressAt + 3)
      .filter(line => /[A-Z]{3}/.test(line) && !/\b(DATE|PETSA|SEX|NATIONALITY|BLOOD|HEIGHT|WEIGHT|EXPIR\w*)\b/.test(line));
    const address = [sameLine.length > 5 ? sameLine : '', ...next].filter(Boolean).join(', ');
    if (address.length >= 8) fields.address = titleCase(address);
  }

  return fields;
}
