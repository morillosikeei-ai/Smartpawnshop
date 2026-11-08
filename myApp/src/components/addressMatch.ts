/* Match an address read off an ID (OCR) to the PSGC list. */

import { getPsgcBarangays, getPsgcCities, getPsgcProvinces, METRO_MANILA_CODE, type PsgcPlace } from '../services/api';
import { EMPTY_ADDRESS, type AddressValue } from './address';

/** Upper case words only, padded with spaces, so " KAUSWAGAN " is a whole-word search. */
const words = (text: string) => ` ${text.normalize('NFC').toUpperCase().replace(/[^A-Z0-9Ñ]+/g, ' ').trim()} `;

/** "City of Cagayan De Oro" and "Quezon City" as the words an ID prints for them. */
const cityCore = (name: string) => words(name.replace(/\(.*?\)/g, '').replace(/^city of\s+/i, '').replace(/\s+city$/i, '')).trim();

/** "Barangay 1 (Pob.)" as "1"; "Kauswagan" as itself. */
const barangayCore = (name: string) => words(name.replace(/\(.*?\)/g, '').replace(/^(barangay|brgy\.?)\s+/i, '')).trim();

/**
 * The words to look for. A numbered barangay must follow "Barangay" or
 * "Brgy", or a house number "1" would match "Barangay 1".
 */
const barangayKey = (name: string) => {
  const core = barangayCore(name);
  return /^\d/.test(core) ? `BARANGAY ${core}` : core;
};

/** Whether the words appear in the text, and (for a province) not as the start of "X City". */
const appears = (text: string, key: string, notBeforeCity = false) => {
  for (let at = text.indexOf(` ${key} `); at >= 0; at = text.indexOf(` ${key} `, at + 1)) {
    if (!notBeforeCity || !text.startsWith(' CITY ', at + key.length + 1)) return true;
  }
  return false;
};

/** The longest entry whose words appear in the text, so "Misamis Oriental" wins over "Misamis". */
function longestIn<T>(text: string, items: T[], core: (item: T) => string, notBeforeCity = false): T | undefined {
  let best: T | undefined;
  let bestLength = 0;
  for (const item of items) {
    const key = core(item);
    if (key.length > bestLength && appears(text, key, notBeforeCity)) {
      best = item;
      bestLength = key.length;
    }
  }
  return best;
}

/**
 * Pick the province, city or municipality, and barangay named in an address
 * read off an ID, and keep what comes before the barangay as the street.
 *
 * Best effort: OCR misreads, and IDs print places their own way. Whatever is
 * found is filled in and the rest is left for staff to pick. An ID without a
 * province is tried against Metro Manila, whose IDs often leave it out. When
 * nothing matches, the whole text goes into the street so it is not lost.
 */
export async function matchPsgcAddress(idAddress: string): Promise<AddressValue> {
  const text = words(idAddress);
  const result: AddressValue = { ...EMPTY_ADDRESS };

  const provinces = await getPsgcProvinces();
  // "Quezon City" names a city, not Quezon province.
  let province: PsgcPlace | undefined = longestIn(text, provinces.filter(place => place.code !== METRO_MANILA_CODE), place => words(place.name).trim(), true);
  if (!province && /\s(METRO MANILA|NCR)\s/.test(text)) province = provinces.find(place => place.code === METRO_MANILA_CODE);

  let cities: PsgcPlace[] = province ? await getPsgcCities(province.code) : [];
  let city = longestIn(text, cities, place => cityCore(place.name));
  // No province printed, or none of its cities found: try Metro Manila.
  if (!city && province?.code !== METRO_MANILA_CODE) {
    cities = await getPsgcCities(METRO_MANILA_CODE);
    const metroCity = longestIn(text, cities, place => cityCore(place.name));
    if (metroCity) {
      city = metroCity;
      province = provinces.find(place => place.code === METRO_MANILA_CODE);
    }
  }

  if (province) Object.assign(result, { provinceCode: province.code, province: province.name });
  if (!city) {
    if (!province) result.street = idAddress.trim();
    return result;
  }
  Object.assign(result, { cityCode: city.code, city: city.name });

  const barangays = await getPsgcBarangays(city.code);
  const barangay = longestIn(text.replace(/ BRGY /g, ' BARANGAY '), barangays, barangayKey);
  if (!barangay) return result;
  result.barangay = barangay;

  // The street is what the ID prints before the barangay, without a trailing "Brgy.".
  const core = barangayCore(barangay).split(' ').map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^A-Za-z0-9Ñ]+');
  const at = idAddress.search(new RegExp(`(^|[^A-Za-z0-9Ñ])${core}($|[^A-Za-z0-9Ñ])`, 'i'));
  if (at > 0) {
    result.street = idAddress.slice(0, at + 1).replace(/[\s,]*(?:\b(?:brgy|barangay)\b\.?)?[\s,]*$/i, '').trim();
  }

  return result;
}
