import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LoanTermBar, { loanTermProgress } from './LoanTermBar';

/** A date a number of days from today, as the API sends it. */
const inDays = (days: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

describe('loanTermProgress', () => {
  it('is green with plenty of time left and measures the elapsed share', () => {
    const term = loanTermProgress(inDays(-10), inDays(20));
    expect(term?.tone).toBe('is-ontrack');
    expect(term?.label).toBe('Due in 20d');
    expect(term?.termDays).toBe(30);
    expect(term?.percent).toBeCloseTo(33.33, 1);
  });

  it('turns yellow in the last 25% of a long term, before the 7-day mark', () => {
    // 60-day term with 12 days left: more than 7 days, but inside the last 15.
    expect(loanTermProgress(inDays(-48), inDays(12))?.tone).toBe('is-soon');
  });

  it('turns yellow within 7 days even early in the term share', () => {
    // 10-day term with 7 days left is only 30% elapsed, but a week out.
    expect(loanTermProgress(inDays(-3), inDays(7))?.tone).toBe('is-soon');
    expect(loanTermProgress(inDays(-30), inDays(0))?.label).toBe('Due today');
  });

  it('is red and full once overdue', () => {
    const term = loanTermProgress(inDays(-35), inDays(-5));
    expect(term?.tone).toBe('is-overdue');
    expect(term?.label).toBe('5d overdue');
    expect(term?.percent).toBe(100);
  });

  it('keeps the label without a bar when the date pawned is unknown', () => {
    const term = loanTermProgress('', inDays(20));
    expect(term?.percent).toBeNull();
    expect(term?.tone).toBe('is-ontrack');
    expect(loanTermProgress(inDays(-5), '')).toBeNull();
  });
});

describe('LoanTermBar', () => {
  it('renders a progress bar beside the due label', () => {
    render(<LoanTermBar pawnedIso={inDays(-10)} dueIso={inDays(20)} />);
    const bar = screen.getByRole('progressbar', { name: 'Pawn term elapsed' });
    expect(bar.getAttribute('aria-valuenow')).toBe('33');
    expect(screen.getByText('Due in 20d')).toBeTruthy();
  });

  it('renders nothing without a due date', () => {
    const { container } = render(<LoanTermBar pawnedIso={inDays(-10)} dueIso={null} />);
    expect(container.firstChild).toBeNull();
  });
});
