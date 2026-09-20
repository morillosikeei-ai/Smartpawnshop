import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ModelPerformanceChart, { type ModelPerformancePoint } from './ModelPerformanceChart';

const POINTS: ModelPerformancePoint[] = [
  { label: 'Sep 3', value: 95.8, caption: 'September 3' },
  { label: 'Sep 4', value: 96.5, caption: 'September 4' },
  { label: 'Sep 5', value: 96.1, caption: 'September 5' },
  { label: 'Sep 9', value: 97.9, caption: 'September 9' },
];

/**
 * jsdom lays nothing out, so every element measures zero. Each test states the
 * width its container reports, because the chart sizes itself from that.
 */
const measureAt = (width: number) => {
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { width, height: 260, top: 0, left: 0, right: width, bottom: 260, x: 0, y: 0, toJSON: () => ({}) };
  } as Element['getBoundingClientRect'];
};

describe('ModelPerformanceChart', () => {
  it('draws a curve and axis labels once its container has a width', () => {
    measureAt(560);
    const { container } = render(<ModelPerformanceChart points={POINTS} rangeLabel="the last 7 days" />);

    expect(container.querySelector('.model-chart-line')).toBeTruthy();
    expect(screen.getByText('Sep 3')).toBeTruthy();
    expect(screen.getByText('Sep 9')).toBeTruthy();
  });

  /**
   * The container is measured after the first paint, so the very first render
   * has no geometry at all. Placing labels from the points rather than from the
   * geometry crashed the whole monitoring page here.
   */
  it('renders without geometry before the container is measured', () => {
    measureAt(0);
    const { container } = render(<ModelPerformanceChart points={POINTS} rangeLabel="the last 7 days" />);

    expect(container.querySelector('.model-chart-svg')).toBeTruthy();
    expect(container.querySelector('.model-chart-line')).toBeNull();
  });

  it('shows a tooltip for the reading nearest the pointer', () => {
    measureAt(560);
    const { container } = render(<ModelPerformanceChart points={POINTS} rangeLabel="the last 7 days" />);

    fireEvent.pointerMove(container.querySelector('.model-chart')!, { clientX: 60 });

    expect(screen.getByText('September 3')).toBeTruthy();
    expect(screen.getByText('95.8% accuracy')).toBeTruthy();
  });

  it('says so when the range has no readings', () => {
    measureAt(560);
    render(<ModelPerformanceChart points={[]} rangeLabel="the last 24 hours" />);

    expect(screen.getByText('No accuracy readings recorded for this range yet.')).toBeTruthy();
  });
});
