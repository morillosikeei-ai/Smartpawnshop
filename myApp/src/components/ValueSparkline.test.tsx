import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ValueSparkline, { sparklineChange, sparklinePoints } from './ValueSparkline';

const format = (value: number) => `₱${value.toLocaleString('en-US')}`;

const day = (offset: number) => {
  const date = new Date(Date.UTC(2026, 7, 1 + offset));
  return date.toISOString().slice(0, 10);
};

describe('sparklinePoints', () => {
  it('orders by date and keeps only the last 30 days', () => {
    const points = Array.from({ length: 40 }, (_, index) => ({ date: day(index), value: 1000 + index }));
    const shuffled = [...points].reverse();
    const series = sparklinePoints(shuffled);

    expect(series).toHaveLength(30);
    expect(series[0]).toEqual({ date: day(10), value: 1010 });
    expect(series[29]).toEqual({ date: day(39), value: 1039 });
  });
});

describe('sparklineChange', () => {
  it('compares the oldest value with the newest', () => {
    expect(sparklineChange([{ date: day(0), value: 10000 }, { date: day(1), value: 10520 }])).toBeCloseTo(5.2);
    expect(sparklineChange([{ date: day(0), value: 10000 }])).toBe(0);
  });
});

describe('ValueSparkline', () => {
  it('renders nothing without any recorded value', () => {
    const { container } = render(<ValueSparkline points={[]} formatValue={format} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows only the value, with no line or change, for a single day', () => {
    const { container } = render(<ValueSparkline points={[{ date: day(0), value: 13350 }]} formatValue={format} />);
    expect(screen.getByText('₱13,350')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('draws the line and a green rise label', () => {
    const { container } = render(
      <ValueSparkline points={[{ date: day(1), value: 10520 }, { date: day(0), value: 10000 }]} formatValue={format} />,
    );
    expect(container.querySelector('svg path')?.getAttribute('d')).toMatch(/^M /);
    const label = screen.getByText('+5.2%');
    expect(label.className).toContain('up');
  });

  it('marks a fall in red', () => {
    render(<ValueSparkline points={[{ date: day(0), value: 10000 }, { date: day(1), value: 9690 }]} formatValue={format} />);
    expect(screen.getByText('-3.1%').className).toContain('down');
  });
});
