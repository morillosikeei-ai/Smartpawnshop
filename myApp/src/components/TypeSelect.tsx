import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronDownOutline, chevronUpOutline } from 'ionicons/icons';
import type { ComboOption } from './Combobox';
import './Combobox.css';

const normalize = (text: string) => text.trim().toLowerCase();

type Props = {
  /** Stored value of the chosen option, or the typed text for a free field. */
  value: string;
  options: ComboOption[];
  onChange: (value: string) => void;
  /**
   * Strict fields (the default) keep only values from the list: typing filters
   * and picks an option, and text that matches none goes back to the last
   * option when the field loses focus. Free fields keep any typed text.
   */
  free?: boolean;
  /** Stacked label in the Staff form box style. Without one the field is bare
   *  and takes the look of the page's own inputs. */
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  maxLength?: number;
  className?: string;
};

/**
 * A dropdown the user can also type into.
 *
 * It lists every option on click, filters them as the user types, and picks an
 * option by click, arrow keys and Enter, or by typing its name. Unlike
 * Combobox, it takes and returns the stored value rather than the label, so it
 * can stand in for a <select> or IonSelect without changing the page state.
 */
const TypeSelect: React.FC<Props> = ({ value, options, onChange, free = false, label, ariaLabel, placeholder, maxLength = 100, className = '' }) => {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const labelFor = (stored: string) => options.find(option => option.value === stored)?.label ?? stored;

  const [text, setText] = useState(() => labelFor(value));
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Follow value changes made outside the field, such as a form reset.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setText(labelFor(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options]);

  const query = normalize(text);
  const exact = (typed: string) => options.find(option => normalize(option.label) === typed || normalize(option.value) === typed);
  const visible = useMemo(
    () => (filtering && query
      ? options.filter(option => normalize(option.label).includes(query) || normalize(option.value).includes(query))
      : options),
    [filtering, query, options],
  );
  const isCustom = free && query !== '' && !exact(query);

  const closeList = () => { setOpen(false); setActiveIndex(-1); };
  const openList = () => { setFiltering(false); setActiveIndex(-1); setOpen(true); };

  const choose = (option: ComboOption) => {
    setText(option.label);
    onChange(option.value);
    setFiltering(false);
    closeList();
  };

  const type = (typed: string) => {
    setText(typed);
    setFiltering(true);
    setActiveIndex(-1);
    setOpen(true);
    const match = exact(normalize(typed));
    if (match) onChange(match.value);
    else if (free) onChange(typed.trim());
  };

  // The one option the typed text points to: an exact match, else the only
  // option starting with it ("18" picks 18k), else the only one containing it
  // ("sterling" picks 925 Sterling Silver).
  const bestMatch = () => {
    if (!query) return undefined;
    const found = exact(query);
    if (found) return found;
    const starts = options.filter(option => normalize(option.label).startsWith(query) || normalize(option.value).startsWith(query));
    if (starts.length === 1) return starts[0];
    const contains = options.filter(option => normalize(option.label).includes(query));
    return contains.length === 1 ? contains[0] : undefined;
  };

  // A strict field settles on leaving it: the option the text points to, else
  // back to the last value. A free field keeps what was typed.
  const settle = () => {
    closeList();
    if (free) return;
    const match = bestMatch();
    if (match) {
      setText(match.label);
      if (match.value !== value) onChange(match.value);
    } else {
      setText(labelFor(value));
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) openList();
      else setActiveIndex(index => Math.min(index + 1, visible.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open) {
      // Picks the highlighted option and never submits the form.
      event.preventDefault();
      if (activeIndex >= 0 && visible[activeIndex]) choose(visible[activeIndex]);
      else settle();
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      closeList();
    }
  };

  const showList = open && (visible.length > 0 || isCustom);

  const input = (
    <input
      ref={inputRef}
      id={id}
      type="text"
      role="combobox"
      aria-label={label ? undefined : ariaLabel}
      aria-expanded={showList}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
      autoComplete="off"
      maxLength={maxLength}
      placeholder={placeholder}
      value={text}
      onChange={event => type(event.target.value)}
      onClick={() => (open ? closeList() : openList())}
      onKeyDown={handleKeyDown}
      onBlur={settle}
    />
  );

  const toggle = (
    <button
      type="button"
      className="tx-combobox-toggle"
      tabIndex={-1}
      aria-label={`${open ? 'Hide' : 'Show'} ${label ?? ariaLabel ?? ''} options`}
      onMouseDown={event => event.preventDefault()}
      onClick={() => { if (open) closeList(); else openList(); inputRef.current?.focus(); }}
    >
      <IonIcon icon={open ? chevronUpOutline : chevronDownOutline} />
    </button>
  );

  const list = showList && (
    <ul className="tx-combobox-list" id={listId} role="listbox" aria-label={label ?? ariaLabel}>
      {visible.map((option, index) => (
        <li
          key={option.value}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={index === activeIndex}
          className={`tx-combobox-option ${index === activeIndex ? 'active' : ''} ${option.value === value ? 'current' : ''}`}
          onMouseDown={event => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={event => { event.preventDefault(); choose(option); }}
        >
          {option.label}
        </li>
      ))}
      {isCustom && <li className="tx-combobox-custom" aria-hidden="true">Custom value: <strong>{text.trim()}</strong></li>}
    </ul>
  );

  if (label) {
    return (
      <div className={`tx-combobox ${className}`}>
        <label className="tx-combobox-label" htmlFor={id}>{label}</label>
        <div className="tx-combobox-control">{input}{toggle}</div>
        {list}
      </div>
    );
  }

  return (
    <div className={`type-select ${className}`}>
      {input}
      {toggle}
      {list}
    </div>
  );
};

export default TypeSelect;
