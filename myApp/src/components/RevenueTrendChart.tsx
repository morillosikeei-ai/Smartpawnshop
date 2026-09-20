import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { moneyExact } from '../data/pawnshopStore';
import { buildAreaPath, buildLinePath, type ChartPoint } from './smoothPath';
import { Skeleton } from './Skeleton';
import './RevenueTrendChart.css';

/**
 * One day of collected revenue, exactly as the API's `revenue_trend` sends it.
 */
export type RevenuePoint = {
  /** ISO date string, e.g. "2026-09-08". */
  date: string;
  /** Pesos collected that day. */
  revenue: number;
};

type RevenueTrendChartProps = {
  points: RevenuePoint[];
  /** True while the dashboard request is still in flight. */
  loading?: boolean;
  /** Set when the dashboard request failed, so the card can say so. */
  error?: string;
};

/** Drawing height in CSS pixels. Width follows the card. */
const CHART_HEIGHT = 152;

/** Room kept around the plot so the end dots and labels are never clipped. */
const PADDING = { top: 14, right: 12, bottom: 26, left: 12 };

/** Weekday initials, indexed by Date#getDay() (0 is Sunday). */
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon", "Tue", ... for an API date string. */
const weekdayLabel = (isoDate: string) => WEEKDAY_LABELS[new Date(isoDate).getDay()] ?? '';

/** "Mon, Sep 08" for the tooltip heading. */
const tooltipDate = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit' });

/**
 * Seven day revenue as a smooth area chart.
 *
 * The series is drawn by hand in SVG rather than through a charting library:
 * the project has no chart dependency, and one line with a filled area does
 * not justify adding one.
 */
const RevenueTrendChart: React.FC<RevenueTrendChartProps> = ({ points, loading = false, error = '' }) => {
  // The container is held in state, not a plain ref, because the chart is not
  // mounted during the loading and error states. A ref set once on first mount
  // would still be null when the real chart finally appears, leaving it unsized.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // The SVG is drawn at real pixel width so the stroke and the labels stay the
  // same weight on every screen, instead of being stretched by a viewBox.
  useEffect(() => {
    if (!container) return;

    setWidth(container.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(container);

    return () => observer.disconnect();
  }, [container]);

  const plotWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const geometry = useMemo(() => {
    if (points.length === 0 || plotWidth <= 0) {
      return { coordinates: [] as ChartPoint[], linePath: '', areaPath: '' };
    }

    // A flat series (every day the same, including all zeroes) has no range to
    // scale against, so it is drawn along the baseline instead of dividing by
    // zero. The top of the scale is padded so the peak is not glued to the edge.
    const highest = Math.max(...points.map((point) => point.revenue));
    const scaleTop = highest > 0 ? highest * 1.15 : 1;

    const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;
    const coordinates = points.map((point, index) => ({
      x: PADDING.left + (points.length > 1 ? index * stepX : plotWidth / 2),
      y: PADDING.top + plotHeight - (point.revenue / scaleTop) * plotHeight,
    }));

    const linePath = buildLinePath(coordinates);
    const areaPath = buildAreaPath(coordinates, linePath, PADDING.top + plotHeight);

    return { coordinates, linePath, areaPath };
  }, [points, plotWidth, plotHeight]);

  /** Nearest day to the pointer, so hovering anywhere in the band works. */
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
  const hasRevenue = points.some((point) => point.revenue > 0);
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const activeCoordinate = activeIndex === null ? null : geometry.coordinates[activeIndex];

  // The placeholder is the height the plot will be, so the card does not jump
  // when the series arrives.
  if (loading) {
    return (
      <div className="revenue-chart" role="status" aria-label="Loading revenue">
        <Skeleton width="100%" height={`${CHART_HEIGHT}px`} radius="12px" />
      </div>
    );
  }

  if (error) {
    return <p className="revenue-chart-note revenue-chart-note-error">{error}</p>;
  }

  if (points.length === 0) {
    return <p className="revenue-chart-note">No revenue recorded in the last 7 days.</p>;
  }

  return (
    <div
      className="revenue-chart"
      ref={setContainer}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerMove}
      onPointerLeave={() => setActiveIndex(null)}
      onPointerCancel={() => setActiveIndex(null)}
    >
      <svg
        className="revenue-chart-svg"
        width={width || undefined}
        height={CHART_HEIGHT}
        role="img"
        aria-label={`Revenue for the last 7 days. ${points
          .map((point) => `${weekdayLabel(point.date)} ${moneyExact(point.revenue)}`)
          .join(', ')}.`}
      >
        <defs>
          <linearGradient id="revenueAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* The single baseline is the only rule drawn: no grid, no box. */}
        <line
          className="revenue-chart-baseline"
          x1={PADDING.left}
          y1={PADDING.top + plotHeight}
          x2={PADDING.left + plotWidth}
          y2={PADDING.top + plotHeight}
        />

        {geometry.areaPath && <path className="revenue-chart-area" d={geometry.areaPath} fill="url(#revenueAreaFill)" />}
        {geometry.linePath && <path className="revenue-chart-line" d={geometry.linePath} />}

        {activeCoordinate && (
          <line
            className="revenue-chart-cursor"
            x1={activeCoordinate.x}
            y1={PADDING.top}
            x2={activeCoordinate.x}
            y2={PADDING.top + plotHeight}
          />
        )}

        {geometry.coordinates.map((coordinate, index) => {
          const isLatest = index === latestIndex;
          const isActive = index === activeIndex;
          if (!isLatest && !isActive) return null;

          return (
            <g key={points[index].date}>
              <circle className="revenue-chart-dot-halo" cx={coordinate.x} cy={coordinate.y} r={7} />
              <circle
                className={`revenue-chart-dot${isLatest ? ' is-latest' : ''}`}
                cx={coordinate.x}
                cy={coordinate.y}
                r={4}
              />
            </g>
          );
        })}

        {geometry.coordinates.map((coordinate, index) => (
          <text
            key={`label-${points[index].date}`}
            className={`revenue-chart-axis-label${index === activeIndex ? ' is-active' : ''}`}
            x={coordinate.x}
            y={CHART_HEIGHT - 6}
            textAnchor="middle"
          >
            {weekdayLabel(points[index].date)}
          </text>
        ))}
      </svg>

      {activePoint && activeCoordinate && (
        <div
          className="revenue-chart-tooltip"
          style={{
            // Clamped to the card so the tooltip never hangs off a narrow screen.
            left: `${Math.min(Math.max(activeCoordinate.x, 56), Math.max(width - 56, 56))}px`,
            top: `${Math.max(activeCoordinate.y - 12, 0)}px`,
          }}
        >
          <small>{tooltipDate(activePoint.date)}</small>
          <strong>{moneyExact(activePoint.revenue)}</strong>
        </div>
      )}

      {!hasRevenue && <p className="revenue-chart-empty">No collections recorded in this period.</p>}
    </div>
  );
};

export default RevenueTrendChart;
