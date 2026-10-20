import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { extractIdText, matchNameToIdText, normalizeText, parseIdText, type IdFields } from '../services/idOcr';
import { checkPhotoQuality, type PhotoQuality } from '../services/photoQuality';
import { Spinner } from '../components/Skeleton';
import './IdPhotoCheck.css';

/**
 * State of the advisory checks on one valid ID photo: OCR for the name badge,
 * and the same brightness and blur check item photos get.
 *
 * Nothing here blocks saving. Both checks can be wrong about a real ID.
 */
export type IdPhotoCheck = {
  /** OCR is running. */
  reading: boolean;
  /** Text read off the ID, or null before a photo is read or when OCR failed. */
  text: string | null;
  /** Quality verdict, or null while checking or when the browser cannot measure it. */
  quality: PhotoQuality | null;
  /** Staff chose to keep the photo despite the quality warning. */
  qualityDismissed: boolean;
};

const EMPTY: IdPhotoCheck = { reading: false, text: null, quality: null, qualityDismissed: false };

export function useIdPhotoCheck() {
  const [state, setState] = useState<IdPhotoCheck>(EMPTY);
  // Each picked file gets a number. A result for an older file that finishes
  // after a newer one was picked is dropped.
  const runRef = useRef(0);

  const check = useCallback((file: File | undefined) => {
    const run = ++runRef.current;
    if (!file) { setState(EMPTY); return; }
    setState({ ...EMPTY, reading: true });

    void checkPhotoQuality(file)
      .catch(() => null)
      .then(quality => { if (runRef.current === run) setState(current => ({ ...current, quality })); });

    void extractIdText(file)
      .catch(() => '')
      .then(text => { if (runRef.current === run) setState(current => ({ ...current, reading: false, text })); });
  }, []);

  const reset = useCallback(() => { runRef.current++; setState(EMPTY); }, []);
  const dismissQuality = useCallback(() => setState(current => ({ ...current, qualityDismissed: true })), []);

  useEffect(() => () => { runRef.current++; }, []);

  return { state, check, reset, dismissQuality };
}

/**
 * Small badge for next to the Full Name field. Shows nothing until an ID photo
 * has been picked in this session.
 */
export const IdNameBadge: React.FC<{ check: IdPhotoCheck; fullName: string }> = ({ check, fullName }) => {
  if (check.reading) {
    return <span className="id-name-badge reading" role="status"><Spinner />Reading ID...</span>;
  }
  if (check.text === null || !fullName.trim()) return null;

  const result = matchNameToIdText(fullName, check.text);
  if (result === 'match') {
    return <span className="id-name-badge match" role="status">✅ Name matches ID</span>;
  }
  return (
    <span
      className="id-name-badge warn"
      role="status"
      title={result === 'unreadable' ? 'Very little text could be read from the ID photo. It may be blurry or dark.' : undefined}
    >
      ⚠️ Name not found on ID — please double-check
    </span>
  );
};

/** Blur and brightness warning under the ID photo input. Staff can retake or keep it. */
export const IdPhotoQualityWarning: React.FC<{ check: IdPhotoCheck; onRetake: () => void; onKeep: () => void }> = ({ check, onRetake, onKeep }) => {
  const quality = check.quality;
  if (!quality || quality.ok || check.qualityDismissed) return null;

  const message = quality.tooBright && !quality.blurry
    ? 'This ID photo looks overexposed — please retake it.'
    : 'This ID photo looks blurry or too dark — please retake it.';

  return (
    <div className="id-photo-quality-warning" role="status">
      <p>{message}</p>
      <div>
        <button type="button" className="secondary-button" onClick={onRetake}>Retake photo</button>
        <button type="button" className="id-photo-keep" onClick={onKeep}>Keep anyway</button>
      </div>
    </div>
  );
};

const AUTOFILL_FIELDS: Array<{ key: keyof IdFields; label: string }> = [
  { key: 'fullName', label: 'Full Name' },
  { key: 'idType', label: 'Valid ID Type' },
  { key: 'idNumber', label: 'Valid ID Number' },
  { key: 'address', label: 'Address' },
];

/**
 * What the OCR read off the ID, offered to the staff field by field.
 *
 * Nothing is filled in on its own: OCR misreads real IDs, and staff are the
 * ones holding the card. Each value has a Use button, and Use all takes every
 * one shown. A value already in its field is not offered again.
 */
export const IdAutofillCard: React.FC<{
  check: IdPhotoCheck;
  current: IdFields;
  onUse: (fields: IdFields) => void;
  className?: string;
}> = ({ check, current, onUse, className = '' }) => {
  const parsed = useMemo(() => (check.text ? parseIdText(check.text) : {}), [check.text]);
  const [dismissedText, setDismissedText] = useState<string | null>(null);

  if (check.reading) {
    return (
      <div className={`id-autofill reading ${className}`} role="status">
        <Spinner />Reading the ID to suggest details...
      </div>
    );
  }
  if (check.text === null || dismissedText === check.text) return null;

  const offered = AUTOFILL_FIELDS.filter(({ key }) => {
    const value = parsed[key];
    return value && normalizeText(value) !== normalizeText(current[key] ?? '');
  });
  if (offered.length === 0) return null;

  const useAll = () => onUse(Object.fromEntries(offered.map(({ key }) => [key, parsed[key]])) as IdFields);

  return (
    <div className={`id-autofill ${className}`} role="region" aria-label="Details read from the ID">
      <div className="id-autofill-head">
        <div>
          <strong>Read from the ID</strong>
          <span>Check each value against the card before using it.</span>
        </div>
        <button type="button" className="id-autofill-dismiss" onClick={() => setDismissedText(check.text)}>Dismiss</button>
      </div>
      <ul>
        {offered.map(({ key, label }) => (
          <li key={key}>
            <span>{label}</span>
            <strong>{parsed[key]}</strong>
            <button type="button" onClick={() => onUse({ [key]: parsed[key] })}>Use</button>
          </li>
        ))}
      </ul>
      {offered.length > 1 && (
        <button type="button" className="id-autofill-all" onClick={useAll}>Use all</button>
      )}
    </div>
  );
};
