import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RatingToast from './RatingToast';
import { getPublicRatings } from '../services/api';

vi.mock('../services/api', () => ({ getPublicRatings: vi.fn() }));
const mocked = vi.mocked(getPublicRatings);

const ratings = (total: number) => ({
  total,
  average_rating: total > 0 ? 4.8 : null,
  rating_counts: { 1: 0, 2: 0, 3: 0, 4: 1, 5: Math.max(0, total - 1) },
  reviews: [],
});

/** Let the mocked fetch resolve, then move the clock. */
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe('RatingToast', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows at 3s for 6s, then again every 20s', async () => {
    mocked.mockResolvedValue(ratings(12));
    render(<RatingToast />);

    await advance(2900);
    expect(screen.queryByLabelText('Customer rating')).toBeNull();

    await advance(200); // 3.1s
    expect(screen.getByLabelText('Customer rating')).toBeTruthy();
    expect(screen.getByText('4.8')).toBeTruthy();
    expect(screen.getByText('From 12 customers who redeemed with us')).toBeTruthy();

    await advance(6000); // 9.1s: fading out
    expect(screen.getByLabelText('Customer rating').className).toContain('is-leaving');

    await advance(500); // 9.6s: gone
    expect(screen.queryByLabelText('Customer rating')).toBeNull();

    await advance(13500); // 23.1s: back
    expect(screen.getByLabelText('Customer rating').className).not.toContain('is-leaving');
  });

  it('× folds it into the star button, which opens it again', async () => {
    mocked.mockResolvedValue(ratings(12));
    render(<RatingToast />);

    await advance(100); // the ratings arrive
    expect(screen.getByRole('button', { name: /show customer rating, 4.8 out of 5/i })).toBeTruthy();
    await advance(3000);
    fireEvent.click(screen.getByRole('button', { name: 'Close rating' }));
    await advance(500);
    expect(screen.queryByLabelText('Customer rating')).toBeNull();
    const toggle = screen.getByRole('button', { name: /show customer rating/i });

    // No more automatic showings once the visitor has closed it.
    await advance(60000);
    expect(screen.queryByLabelText('Customer rating')).toBeNull();

    // The button opens it, and it stays open: no timer closes it.
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Customer rating')).toBeTruthy();
    await advance(30000);
    expect(screen.getByLabelText('Customer rating').className).not.toContain('is-leaving');
  });

  it('never shows without ratings', async () => {
    mocked.mockResolvedValue(ratings(0));
    render(<RatingToast />);

    await advance(30000);
    expect(screen.queryByLabelText('Customer rating')).toBeNull();
    expect(screen.queryByRole('button', { name: /show customer rating/i })).toBeNull();
  });
});
