import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ItemValueChart, { type ItemValuePoint } from './ItemValueChart';

/** jsdom lays nothing out, so give the chart a width to draw into. */
const CHART_WIDTH = 480;

beforeAll(() => {
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { width: CHART_WIDTH, height: 180, top: 0, left: 0, right: CHART_WIDTH, bottom: 180, x: 0, y: 0, toJSON: () => ({}) };
  } as Element['getBoundingClientRect'];
});

const HISTORY: ItemValuePoint[] = [
  { date: 'Sep 13, 2026', value: 6572 },
  { date: 'Sep 14, 2026', value: 6559 },
  { date: 'Sep 16, 2026', value: 6610 },
];

test('draws a smooth line and area for the recorded days', () => {
  const { container } = render(<ItemValueChart points={HISTORY} />);

  const path = container.querySelector('.item-value-line')?.getAttribute('d') ?? '';
  expect(path.startsWith('M ')).toBe(true);
  expect(path.match(/ C /g)).toHaveLength(2);
  expect(container.querySelector('.item-value-area')).not.toBeNull();
});

test('summarises the change from the first to the latest value', () => {
  render(<ItemValueChart points={HISTORY} />);

  expect(screen.getByText('₱6,610')).toBeTruthy();
  expect(screen.getByText(/\+₱38 \(\+0\.58%\)/)).toBeTruthy();
});

test('draws the pawn amount as a reference line when it is near the values', () => {
  const { container, rerender } = render(<ItemValueChart points={HISTORY} loanAmount={6000} />);
  expect(container.querySelector('.item-value-loan')).not.toBeNull();

  // A loan far below the values would squash the curve, so it is left out.
  rerender(<ItemValueChart points={HISTORY} loanAmount={1000} />);
  expect(container.querySelector('.item-value-loan')).toBeNull();
});

test('shows the nearest day on hover', () => {
  const { container } = render(<ItemValueChart points={HISTORY} />);

  fireEvent.pointerMove(container.querySelector('.item-value-chart') as Element, { clientX: 64 });
  expect(container.querySelector('.item-value-tooltip')?.textContent).toContain('Sep 13, 2026');
});

test('renders nothing without history', () => {
  const { container } = render(<ItemValueChart points={[]} />);
  expect(container.firstChild).toBeNull();
});
