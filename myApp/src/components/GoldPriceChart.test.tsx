import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import GoldPriceChart, { type GoldPricePoint } from './GoldPriceChart';
import { localDayKey, shortDate } from '../data/pawnshopStore';

/**
 * jsdom lays nothing out, so every element measures zero. The chart sizes
 * itself from its container, so give it a width to draw into.
 */
const CHART_WIDTH = 420;

beforeAll(() => {
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { width: CHART_WIDTH, height: 96, top: 0, left: 0, right: CHART_WIDTH, bottom: 96, x: 0, y: 0, toJSON: () => ({}) };
  } as Element['getBoundingClientRect'];
});

/** ISO date for the day that many days before today. */
const daysAgo = (count: number) => {
  const day = new Date();
  day.setDate(day.getDate() - count);
  return localDayKey(day);
};

/**
 * The prices the gold price seeder records, in the shape the API returns.
 * Dates are relative to today so the "Today" label is tested for real rather
 * than against a date that happens to match when the suite is run.
 */
const PRICES = [3455.0, 3520.25, 3548.0, 3510.5, 3575.0, 3590.25, 3562.0];

/** Seven readings ending `endingDaysAgo` days back. */
const seriesEnding = (endingDaysAgo: number): GoldPricePoint[] =>
  PRICES.map((price, index) => ({ date: daysAgo(endingDaysAgo + PRICES.length - 1 - index), price }));

/** Seven readings whose newest is yesterday, so nothing reads as today. */
const recordedDays = seriesEnding(1);

const linePath = (container: HTMLElement) => container.querySelector('.gold-chart-line')?.getAttribute('d') ?? '';

test('draws a smooth curve and an area fill for the recorded days', () => {
  const { container } = render(<GoldPriceChart points={recordedDays} />);

  const path = linePath(container);
  expect(path.startsWith('M ')).toBe(true);
  // Six cubic segments join seven readings, so the line is curved, not straight.
  expect(path.match(/ C /g)).toHaveLength(6);
  expect(container.querySelector('.gold-chart-area')).not.toBeNull();
});

test('stays inside the plot area so the card cannot overflow', () => {
  const { container } = render(<GoldPriceChart points={recordedDays} />);

  // Padding is 10 top and 20 bottom of a 96px chart, so the plot runs y 10 to 76.
  const coordinates = linePath(container).match(/-?\d+(\.\d+)?\s-?\d+(\.\d+)?/g) ?? [];
  const ys = coordinates.map((pair) => Number(pair.split(/\s+/)[1]));
  expect(Math.min(...ys)).toBeGreaterThanOrEqual(10);
  expect(Math.max(...ys)).toBeLessThanOrEqual(76);
});

test('highlights the latest reading only', () => {
  const { container } = render(<GoldPriceChart points={recordedDays} />);

  expect(container.querySelectorAll('.gold-chart-dot.is-latest')).toHaveLength(1);
});

test('labels the last point with its own date when it is not today', () => {
  render(<GoldPriceChart points={recordedDays} />);

  expect(screen.queryByText('Today')).toBeNull();
  expect(screen.queryByText(shortDate(daysAgo(1)))).not.toBeNull();
});

test('labels the last point "Today" when the newest reading is today', () => {
  render(<GoldPriceChart points={seriesEnding(0)} />);

  expect(screen.queryByText('Today')).not.toBeNull();
});

test('shows a tooltip with the date and the price per gram', () => {
  const { container } = render(<GoldPriceChart points={recordedDays} />);
  const chart = container.querySelector('.gold-chart') as HTMLElement;

  // Far left of the plot, so the nearest reading is the first day.
  fireEvent.pointerMove(chart, { clientX: 10 });

  const tooltip = container.querySelector('.gold-chart-tooltip');
  expect(tooltip?.textContent).toContain(shortDate(daysAgo(7)));
  expect(tooltip?.textContent).toContain('₱3,455 / gram');

  fireEvent.pointerLeave(chart);
  expect(container.querySelector('.gold-chart-tooltip')).toBeNull();
});

test('draws a flat week without dividing by a zero range', () => {
  const flatWeek = recordedDays.map((day) => ({ ...day, price: 3500 }));
  const { container } = render(<GoldPriceChart points={flatWeek} />);

  const path = linePath(container);
  expect(path).not.toBe('');
  expect(path).not.toContain('NaN');
});

test('keeps the loading, empty, and error states', () => {
  const { container, rerender } = render(<GoldPriceChart points={[]} loading />);
  // The loading state is a placeholder the height of the plot, announced to
  // assistive technology rather than drawn as a line.
  expect(screen.queryByLabelText('Loading gold price history')).not.toBeNull();
  expect(container.querySelector('.skeleton')).not.toBeNull();

  rerender(<GoldPriceChart points={[]} error="Gold price history is unavailable right now." />);
  expect(screen.queryByText('Gold price history is unavailable right now.')).not.toBeNull();

  rerender(<GoldPriceChart points={[]} />);
  expect(screen.queryByText('No gold price history recorded yet.')).not.toBeNull();
});

test('sizes itself once it replaces the loading state', () => {
  const { container, rerender } = render(<GoldPriceChart points={recordedDays} loading />);
  expect(container.querySelector('.gold-chart-line')).toBeNull();

  rerender(<GoldPriceChart points={recordedDays} />);
  expect(linePath(container)).not.toBe('');
});
