import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import GoldPriceTracking from './GoldPriceTracking';
import type { ApiGoldPrice, ApiRedemptionSuggestion } from '../services/api';

/**
 * jsdom lays nothing out, so the chart's container measures zero and draws no
 * path. A width lets the chart render as it would on screen.
 */
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { width: 480, height: 208, top: 0, left: 0, right: 480, bottom: 208, x: 0, y: 0, toJSON: () => ({}) };
  } as Element['getBoundingClientRect'];
});

const mocks = vi.hoisted(() => ({
  getGoldPrices: vi.fn(),
  getRedemptionSuggestion: vi.fn(),
}));

vi.mock('../services/api', () => ({
  getGoldPrices: mocks.getGoldPrices,
  getRedemptionSuggestion: mocks.getRedemptionSuggestion,
}));

/** ISO date for the day that many days before today. */
const daysAgo = (count: number) => {
  const day = new Date();
  day.setDate(day.getDate() - count);
  return day.toISOString().slice(0, 10);
};

/** One recorded day, in the shape /gold-prices returns. */
const price = (offset: number, pricePerGram: number): ApiGoldPrice => ({
  gold_prices_id: offset + 1,
  price_date: daysAgo(offset),
  price_per_gram: pricePerGram,
  predicted_next_price: null,
  source: 'manual',
});

/**
 * Ten recorded days. The newest four span 3400 to 3600, so a 24H window and a
 * 30 day window disagree about the opening, the highest, and the lowest: that
 * disagreement is what the range filter has to show.
 */
const HISTORY: ApiGoldPrice[] = [
  price(9, 3300),
  price(8, 3320),
  price(7, 3340),
  price(6, 3360),
  price(5, 3380),
  price(4, 3400),
  price(3, 3600),
  price(2, 3500),
  price(1, 3550),
  price(0, 3580),
];

const SUGGESTION: ApiRedemptionSuggestion = {
  trend: 'up',
  message: "Gold price is trending up - you may want to wait a few more days before redeeming, as your item's value could increase.",
  disclaimer: 'This is a general trend observation, not a guarantee or financial advice.',
  current_price: 3580,
  predicted_price: 3625,
  average_price: 3490,
  change_percent: 1.26,
  sample_size: 7,
  confidence: 72,
  confidence_label: 'Moderate',
};

beforeEach(() => {
  mocks.getGoldPrices.mockResolvedValue(HISTORY);
  mocks.getRedemptionSuggestion.mockResolvedValue(SUGGESTION);
});

/** The figure shown under one of the Opening, Highest, Lowest, Current labels. */
const figure = (label: string) => {
  const cell = screen.getByText(label).closest('.gold-figure') as HTMLElement;
  return within(cell).getByText(/₱/).textContent;
};

describe('GoldPriceTracking', () => {
  it('opens on the 7 day window and reports its opening, highest, lowest, and current price', async () => {
    render(<GoldPriceTracking />);

    await waitFor(() => expect(screen.getByRole('tab', { name: '7 Days' }).getAttribute('aria-selected')).toBe('true'));

    // The seven day window starts at the reading six days back.
    expect(figure('Opening')).toBe('₱3,360');
    expect(figure('Highest')).toBe('₱3,600');
    expect(figure('Lowest')).toBe('₱3,360');
    expect(figure('Current')).toBe('₱3,580');
  });

  it('narrows every figure to the chosen window', async () => {
    render(<GoldPriceTracking />);

    await waitFor(() => expect(screen.queryByText('Opening')).not.toBeNull());

    fireEvent.click(screen.getByRole('tab', { name: '24H' }));

    // Yesterday and today only.
    expect(figure('Opening')).toBe('₱3,550');
    expect(figure('Highest')).toBe('₱3,580');
    expect(figure('Lowest')).toBe('₱3,550');

    fireEvent.click(screen.getByRole('tab', { name: '30 Days' }));

    expect(figure('Opening')).toBe('₱3,300');
    expect(figure('Lowest')).toBe('₱3,300');
    expect(figure('Highest')).toBe('₱3,600');
  });

  it('shows the forecast with its confidence', async () => {
    const { container } = render(<GoldPriceTracking />);

    expect(await screen.findByText('₱3,625')).not.toBeNull();

    // The timing card reports the same confidence, so the assertion is scoped
    // to the forecast panel rather than the whole screen.
    const forecast = container.querySelector('.gold-forecast-panel') as HTMLElement;
    expect(within(forecast).getByText('Moderate · 72%')).not.toBeNull();
    expect(within(forecast).getByLabelText('Forecast confidence 72 percent')).not.toBeNull();
  });

  it('raises a price alert for the movement over the chosen window', async () => {
    render(<GoldPriceTracking />);

    // 3360 to 3580 across the seven day window.
    expect(await screen.findByText(/Gold is up \+6\.55% over 7 days/)).not.toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: '24H' }));

    expect(screen.getByText(/Gold is up \+0\.85% over 24h/)).not.toBeNull();
  });

  it('keeps the standing valuation notes', async () => {
    render(<GoldPriceTracking />);

    expect(await screen.findByText('Jewelry items revalued at 2.8% above prior benchmark.')).not.toBeNull();
    expect(screen.getByText('High-demand 18K inventory is trending above projection.')).not.toBeNull();
    expect(screen.getByText('Risk team recommended slight tightening for high-ticket collateral.')).not.toBeNull();
  });

  it('says so when no price has been recorded', async () => {
    mocks.getGoldPrices.mockResolvedValue([]);
    mocks.getRedemptionSuggestion.mockResolvedValue(null);

    render(<GoldPriceTracking />);

    expect(await screen.findByText('No price recorded')).not.toBeNull();
    expect(screen.getByText('No forecast available yet.')).not.toBeNull();
  });
});
