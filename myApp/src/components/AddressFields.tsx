import React, { useEffect, useMemo, useState } from 'react';
import { IonIcon, IonInput, IonItem, IonLabel } from '@ionic/react';
import { locationOutline } from 'ionicons/icons';
import SearchSelect from './SearchSelect';
import type { ComboOption } from './Combobox';
import { getPsgcBarangays, getPsgcCities, getPsgcProvinces, type PsgcPlace } from '../services/api';
import { formatCompleteAddress, type AddressValue } from './address';
import './AddressFields.css';

const toOptions = (places: PsgcPlace[]): ComboOption[] => places.map(place => ({ value: place.code, label: place.name }));

type Props = {
  value: AddressValue;
  onChange: (value: AddressValue) => void;
  errors?: Partial<Record<'province' | 'city' | 'barangay', string>>;
};

/**
 * Province, City/Municipality and Barangay from the official PSGC list, then
 * the house number and street, then the complete address built from them.
 *
 * Each list stays disabled until the one before it is picked, and picking a
 * different parent clears everything under it. Metro Manila is listed as a
 * province, so its cities load straight away. Rendered as cells of the
 * surrounding two-column form grid.
 */
const AddressFields: React.FC<Props> = ({ value, onChange, errors = {} }) => {
  const [provinces, setProvinces] = useState<ComboOption[]>([]);
  const [cities, setCities] = useState<ComboOption[]>([]);
  const [barangays, setBarangays] = useState<ComboOption[]>([]);
  const [loading, setLoading] = useState<'province' | 'city' | 'barangay' | null>('province');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let live = true;
    getPsgcProvinces()
      .then(rows => { if (live) setProvinces(toOptions(rows)); })
      .catch(() => { if (live) setLoadError('The address list could not be loaded. Check the connection and reopen this form.'); })
      .finally(() => { if (live) setLoading(null); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    setCities([]);
    if (!value.provinceCode) return undefined;
    let live = true;
    setLoading('city');
    getPsgcCities(value.provinceCode)
      .then(rows => { if (live) setCities(toOptions(rows)); })
      .catch(() => { if (live) setLoadError('The cities could not be loaded. Pick the province again.'); })
      .finally(() => { if (live) setLoading(null); });
    return () => { live = false; };
  }, [value.provinceCode]);

  useEffect(() => {
    setBarangays([]);
    if (!value.cityCode) return undefined;
    let live = true;
    setLoading('barangay');
    getPsgcBarangays(value.cityCode)
      .then(rows => { if (live) setBarangays(rows.map(name => ({ value: name, label: name }))); })
      .catch(() => { if (live) setLoadError('The barangays could not be loaded. Pick the city again.'); })
      .finally(() => { if (live) setLoading(null); });
    return () => { live = false; };
  }, [value.cityCode]);

  const complete = useMemo(() => formatCompleteAddress(value), [value]);

  return (
    <>
      <SearchSelect
        label="Province"
        value={value.provinceCode}
        options={provinces}
        loading={loading === 'province'}
        placeholder="Search province or Metro Manila"
        error={errors.province}
        onChange={(option) => {
          setLoadError('');
          // A new province clears the city and barangay under the old one.
          onChange({ ...value, provinceCode: option?.value || '', province: option?.label || '', cityCode: '', city: '', barangay: '' });
        }}
      />

      <SearchSelect
        label="City / Municipality"
        value={value.cityCode}
        options={cities}
        disabled={!value.provinceCode}
        disabledHint="Pick a province first"
        loading={loading === 'city'}
        placeholder="Search city or municipality"
        error={errors.city}
        onChange={(option) => {
          setLoadError('');
          onChange({ ...value, cityCode: option?.value || '', city: option?.label || '', barangay: '' });
        }}
      />

      <SearchSelect
        label="Barangay"
        value={value.barangay}
        options={barangays}
        disabled={!value.cityCode}
        disabledHint="Pick a city or municipality first"
        loading={loading === 'barangay'}
        placeholder="Search barangay"
        error={errors.barangay}
        onChange={(option) => onChange({ ...value, barangay: option?.value || '' })}
      />

      <IonItem lines="none" className="tx-field">
        <IonLabel position="stacked">House No. / Street</IonLabel>
        <IonInput
          value={value.street}
          maxlength={255}
          onIonInput={(event) => onChange({ ...value, street: event.detail.value || '' })}
          placeholder="e.g. 123 Rizal St., Purok 4"
        />
      </IonItem>

      <div className="tx-address-complete span-2" aria-live="polite">
        <span className="tx-address-complete-label">Complete Address</span>
        <div className={`tx-address-complete-value ${complete ? '' : 'is-empty'}`}>
          <IonIcon icon={locationOutline} aria-hidden="true" />
          <input
            readOnly
            tabIndex={-1}
            aria-label="Complete address"
            value={complete}
          />
        </div>
      </div>

      {loadError && <p className="tx-address-error span-2" role="alert">{loadError}</p>}
    </>
  );
};

export default AddressFields;
