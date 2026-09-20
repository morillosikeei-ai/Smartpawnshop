import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { money, parseDay, shortDate } from '../data/pawnshopStore';
import { buildAreaPath, buildLinePath, type ChartPoint } from './smoothPath';
import { Skeleton } from './Skeleton';
import './GoldPriceChart.css';

/** One recorded day from the gold_prices table. */
export type GoldPricePoint = {
  /** ISO date string, e.g. "2026-09-08". */
  date: string;
  /** Pesos per gram recorded that day. */
  price: number;
};

type GoldPriceChartProps = {
  points: GoldPricePoint[];
  /** True while the dashboard request is still in flight. */
  loading?: boolean;
  /** Set when the dashboard request failed, so the card can say so. */
  error?: string;
  /**
   * Drawing height in CSS pixels. The default suits the dashboard card, where
   * the price is the headline; a page that leads with the chart passes more.
   */
  height?: number;
};

/**
 * Default drawing height in CSS pixels. Deliberately short: on a summary card
 * the price is the headline and the chart only shows which way it has been
 * moving. A screen that leads with the chart passes its own height.
 */
const CHART_HEIGHT = 96;

/** Room kept around the plot so the end dot and its label are never clipped. */
const PADDING = { top: 10, right: 10, bottom: 20, left: 10 };

/**
 * Compact gold price movement as a smooth area chart.
 *
 * Drawn by hand in SVG, sharing its curve maths with the revenue chart. The
 * project carries no charting dependency and a single mini series does not
 * justify adding one.
 */
const GoldPriceChart: React.FC<GoldPriceChartProps> = ({ points, loading = false, error = '', height = CHART_HEIGHT }) => {
  // Held in state rather than a ref because the chart is not mounted during
  // the loading and error states, so a ref taken on first mount stays null.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!container) return;

    setWidth(container.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(container);

    return () => observer.disconnect();
  }, [container]);

  const plotWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const plotHeight = height - PADDING.top - PADDING.bottom;

  const geometry = useMemo(() => {
    if (points.length === 0 || plotWidth <= 0) {
      return { coordinates: [] as ChartPoint[], linePath: '', areaPath: '' };
    }

    // Gold prices sit far above zero and move by a few percent, so the scale
    // spans the recorded range rather than starting at zero: from zero the
    // whole week would flatten into a straight line. A tenth of the range is
    // left above and below so the peak and the trough stay off the edges.
    const prices = points.map((point) => point.price);
    const highest = Math.max(...prices);
    const lowest = Math.min(...prices);
    const spread = highest - lowest;
    const margin = spread > 0 ? spread * 0.1 : Math.max(highest * 0.01, 1);
    const scaleTop = highest + margin;
    const scaleBottom = lowest - margin;
    const scaleRange = scaleTop - scaleBottom;

    const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;
    const coordinates = points.map((point, index) => ({
      x: PADDING.left + (points.length > 1 ? index * stepX : plotWidth / 2),
      y: PADDING.top + plotHeight - ((point.price - scaleBottom) / scaleRange) * plotHeight,
    }));

    const linePath = buildLinePath(coordinates);

    return { coordinates, linePath, areaPath: buildAreaPath(coordinates, linePath, PADDING.top + plotHeight) };
  }, [points, plotWidth, plotHeight]);

  /** Nearest recorded day to the pointer, so hovering anywhere works. */
  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!container || geometry.coordinates.length === 0) return;

      const offsetX = event.clientX - container.getBoundingClientRect().left;
      let nearest = 0;
      geometry.coordinates.forEach((coordinate, index) => {
        if (Math.abs(coordinate.x - offsetX) < Math.abs(geometry.coordinates[nearest].x - offsetX)) nearest = index;
      });
      setActiveIndex(nearest);
    },
    [container, geometry.coordinates]
  );

  const latestIndex = points.length - 1;
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const activeCoordinate = activeIndex === null ? null : geometry.coordinates[activeIndex];
  const latestCoordinate = geometry.coordinates[latestIndex];

  // "Today" is only honest when the newest record really is today's. An older
  // last reading is labelled with its own date instead.
  const latestDate = points[latestIndex]?.date;
  const latestLabel = latestDate && parseDay(latestDate).toDateString() === new Date().toDateString()
    ? 'Today'
    : shortDate(latestDate);

  // The placeholder is the height the plot will be, so the card does not jump
  // when the readings arrive.
  if (loading) {
    return (
      <div className="gold-chart" role="status" aria-label="Loading gold price history">
        <Skeleton width="100%" height={`${height}px`} radius="12px" />
      </div>
    );
  }

  if (error) {
    return <p className="gold-chart-note gold-chart-note-error">{error}</p>;
  }

  if (points.length === 0) {
    return <p className="gold-chart-note">No gold price history recorded yet.</p>;
  }

  return (
    <div
      className="gold-chart"
      ref={setContainer}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerMove}
      onPointerLeave={() => setActiveIndex(null)}
      onPointerCancel={() => setActiveIndex(null)}
    >
      <svg
        className="gold-chart-svg"
        width={width || undefined}
        height={height}
        role="img"
        aria-label={`Gold price per gram over the last ${points.length} recorded days. ${points
          .map((point) => `${shortDate(point.date)} ${money(point.price)}`)
          .join(', ')}.`}
      >
        <defs>
          <linearGradient id="goldPriceAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1D4ED8" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0" />
          </linearGradient>
        </defs>

        {geometry.areaPath && <path className="gold-chart-area" d={geometry.areaPath} fill="url(#goldPriceAreaFill)" />}
        {geometry.linePath && <path className="gold-chart-line" d={geometry.linePath} />}

        {activeCoordinate && activeIndex !== latestIndex && (
          <g>
            <line
              className="gold-chart-cursor"
              x1={activeCoordinate.x}
              y1={PADDING.top}
              x2={activeCoordinate.x}
              y2={PADDING.top + plotHeight}
            />
            <circle className="gold-chart-dot" cx={activeCoordinate.x} cy={activeCoordinate.y} r={3.5} />
          </g>
        )}

        {latestCoordinate && (
          <g>
            <circle className="gold-chart-dot-halo" cx={latestCoordinate.x} cy={latestCoordinate.y} r={7} />
            <circle className="gold-chart-dot is-latest" cx={latestCoordinate.x} cy={latestCoordinate.y} r={4} />
            <text className="gold-chart-latest-label" x={latestCoordinate.x} y={height - 5} textAnchor="end">
              {latestLabel}
            </text>
          </g>
        )}
      </svg>

      {activePoint && activeCoordinate && (
        <div
          className="gold-chart-tooltip"
          style={{
            // Clamped to the card so the tooltip never hangs off a narrow screen.
            left: `${Math.min(Math.max(activeCoordinate.x, 62), Math.max(width - 62, 62))}px`,
            top: `${Math.max(activeCoordinate.y - 10, 0)}px`,
          }}
        >
          <small>{shortDate(activePoint.date)}</small>
          <strong>{money(activePoint.price)} / gram</strong>
        </div>
      )}
    </div>
  );
};

export default GoldPriceChart;
