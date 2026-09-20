import React, { useId, useMemo, useRef, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronDownOutline, chevronUpOutline } from 'ionicons/icons';
import './Combobox.css';

export type ComboOption = { value: string; label: string };

const normalize = (text: string) => text.trim().toLowerCase();

/**
 * The value to send to the API for what is in a combobox field.
 *
 * Text that matches a suggestion, by label or by stored value and ignoring
 * case, is sent as that suggestion's stored value, so typing "ring" or "Ring"
 * records the same thing as picking it. Anything else is a custom value and is
 * sent exactly as typed, trimmed.
 */
export const resolveComboValue = (options: ComboOption[], text: string): string => {
  const typed = normalize(text);
  const match = options.find(option => normalize(option.label) === typed || normalize(option.value) === typed);
  return match ? match.value : text.trim();
};

type Props = {
  label: string;
  value: string;
  options: ComboOption[];
  onChange: (text: string) => void;
  placeholder?: string;
  error?: string;
  maxLength?: number;
  /** Shown before the typed text when it matches no suggestion. */
  customHint?: string;
};

/**
 * A field that is both a dropdown and a text box.
 *
 * Clicking the field or its chevron lists every suggestion. Typing filters that
 * list to the suggestions containing the typed text, and text that matches none
 * of them is kept as a custom value rather than being cleared or forced onto a
 * suggestion.
 */
const Combobox: React.FC<Props> = ({ label, value, options, onChange, placeholder, error, maxLength = 100, customHint = 'Custom value:' }) => {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  // The list is filtered only after typing. Opening it by click shows every
  // suggestion, so a picked value can still be swapped for another.
  const [filtering, setFiltering] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const query = normalize(value);
  const visible = useMemo(
    () => (filtering && query
      ? options.filter(option => normalize(option.label).includes(query) || normalize(option.value).includes(query))
      : options),
    [filtering, query, options],
  );
  const isCustom = query !== '' && !options.some(option => normalize(option.label) === query || normalize(option.value) === query);

  const openList = () => {
    setFiltering(false);
    setActiveIndex(-1);
    setOpen(true);
  };

  const closeList = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const choose = (option: ComboOption) => {
    onChange(option.label);
    setFiltering(false);
    closeList();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setActiveIndex(index => Math.min(index + 1, visible.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      // Enter picks the highlighted suggestion. With none highlighted it keeps
      // the typed text as it is, and never submits the form.
      if (open) {
        event.preventDefault();
        if (activeIndex >= 0 && visible[activeIndex]) choose(visible[activeIndex]);
        else closeList();
      }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      closeList();
    }
  };

  const showList = open && (visible.length > 0 || isCustom);

  return (
    <div className={`tx-combobox ${error ? 'has-error' : ''}`}>
      <label className="tx-combobox-label" htmlFor={id}>{label}</label>
      <div className="tx-combobox-control">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          aria-invalid={Boolean(error)}
          autoComplete="off"
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setFiltering(true);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onClick={() => (open ? closeList() : openList())}
          onKeyDown={handleKeyDown}
          onBlur={closeList}
        />
        <button
          type="button"
          className="tx-combobox-toggle"
          tabIndex={-1}
          aria-label={`${open ? 'Hide' : 'Show'} ${label} options`}
          // Keep focus in the input so its blur does not close the list first.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) closeList();
            else openList();
            inputRef.current?.focus();
          }}
        >
          <IonIcon icon={open ? chevronUpOutline : chevronDownOutline} />
        </button>
      </div>

      {showList && (
        <ul className="tx-combobox-list" id={listId} role="listbox" aria-label={label}>
          {visible.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`tx-combobox-option ${index === activeIndex ? 'active' : ''} ${normalize(option.label) === query ? 'current' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              {option.label}
            </li>
          ))}
          {isCustom && (
            <li className="tx-combobox-custom" aria-hidden="true">
              {customHint} <strong>{value.trim()}</strong>
            </li>
          )}
        </ul>
      )}

      {error && <small className="tx-field-error">{error}</small>}
    </div>
  );
};

export default Combobox;
