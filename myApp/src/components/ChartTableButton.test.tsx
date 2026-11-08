import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChartTableButton, { signedChange } from './ChartTableButton';

const money = (value: number) => `₱${value.toLocaleString('en-US')}`;

const columns = [
  { key: 'date', label: 'Date' },
  { key: 'value', label: 'Value', align: 'right' as const },
  { key: 'change', label: 'Change', align: 'right' as const },
];

const rows = [
  { date: 'Oct 02, 2026', value: '₱1,100', change: '+₱100' },
  { date: 'Oct 01, 2026', value: '₱1,000', change: '—' },
];

describe('signedChange', () => {
  it('marks rises, falls, no change, and the first row', () => {
    expect(signedChange(1100, 1000, money)).toBe('+₱100');
    expect(signedChange(900, 1000, money)).toBe('−₱100');
    expect(signedChange(1000, 1000, money)).toBe('0');
    expect(signedChange(1000, undefined, money)).toBe('—');
  });
});

describe('ChartTableButton', () => {
  it('opens a table of the chart data and closes again', () => {
    render(<ChartTableButton title="Item value history" columns={columns} rows={rows} changeKey="change" fileName="values" />);

    fireEvent.click(screen.getByRole('button', { name: /view table/i }));
    const dialog = screen.getByRole('dialog', { name: 'Item value history' });

    expect(within(dialog).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Date', 'Value', 'Change']);
    const bodyRows = within(dialog).getAllByRole('row').slice(1);
    expect(bodyRows).toHaveLength(2);
    expect(within(bodyRows[0]).getByText('+₱100').className).toContain('is-up');
    expect(within(dialog).getByText(/2 rows/)).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows no button when there is nothing to list', () => {
    render(<ChartTableButton title="Empty" columns={columns} rows={[]} fileName="empty" />);
    expect(screen.queryByRole('button', { name: /view table/i })).toBeNull();
  });
});
