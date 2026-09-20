import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import RevenueTrendChart, { type RevenuePoint } from './RevenueTrendChart';

/**
 * jsdom lays nothing out, so every element measures zero. The chart sizes
 * itself from its container, so give it a width to draw into.
 */
const CHART_WIDTH = 480;

beforeAll(() => {
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { width: CHART_WIDTH, height: 152, top: 0, left: 0, right: CHART_WIDTH, bottom: 152, x: 0, y: 0, toJSON: () => ({}) };
  } as Element['getBoundingClientRect'];
});

/** Seven days in the shape the dashboard endpoint sends revenue_trend. */
const sevenDays: RevenuePoint[] = [
  { date: '2026-09-02', revenue: 42000 },
  { date: '2026-09-03', revenue: 46500 },
  { date: '2026-09-04', revenue: 38200 },
  { date: '2026-09-05', revenue: 51200 },
  { date: '2026-09-06', revenue: 0 },
  { date: '2026-09-07', revenue: 48600 },
  { date: '2026-09-08', revenue: 53800 },
];

const linePath = (container: HTMLElement) => container.querySelector('.revenue-chart-line')?.getAttribute('d') ?? '';

test('draws a smooth line and an area fill for a seven day series', () => {
  const { container } = render(<RevenueTrendChart points={sevenDays} />);

  const path = linePath(container);
  expect(path.startsWith('M ')).toBe(true);
  // Six cubic segments join seven points, so the curve is smooth, not straight.
  expect(path.match(/ C /g)).toHaveLength(6);
  expect(container.querySelector('.revenue-chart-area')).not.toBeNull();
});

test('never dips below the baseline between two days', () => {
  const { container } = render(<RevenueTrendChart points={sevenDays} />);

  // Every y coordinate in the path, control points included. The baseline sits
  // at 14 + (152 - 14 - 26) = 126, so nothing may be drawn past it.
  const coordinates = linePath(container).match(/-?\d+(\.\d+)?\s-?\d+(\.\d+)?/g) ?? [];
  const lowest = Math.max(...coordinates.map((pair) => Number(pair.split(/\s+/)[1])));
  expect(lowest).toBeLessThanOrEqual(126);
});

test('labels each day of the week', () => {
  render(<RevenueTrendChart points={sevenDays} />);

  ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'].forEach((day) => {
    expect(screen.getAllByText(day).length).toBeGreaterThan(0);
  });
});

test('marks the latest day', () => {
  const { container } = render(<RevenueTrendChart points={sevenDays} />);

  expect(container.querySelectorAll('.revenue-chart-dot.is-latest')).toHaveLength(1);
});

test('shows a tooltip with the day and the peso amount', () => {
  const { container } = render(<RevenueTrendChart points={sevenDays} />);
  const chart = container.querySelector('.revenue-chart') as HTMLElement;

  // Far left of the plot, so the nearest point is the first day.
  fireEvent.pointerMove(chart, { clientX: 12 });

  const tooltip = container.querySelector('.revenue-chart-tooltip');
  expect(tooltip).not.toBeNull();
  expect(tooltip?.textContent).toContain('Sep 02');
  expect(tooltip?.textContent).toContain('₱42,000.00');

  fireEvent.pointerLeave(chart);
  expect(container.querySelector('.revenue-chart-tooltip')).toBeNull();
});

test('reports a week with no collections instead of drawing a false line', () => {
  const quietWeek = sevenDays.map((day) => ({ ...day, revenue: 0 }));
  const { container } = render(<RevenueTrendChart points={quietWeek} />);

  expect(screen.queryByText('No collections recorded in this period.')).not.toBeNull();
  // The flat series still renders, sitting on the baseline.
  expect(linePath(container)).not.toBe('');
});

test('keeps the loading, empty, and error states', () => {
  const { container, rerender } = render(<RevenueTrendChart points={[]} loading />);
  // The loading state is a placeholder the height of the plot, announced to
  // assistive technology rather than drawn as a line.
  expect(screen.queryByLabelText('Loading revenue')).not.toBeNull();
  expect(container.querySelector('.skeleton')).not.toBeNull();

  rerender(<RevenueTrendChart points={[]} error="Revenue data is unavailable right now." />);
  expect(screen.queryByText('Revenue data is unavailable right now.')).not.toBeNull();

  rerender(<RevenueTrendChart points={[]} />);
  expect(screen.queryByText('No revenue recorded in the last 7 days.')).not.toBeNull();
});

test('sizes itself once it replaces the loading state', () => {
  const { container, rerender } = render(<RevenueTrendChart points={sevenDays} loading />);
  expect(container.querySelector('.revenue-chart-line')).toBeNull();

  rerender(<RevenueTrendChart points={sevenDays} />);
  expect(linePath(container)).not.toBe('');
});
