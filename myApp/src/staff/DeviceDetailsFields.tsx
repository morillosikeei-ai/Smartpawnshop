import React from 'react';
import { IonInput, IonItem, IonLabel } from '@ionic/react';
import TypeSelect from '../components/TypeSelect';
import type { ComboOption } from '../components/Combobox';
import './DeviceDetailsFields.css';

/**
 * Step 2 fields for a watch, a cellphone, or a bulky item.
 *
 * The watch_phone group's two suggested item types each get their own set of
 * details, kept in items.item_details (see Item::DETAIL_FIELDS in the API). A
 * custom watch_phone type, a smart ring say, has none and keeps the plain
 * Brand/Model field. Every bulky item, suggested type or custom, shares one
 * set, with the size hint and a specs field following the type.
 */
export type DeviceKind = 'cellphone' | 'watch' | 'bulky';

/** Every detail as the form holds it. Yes/No answers are 'yes', 'no', or '' when unanswered. */
export type DeviceDetails = Record<string, string>;

export const EMPTY_DEVICE_DETAILS: DeviceDetails = {};

/** The structured details a stored item carries, as the API returns them. */
export type ApiItemDetails = Record<string, string | number | boolean | null>;

/** Which set of details the Item Type calls for, or null for none. */
export const deviceKindFor = (group: string, categoryValue: string): DeviceKind | null => {
  if (group === 'bulky') return 'bulky';
  return group === 'watch_phone' && (categoryValue === 'cellphone' || categoryValue === 'watch') ? categoryValue : null;
};

/** Bulky types that are computers or gadgets, which get a Specifications field. */
const GADGET_TYPES = new Set(['tablet', 'digital_camera', 'laptop', 'desktop_computer', 'notebook_netbook', 'game_console']);

/** What Size / Capacity means for a bulky type, as a placeholder. */
const SIZE_HINTS: Record<string, string> = {
  tv: 'e.g. 55 inch',
  aircon: 'e.g. 1.5 HP',
  refrigerator: 'e.g. 7 cu. ft.',
  washing_machine: 'e.g. 7 kg',
  electric_fan: 'e.g. 16 inch',
  gas_stove: 'e.g. 2 burners',
  water_dispenser: 'e.g. Hot and cold',
  home_theater: 'e.g. 5.1 channel, 1000 W',
  karaoke_machine: 'e.g. 2 mics, 500 W',
  tablet: 'e.g. 10.9 inch, 64GB',
  laptop: 'e.g. 15.6 inch, 512GB SSD',
  notebook_netbook: 'e.g. 11.6 inch, 128GB',
  desktop_computer: 'e.g. 1TB SSD, 24 inch monitor',
  game_console: 'e.g. 825GB',
  digital_camera: 'e.g. 24 MP',
  oven_toaster: 'e.g. 25 L',
  mixer_blender: 'e.g. 1.5 L',
};

const SPEC_HINTS: Record<string, string> = {
  laptop: 'e.g. Core i5 12th gen, 8GB RAM, RTX 3050',
  notebook_netbook: 'e.g. Celeron, 4GB RAM',
  desktop_computer: 'e.g. Ryzen 5 5600, 16GB RAM, GTX 1660',
  tablet: 'e.g. Wi-Fi + Cellular, with stylus',
  game_console: 'e.g. Disc edition, 2 controllers',
  digital_camera: 'e.g. Kit lens 18-55mm, 2 batteries',
};

const STORAGE_OPTIONS: ComboOption[] = ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB'].map(size => ({ value: size, label: size }));

const NETWORK_OPTIONS: ComboOption[] = [
  { value: 'openline', label: 'Openline' },
  { value: 'network_locked', label: 'Network locked' },
  { value: 'unknown', label: 'Not checked' },
];

const FUNCTIONALITY_OPTIONS: ComboOption[] = [
  { value: 'fully_functional', label: 'Fully functional' },
  { value: 'minor_issues', label: 'Minor issues' },
  { value: 'for_parts', label: 'Not working / for parts' },
];

const MOVEMENT_OPTIONS: ComboOption[] = [
  { value: 'automatic', label: 'Automatic' },
  { value: 'quartz', label: 'Quartz' },
  { value: 'manual', label: 'Manual' },
];

const MATERIAL_OPTIONS: ComboOption[] = [
  'Stainless steel', 'Gold', 'Gold-plated', 'Titanium', 'Ceramic', 'Silver', 'Resin / plastic',
].map(material => ({ value: material, label: material }));

const AUTHENTICITY_OPTIONS: ComboOption[] = [
  { value: 'verified', label: 'Verified authentic' },
  { value: 'not_verified', label: 'Not verified' },
  { value: 'suspected_replica', label: 'Suspected replica' },
];

/** Readable labels for every stored detail, used by the review and the loan detail. */
const DETAIL_LABELS: Record<string, string> = {
  storage_capacity: 'Storage',
  color: 'Color',
  imei: 'IMEI',
  serial_number: 'Serial no.',
  battery_health: 'Battery health',
  network_status: 'Network / SIM lock',
  functionality_status: 'Functionality',
  has_receipt: 'Original receipt',
  has_box: 'Box included',
  has_charger_accessories: 'Charger / accessories',
  ownership_verified: 'Ownership verified',
  brand: 'Brand',
  model_reference: 'Model / reference no.',
  movement_type: 'Movement',
  material: 'Material',
  year_age: 'Year / age',
  authenticity_status: 'Authenticity',
  has_papers: 'Papers / certificate',
  has_accessories: 'Accessories included',
  size_capacity: 'Size / capacity',
  specifications: 'Specifications',
  power_tested: 'Power-on tested',
  has_remote_accessories: 'Remote / accessories',
  has_warranty: 'Warranty card',
};

const OPTION_LABELS: Record<string, ComboOption[]> = {
  network_status: NETWORK_OPTIONS,
  functionality_status: FUNCTIONALITY_OPTIONS,
  movement_type: MOVEMENT_OPTIONS,
  authenticity_status: AUTHENTICITY_OPTIONS,
};

const FIELDS: Record<DeviceKind, string[]> = {
  cellphone: ['storage_capacity', 'color', 'imei', 'serial_number', 'battery_health', 'network_status', 'functionality_status', 'has_receipt', 'has_box', 'has_charger_accessories', 'ownership_verified'],
  watch: ['brand', 'model_reference', 'serial_number', 'movement_type', 'material', 'year_age', 'authenticity_status', 'has_box', 'has_papers', 'has_receipt', 'has_accessories'],
  bulky: ['serial_number', 'color', 'size_capacity', 'year_age', 'specifications', 'functionality_status', 'power_tested', 'has_remote_accessories', 'has_box', 'has_receipt', 'has_warranty', 'ownership_verified'],
};

const FLAGS = new Set(['has_receipt', 'has_box', 'has_charger_accessories', 'ownership_verified', 'has_papers', 'has_accessories', 'power_tested', 'has_remote_accessories', 'has_warranty']);

/** What is sent to the API: answered fields only, Yes/No as booleans, battery as a number. */
export const deviceDetailsPayload = (kind: DeviceKind | null, details: DeviceDetails) => {
  if (!kind) return null;
  const payload: Record<string, string | number | boolean> = {};
  FIELDS[kind].forEach(field => {
    const value = (details[field] || '').trim();
    if (!value) return;
    if (FLAGS.has(field)) payload[field] = value === 'yes';
    else if (field === 'battery_health') payload[field] = Number(value);
    else payload[field] = value;
  });
  return Object.keys(payload).length ? payload : null;
};

/** Checks the few details with a format. Everything here is optional. */
export const deviceDetailErrors = (kind: DeviceKind | null, details: DeviceDetails) => {
  const errors: Record<string, string> = {};
  if (kind === 'cellphone') {
    const imei = (details.imei || '').trim();
    if (imei && !/^\d{15}$/.test(imei)) errors.imei = 'IMEI is 15 digits (dial *#06# on the phone)';
    const battery = (details.battery_health || '').trim();
    if (battery && !(Number(battery) >= 0 && Number(battery) <= 100)) errors.battery_health = 'Battery health is 0 to 100%';
  }
  if (kind === 'watch' && !(details.brand || '').trim()) errors.brand = 'Brand is required';
  return errors;
};

/** One detail as a person reads it. */
const readableValue = (field: string, value: string | number | boolean | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '';
  if (FLAGS.has(field)) return value === true || value === 'yes' ? 'Yes' : 'No';
  if (field === 'battery_health') return `${value}%`;
  const options = OPTION_LABELS[field];
  return options?.find(option => option.value === value)?.label ?? String(value);
};

/** Label and value for every answered detail, in form order. */
export const deviceDetailRows = (details: ApiItemDetails | DeviceDetails | null | undefined): Array<[string, string]> => {
  if (!details) return [];
  const order = [...new Set([...FIELDS.cellphone, ...FIELDS.watch, ...FIELDS.bulky])];
  return order
    .map(field => [DETAIL_LABELS[field], readableValue(field, details[field])] as [string, string])
    .filter(([, value]) => value !== '');
};

type Props = {
  kind: DeviceKind;
  /** The stored Item Type (e.g. "aircon"), for the bulky size and specs hints. */
  itemType?: string;
  details: DeviceDetails;
  onChange: (field: string, value: string) => void;
  /** Cellphone: the Brand/Model field. Watch: built from Brand and Model / reference. */
  brandModel: string;
  onBrandModelChange: (value: string) => void;
  appraisedValue: string;
  onAppraisedValueChange: (value: string) => void;
  /** Reads a decimal out of an input event, the way the rest of Step 2 does. */
  readDecimal: (event: { detail: { value?: string | null }; target: { value?: string | number | null } }) => string;
  errors: Record<string, string | undefined>;
};

/** A Yes/No answer, in the same two-button picker as Material. Pressing the chosen one clears it. */
const YesNo: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => {
  const id = `tx-yesno-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="tx-combobox tx-material tx-yesno">
      <span className="tx-combobox-label" id={id}>{label}</span>
      <div className="tx-combobox-control tx-material-picker" role="radiogroup" aria-labelledby={id}>
        {(['yes', 'no'] as const).map(answer => (
          <button
            key={answer}
            type="button"
            role="radio"
            aria-checked={value === answer}
            className={value === answer ? 'active' : ''}
            onClick={() => onChange(value === answer ? '' : answer)}
          >
            {answer === 'yes' ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    </div>
  );
};

const DeviceDetailsFields: React.FC<Props> = ({
  kind, itemType = '', details, onChange, brandModel, onBrandModelChange, appraisedValue, onAppraisedValueChange, readDecimal, errors,
}) => {
  const isGadget = GADGET_TYPES.has(itemType);
  const value = (field: string) => details[field] || '';

  const text = (field: string, label: string, placeholder: string, options: { inputmode?: 'numeric' | 'text'; maxlength?: number; onValue?: (next: string) => void } = {}) => (
    <IonItem lines="none" className="tx-field">
      <IonLabel position="stacked">{label}</IonLabel>
      <IonInput
        value={value(field)}
        inputmode={options.inputmode}
        maxlength={options.maxlength ?? 100}
        placeholder={placeholder}
        onIonInput={(event) => {
          const next = event.detail.value || '';
          if (options.onValue) options.onValue(next);
          else onChange(field, next);
        }}
      />
      {errors[field] && <small className="tx-field-error">{errors[field]}</small>}
    </IonItem>
  );

  // A watch's Brand/Model is its brand and reference, so the loan list and the
  // ticket still read "Seiko SRPD55" like any other watch_phone item.
  const watchPart = (field: 'brand' | 'model_reference') => (next: string) => {
    onChange(field, next);
    const brand = field === 'brand' ? next : value('brand');
    const model = field === 'model_reference' ? next : value('model_reference');
    onBrandModelChange(`${brand} ${model}`.trim());
  };

  const yesNo = (field: string) => (
    <YesNo key={field} label={DETAIL_LABELS[field]} value={value(field)} onChange={(next) => onChange(field, next)} />
  );

  return (
    <>
      <section className="tx-device-section span-2" aria-labelledby="tx-device-info">
        <h4 id="tx-device-info">{kind === 'cellphone' ? 'Device Information' : kind === 'watch' ? 'Watch Information' : 'Item Information'}</h4>
        <div className="tx-device-grid">
          {kind === 'bulky' ? (
            <>
              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Brand/Model</IonLabel>
                <IonInput value={brandModel} onIonInput={(event) => onBrandModelChange(event.detail.value || '')} placeholder="e.g. LG Dual Inverter" />
                {errors.brandModel && <small className="tx-field-error">{errors.brandModel}</small>}
              </IonItem>
              {text('serial_number', 'Serial Number', 'From the label at the back or bottom', { maxlength: 60 })}
              {text('size_capacity', 'Size / Capacity', SIZE_HINTS[itemType] || 'e.g. Size, capacity or wattage', { maxlength: 60 })}
              {text('color', 'Color', 'e.g. Silver', { maxlength: 40 })}
              {text('year_age', 'Year / Approximate Age', 'e.g. 2021 or about 3 years', { maxlength: 40 })}
              {isGadget && text('specifications', 'Specifications', SPEC_HINTS[itemType] || 'Processor, memory, storage', { maxlength: 100 })}
            </>
          ) : kind === 'cellphone' ? (
            <>
              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Brand/Model</IonLabel>
                <IonInput value={brandModel} onIonInput={(event) => onBrandModelChange(event.detail.value || '')} placeholder="e.g. Samsung A54" />
                {errors.brandModel && <small className="tx-field-error">{errors.brandModel}</small>}
              </IonItem>
              <TypeSelect free label="Storage Capacity" value={value('storage_capacity')} options={STORAGE_OPTIONS} onChange={(next) => onChange('storage_capacity', next)} maxLength={20} placeholder="Pick or type" />
              {text('color', 'Color', 'e.g. Midnight black', { maxlength: 40 })}
              {text('imei', 'IMEI Number', '15 digits, dial *#06#', { inputmode: 'numeric', maxlength: 15, onValue: (next) => onChange('imei', next.replace(/\D/g, '')) })}
              {text('serial_number', 'Serial Number', 'From settings or the SIM tray', { maxlength: 60 })}
            </>
          ) : (
            <>
              {text('brand', 'Brand', 'e.g. Seiko', { maxlength: 60, onValue: watchPart('brand') })}
              {text('model_reference', 'Model / Reference No.', 'e.g. SRPD55', { maxlength: 60, onValue: watchPart('model_reference') })}
              {text('serial_number', 'Serial Number', 'Engraved on the case back', { maxlength: 60 })}
              <TypeSelect label="Movement Type" value={value('movement_type')} options={MOVEMENT_OPTIONS} onChange={(next) => onChange('movement_type', next)} placeholder="Pick one" />
              <TypeSelect free label="Material" value={value('material')} options={MATERIAL_OPTIONS} onChange={(next) => onChange('material', next)} maxLength={60} placeholder="Pick or type" />
              {text('year_age', 'Year / Approximate Age', 'e.g. 2019 or about 5 years', { maxlength: 40 })}
            </>
          )}
        </div>
      </section>

      <section className="tx-device-section span-2" aria-labelledby="tx-device-condition">
        <h4 id="tx-device-condition">Condition &amp; Verification</h4>
        <div className="tx-device-grid">
          {kind === 'bulky' ? (
            <TypeSelect label="Functionality Status" value={value('functionality_status')} options={FUNCTIONALITY_OPTIONS} onChange={(next) => onChange('functionality_status', next)} placeholder="Pick one" />
          ) : kind === 'cellphone' ? (
            <>
              {text('battery_health', 'Battery Health (%)', 'e.g. 88', { inputmode: 'numeric', maxlength: 3, onValue: (next) => onChange('battery_health', next.replace(/\D/g, '')) })}
              <TypeSelect label="Network / SIM Lock" value={value('network_status')} options={NETWORK_OPTIONS} onChange={(next) => onChange('network_status', next)} placeholder="Pick one" />
              <TypeSelect label="Functionality Status" value={value('functionality_status')} options={FUNCTIONALITY_OPTIONS} onChange={(next) => onChange('functionality_status', next)} placeholder="Pick one" />
            </>
          ) : (
            <TypeSelect label="Authenticity Status" value={value('authenticity_status')} options={AUTHENTICITY_OPTIONS} onChange={(next) => onChange('authenticity_status', next)} placeholder="Pick one" />
          )}
        </div>
        <div className="tx-device-flags">
          {(kind === 'cellphone'
            ? ['has_receipt', 'has_box', 'has_charger_accessories', 'ownership_verified']
            : kind === 'watch'
              ? ['has_box', 'has_papers', 'has_receipt', 'has_accessories']
              : ['power_tested', 'has_remote_accessories', 'has_box', 'has_receipt', 'has_warranty', 'ownership_verified']
          ).map(yesNo)}
        </div>
      </section>

      <section className="tx-device-section span-2" aria-labelledby="tx-device-valuation">
        <h4 id="tx-device-valuation">Valuation</h4>
        <div className="tx-device-grid">
          <IonItem lines="none" className="tx-field">
            <IonLabel position="stacked">Appraised Value</IonLabel>
            <IonInput
              type="text"
              inputmode="decimal"
              value={appraisedValue}
              onIonInput={(event) => onAppraisedValueChange(readDecimal(event))}
              placeholder="₱0.00"
            />
            {errors.manualAppraisedValue && <small className="tx-field-error">{errors.manualAppraisedValue}</small>}
          </IonItem>
        </div>
      </section>
    </>
  );
};

export default DeviceDetailsFields;
