import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AddressFields from './AddressFields';
import { EMPTY_ADDRESS, formatCompleteAddress, type AddressValue } from './address';

vi.mock('../services/api', () => ({
  getPsgcProvinces: vi.fn(async () => [
    { code: 'NCR', name: 'Metro Manila' },
    { code: '104300000', name: 'Misamis Oriental' },
  ]),
  getPsgcCities: vi.fn(async (province: string) => (province === 'NCR'
    ? [{ code: '137404000', name: 'Quezon City' }]
    : [{ code: '104305000', name: 'City of Cagayan De Oro' }])),
  getPsgcBarangays: vi.fn(async (city: string) => (city === '137404000' ? ['Bagong Pag-asa'] : ['Kauswagan', 'Barangay 1 (Pob.)'])),
}));

const Harness: React.FC = () => {
  const [value, setValue] = useState<AddressValue>(EMPTY_ADDRESS);
  return <AddressFields value={value} onChange={setValue} />;
};

const field = (label: string) => (label === 'Complete address'
  ? screen.getByLabelText(label)
  : screen.getByRole('combobox', { name: label })) as HTMLInputElement;

/** Open a dropdown, type to search, and pick the option. */
const pick = async (label: string, search: string, option: string) => {
  await waitFor(() => expect(field(label).disabled).toBe(false));
  fireEvent.click(field(label));
  fireEvent.change(field(label), { target: { value: search } });
  fireEvent.click(await screen.findByRole('option', { name: option }));
};

describe('formatCompleteAddress', () => {
  it('reads House No./Street, Brgy. Barangay, City, Province', () => {
    expect(formatCompleteAddress({ provinceCode: 'x', province: 'Misamis Oriental', cityCode: 'y', city: 'City of Cagayan De Oro', barangay: 'Kauswagan', street: ' 123 Rizal St. ' }))
      .toBe('123 Rizal St., Brgy. Kauswagan, City of Cagayan De Oro, Misamis Oriental');
  });

  it('leaves out what is not filled in, and never writes "Brgy. Barangay"', () => {
    expect(formatCompleteAddress({ ...EMPTY_ADDRESS, province: 'Metro Manila', city: 'City of Manila', barangay: 'Barangay 1' }))
      .toBe('Brgy. 1, City of Manila, Metro Manila');
    expect(formatCompleteAddress(EMPTY_ADDRESS)).toBe('');
  });
});

describe('AddressFields', () => {
  it('opens each dropdown only after the one before it, and fills the complete address', async () => {
    render(<Harness />);

    expect(field('City / Municipality').disabled).toBe(true);
    expect(field('Barangay').disabled).toBe(true);

    await pick('Province', 'misamis', 'Misamis Oriental');
    expect(field('Barangay').disabled).toBe(true);
    await pick('City / Municipality', 'cagayan', 'City of Cagayan De Oro');
    await pick('Barangay', 'kausw', 'Kauswagan');
    // The street is an IonInput, which jsdom does not render; its formatting is covered above.

    expect(field('Complete address').value).toBe('Brgy. Kauswagan, City of Cagayan De Oro, Misamis Oriental');
  });

  it('a new province clears the city and barangay under the old one', async () => {
    render(<Harness />);
    await pick('Province', 'misamis', 'Misamis Oriental');
    await pick('City / Municipality', 'cagayan', 'City of Cagayan De Oro');
    await pick('Barangay', 'kausw', 'Kauswagan');

    await pick('Province', 'metro', 'Metro Manila');

    expect(field('City / Municipality').value).toBe('');
    expect(field('Barangay').value).toBe('');
    expect(field('Barangay').disabled).toBe(true);
    expect(field('Complete address').value).toBe('Metro Manila');
    // Metro Manila's cities load straight away.
    await pick('City / Municipality', 'quezon', 'Quezon City');
  });

  it('only takes a listed option: typed text that matches nothing is dropped', async () => {
    render(<Harness />);
    await pick('Province', 'misamis', 'Misamis Oriental');

    fireEvent.click(field('Province'));
    fireEvent.change(field('Province'), { target: { value: 'Atlantis' } });
    expect(screen.getByText(/No match for/)).toBeTruthy();
    fireEvent.blur(field('Province'));

    expect(field('Province').value).toBe('Misamis Oriental');
  });
});
