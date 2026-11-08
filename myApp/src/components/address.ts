/* Customer address picked from the PSGC list (see AddressFields.tsx). */

/** An address picked from the PSGC list, plus the street typed by staff. */
export type AddressValue = {
  provinceCode: string;
  province: string;
  cityCode: string;
  city: string;
  barangay: string;
  street: string;
};

export const EMPTY_ADDRESS: AddressValue = { provinceCode: '', province: '', cityCode: '', city: '', barangay: '', street: '' };

/**
 * "House No./Street, Brgy. Barangay, City, Province", from the parts picked so
 * far. A barangay already named "Barangay 1" reads "Brgy. 1". The API builds
 * the saved address the same way.
 */
export const formatCompleteAddress = (address: AddressValue) => {
  const barangay = address.barangay.trim().replace(/^(barangay|brgy\.?)\s+/i, '');
  return [
    address.street.trim(),
    barangay ? `Brgy. ${barangay}` : '',
    address.city,
    address.province,
  ].filter(Boolean).join(', ');
};

/** Whether province, city and barangay are all picked. */
export const isAddressPicked = (address: AddressValue) => Boolean(address.provinceCode && address.cityCode && address.barangay);
