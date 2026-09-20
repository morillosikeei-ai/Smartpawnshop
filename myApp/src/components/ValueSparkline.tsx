import React from 'react';
import { buildLinePath } from './smoothPath';
import './ValueSparkline.css';

export type ValuePoint = { date: string; value: number };

/** How many recorded days the sparkline covers at most. */
export const SPARKLINE_DAYS = 30;

const WIDTH = 120;
const HEIGHT = 32;
// Keeps the stroke inside the box at the highest and lowest points.
const PAD = 2;

/**
 * The points to plot: valid values only, oldest first, the last 30 days.
 * The API does not promise an order, so the dates decide it here.
 */
export const sparklinePoints = (points: ValuePoint[]): ValuePoint[] =>
  points
    .filter((point) => Number.isFinite(point.value) && Boolean(point.date))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-SPARKLINE_DAYS);

/** Percent change from the oldest to the newest point, or 0 without a base. */
export const sparklineChange = (points: ValuePoint[]): number => {
  if (points.length < 2) return 0;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  return first > 0 ? ((last - first) / first) * 100 : 0;
};

type Props = {
  points: ValuePoint[];
  formatValue: (value: number) => string;
};

/**
 * A minimal line of an item's daily value, with the change over the range.
 *
 * No axes or legend: it gives the direction at a glance. With a single
 * recorded day there is no line to draw, so only that value is shown.
 */
const ValueSparkline: React.FC<Props> = ({ points, formatValue }) => {
  const series = sparklinePoints(points);
  if (series.length === 0) return null;

  const latest = series[series.length - 1].value;

  if (series.length === 1) {
    return (
      <div className="value-sparkline single">
        <div className="value-sparkline-copy">
          <span>Daily value</span>
          <strong>{formatValue(latest)}</strong>
        </div>
      </div>
    );
  }

  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const step = (WIDTH - PAD * 2) / (series.length - 1);
  // A flat series is drawn along the middle rather than pinned to an edge.
  const coordinates = values.map((value, index) => ({
    x: PAD + index * step,
    y: span > 0 ? PAD + (1 - (value - min) / span) * (HEIGHT - PAD * 2) : HEIGHT / 2,
  }));
  const path = buildLinePath(coordinates);

  const change = sparklineChange(series);
  const tone = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const changeLabel = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;

  return (
    <div className="value-sparkline">
      <div className="value-sparkline-copy">
        <span>Daily value · last {series.length} days</span>
        <strong>{formatValue(latest)}</strong>
      </div>
      <svg
        className={`value-sparkline-line ${tone}`}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Item value over the last ${series.length} recorded days, from ${formatValue(values[0])} to ${formatValue(latest)}, ${changeLabel}.`}
      >
        <path d={path} vectorEffect="non-scaling-stroke" />
      </svg>
      <b className={`value-sparkline-change ${tone}`}>{changeLabel}</b>
    </div>
  );
};

export default ValueSparkline;
