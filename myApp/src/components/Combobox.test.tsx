import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Combobox, { ComboOption, resolveComboValue } from './Combobox';

const OPTIONS: ComboOption[] = [
  { value: 'ring', label: 'Ring' },
  { value: 'necklace', label: 'Necklace' },
  { value: 'brooch_pin', label: 'Brooch/Pin' },
];

const Harness: React.FC<{ initial?: string }> = ({ initial = '' }) => {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Combobox label="Item Type" value={value} options={OPTIONS} onChange={setValue} customHint="Custom item type:" />
      <output data-testid="sent">{resolveComboValue(OPTIONS, value)}</output>
    </>
  );
};

const optionLabels = () => screen.queryAllByRole('option').map(option => option.textContent);

describe('resolveComboValue', () => {
  it('sends the stored value for a suggestion, matched by label or value in any case', () => {
    expect(resolveComboValue(OPTIONS, 'Ring')).toBe('ring');
    expect(resolveComboValue(OPTIONS, '  brooch/pin ')).toBe('brooch_pin');
    expect(resolveComboValue(OPTIONS, 'NECKLACE')).toBe('necklace');
  });

  it('sends free text exactly as typed, trimmed, when it matches no suggestion', () => {
    expect(resolveComboValue(OPTIONS, '  Gold tiara ')).toBe('Gold tiara');
  });
});

describe('Combobox', () => {
  it('lists every suggestion when the field is clicked', () => {
    render(<Harness initial="Ring" />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(optionLabels()).toEqual(['Ring', 'Necklace', 'Brooch/Pin']);
  });

  it('filters the suggestions to what is typed', () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ne' } });
    expect(optionLabels()).toEqual(['Necklace']);
  });

  it('keeps text that matches no suggestion and sends it as the value', () => {
    render(<Harness />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Gold tiara' } });
    expect(optionLabels()).toEqual([]);
    expect(screen.getByText(/Custom item type/)).toBeTruthy();

    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe('Gold tiara');
    expect(screen.getByTestId('sent').textContent).toBe('Gold tiara');
  });

  it('picks a suggestion with the keyboard and sends its stored value', () => {
    render(<Harness />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'bro' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((input as HTMLInputElement).value).toBe('Brooch/Pin');
    expect(screen.getByTestId('sent').textContent).toBe('brooch_pin');
  });

  it('picks a suggestion by clicking it', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Necklace' }));
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('Necklace');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});
