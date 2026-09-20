import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LoanOverviewChart, { loanBalanceSeries, type LoanRecord } from './LoanOverviewChart';

const TODAY = new Date(2026, 8, 13, 15, 0, 0);

/** A local date a number of days before TODAY. */
const daysAgo = (days: number) => new Date(2026, 8, 13 - days, 10, 0, 0).toISOString();

const loan = (overrides: Partial<LoanRecord> = {}): LoanRecord => ({
  pawnedIso: daysAgo(10),
  redeemedIso: null,
  open: true,
  principal: 10000,
  monthlyRate: 0.05,
  ...overrides,
});

describe('loanBalanceSeries', () => {
  it('returns one point per day ending today', () => {
    const series = loanBalanceSeries([loan()], 7, TODAY);
    expect(series).toHaveLength(7);
    expect(series[6].date).toBe('2026-09-13');
    expect(series[0].date).toBe('2026-09-07');
  });

  it('accrues interest like the API: principal x rate x days / 30', () => {
    const series = loanBalanceSeries([loan()], 30, TODAY);
    // Held 10 days today: 10,000 + 10,000 x 0.05 x 10/30.
    expect(series[29]).toEqual({ date: '2026-09-13', due: 10166.67, principal: 10000 });
    // Before it was pawned nothing is owed.
    expect(series[18].due).toBe(0);
    // On the day it was pawned only the principal is owed.
    expect(series[19]).toMatchObject({ due: 10000, principal: 10000 });
  });

  it('stops counting a loan from the day it was redeemed', () => {
    const series = loanBalanceSeries([loan({ pawnedIso: daysAgo(20), redeemedIso: daysAgo(5), open: false })], 30, TODAY);
    expect(series[29].due).toBe(0);
    expect(series[23].due).toBeGreaterThan(10000);
    expect(series[24].due).toBe(0);
  });

  it('leaves out a closed loan with no redemption date', () => {
    expect(loanBalanceSeries([loan({ open: false })], 7, TODAY).every(point => point.due === 0)).toBe(true);
  });

  it('adds up several open pawns', () => {
    const series = loanBalanceSeries([loan(), loan({ principal: 5000, pawnedIso: daysAgo(0) })], 7, TODAY);
    expect(series[6].principal).toBe(15000);
  });
});

describe('LoanOverviewChart', () => {
  it('offers 7 Days, 30 Days, and 3 Months and switches between them', () => {
    render(<LoanOverviewChart loans={[loan()]} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(tab => tab.textContent)).toEqual(['7 Days', '30 Days', '3 Months']);
    expect(screen.getByRole('tab', { name: '30 Days' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: '3 Months' }));
    expect(screen.getByRole('tab', { name: '3 Months' }).getAttribute('aria-selected')).toBe('true');
  });

  it('says so when no loan was open in the period', () => {
    render(<LoanOverviewChart loans={[]} />);
    expect(screen.getByText('No open pawns in this period.')).toBeTruthy();
  });
});
