import React, { useId, useMemo, useRef, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronDownOutline, chevronUpOutline } from 'ionicons/icons';
import type { ComboOption } from './Combobox';
import './Combobox.css';

const normalize = (text: string) => text.trim().toLowerCase();

type Props = {
  label: string;
  /** The picked option's value, or '' for none. */
  value: string;
  options: ComboOption[];
  onChange: (option: ComboOption | null) => void;
  placeholder?: string;
  /** Shown in place of the placeholder while the field is disabled. */
  disabledHint?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
};

/**
 * A dropdown that can be searched by typing, and only takes a listed option.
 *
 * Same look as Combobox, but strict: typed text only filters the list, and
 * leaving the field without picking puts back the option already chosen.
 * Used where the value must come from a fixed list, like the PSGC address.
 */
const SearchSelect: React.FC<Props> = ({ label, value, options, onChange, placeholder, disabledHint, disabled = false, loading = false, error }) => {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selected = options.find(option => option.value === value) || null;
  const shown = typing ? query : selected?.label || '';
  const visible = useMemo(() => {
    const typed = normalize(query);
    return typing && typed ? options.filter(option => normalize(option.label).includes(typed)) : options;
  }, [typing, query, options]);

  const openList = () => {
    if (disabled) return;
    setTyping(false);
    setQuery('');
    setActiveIndex(-1);
    setOpen(true);
    // Select the picked name, so typing replaces it instead of adding to it.
    inputRef.current?.select();
  };

  const closeList = () => {
    setOpen(false);
    setTyping(false);
    setQuery('');
    setActiveIndex(-1);
  };

  const choose = (option: ComboOption) => {
    if (option.value !== value) onChange(option);
    closeList();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) { openList(); return; }
      setActiveIndex(index => Math.min(index + 1, visible.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      if (open) {
        event.preventDefault();
        // Enter takes the highlighted option, or the only one left after typing.
        const pick = visible[activeIndex] || (visible.length === 1 ? visible[0] : null);
        if (pick) choose(pick);
      }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      closeList();
    }
  };

  const showList = open && !disabled;
  const placeholderText = disabled ? disabledHint || placeholder : loading ? 'Loading…' : placeholder;

  return (
    <div className={`tx-combobox tx-search-select ${error ? 'has-error' : ''} ${disabled ? 'is-disabled' : ''}`}>
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
          aria-busy={loading}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholderText}
          value={shown}
          onChange={(event) => {
            setQuery(event.target.value);
            setTyping(true);
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
          disabled={disabled}
          aria-label={`${open ? 'Hide' : 'Show'} ${label} options`}
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
              aria-selected={option.value === value}
              className={`tx-combobox-option ${index === activeIndex ? 'active' : ''} ${option.value === value ? 'current' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              {option.label}
            </li>
          ))}
          {visible.length === 0 && (
            <li className="tx-combobox-custom" aria-hidden="true">
              {loading ? 'Loading…' : <>No match for <strong>{query.trim()}</strong></>}
            </li>
          )}
        </ul>
      )}

      {error && <small className="tx-field-error">{error}</small>}
    </div>
  );
};

export default SearchSelect;
