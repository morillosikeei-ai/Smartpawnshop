import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { matchPsgcAddress } from './addressMatch';

// The real PSGC files the API serves, read straight from the API project.
const PSGC = resolve(__dirname, '../../../pawnsmart-api/resources/psgc');
const read = (file: string) => JSON.parse(readFileSync(resolve(PSGC, file), 'utf8'));

vi.mock('../services/api', () => ({
  METRO_MANILA_CODE: 'NCR',
  getPsgcProvinces: async () => read('provinces.json'),
  getPsgcCities: async (code: string) => read('cities.json')[code] || [],
  getPsgcBarangays: async (code: string) => read(`barangays/${code}.json`),
}));

describe('matchPsgcAddress', () => {
  it('picks province, city and barangay, and keeps the rest as the street', async () => {
    const address = await matchPsgcAddress('Blk 5 Lot 2 Rizal St., Brgy. Kauswagan, Cagayan De Oro City, Misamis Oriental');

    expect(address).toMatchObject({
      province: 'Misamis Oriental',
      city: 'City of Cagayan De Oro',
      barangay: 'Kauswagan',
      street: 'Blk 5 Lot 2 Rizal St.',
    });
    expect(address.provinceCode).toBe('104300000');
    expect(address.cityCode).toBe('104305000');
  });

  it('finds a Metro Manila city when the ID prints no province', async () => {
    const address = await matchPsgcAddress('12 Mabini Street, Bagong Pag-asa, Quezon City');

    expect(address).toMatchObject({ provinceCode: 'NCR', province: 'Metro Manila', city: 'Quezon City', street: '12 Mabini Street' });
    expect(address.barangay.toLowerCase()).toBe('bagong pag-asa');
  });

  it('does not read a house number as a numbered barangay', async () => {
    const address = await matchPsgcAddress('1 Rizal St, Cagayan De Oro City, Misamis Oriental');

    expect(address.city).toBe('City of Cagayan De Oro');
    expect(address.barangay).toBe('');
  });

  it('keeps the whole text as the street when no place matches', async () => {
    const address = await matchPsgcAddress('Somewhere Unknown Road');

    expect(address).toMatchObject({ provinceCode: '', cityCode: '', barangay: '', street: 'Somewhere Unknown Road' });
  });
});
