import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { buildAreaPath, buildLinePath, type ChartPoint } from './smoothPath';
import { Skeleton } from './Skeleton';
import './ModelPerformanceChart.css';

/** One reading on the accuracy series: a short axis label and a percentage. */
export type ModelPerformancePoint = {
  /** Axis label already formatted for the selected range, e.g. "2 PM", "Sep 3". */
  label: string;
  /** Prediction accuracy at that moment, in percent. */
  value: number;
  /** Longer label for the tooltip, when the axis label is too terse on its own. */
  caption?: string;
};

type ModelPerformanceChartProps = {
  points: ModelPerformancePoint[];
  /** True while the readings for the selected range are still loading. */
  loading?: boolean;
  /** Accessible summary of what the series covers, e.g. "the last 7 days". */
  rangeLabel: string;
};

/** Drawing height in CSS pixels. Taller than the dashboard mini charts: this is the panel's headline. */
const CHART_HEIGHT = 260;

/** Room kept around the plot for the axis labels and the end dot. */
const PADDING = { top: 16, right: 14, bottom: 28, left: 42 };

/** Horizontal gridlines drawn behind the curve, including the top and bottom edges. */
const GRID_LINES = 4;

/**
 * Prediction accuracy over time as a smooth line and area chart.
 *
 * Hand drawn in SVG so it shares the curve maths and the visual language of
 * the gold price and revenue cards. The project carries no charting
 * dependency and one series does not justify adding one.
 */
const ModelPerformanceChart: React.FC<ModelPerformanceChartProps> = ({ points, loading = false, rangeLabel }) => {
  // Held in state rather than a ref because the chart is not mounted during
  // the loading state, so a ref taken on first mount stays null.
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

  // A range change swaps the whole series, so a tooltip left open from the
  // previous range would describe a point that is no longer plotted.
  useEffect(() => setActiveIndex(null), [points]);

  const plotWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const geometry = useMemo(() => {
    if (points.length === 0 || plotWidth <= 0) {
      return { coordinates: [] as ChartPoint[], linePath: '', areaPath: '', ticks: [] as Array<{ y: number; value: number }> };
    }

    // Accuracy sits in a narrow band near the top of the percentage range, so
    // the scale spans the recorded readings rather than starting at zero: from
    // zero every range would flatten into one straight line. A fifth of the
    // spread is left above and below so peaks and troughs stay off the edges.
    const values = points.map((point) => point.value);
    const highest = Math.max(...values);
    const lowest = Math.min(...values);
    const spread = highest - lowest;
    const margin = spread > 0 ? spread * 0.2 : 1;
    const scaleTop = highest + margin;
    const scaleBottom = lowest - margin;
    const scaleRange = scaleTop - scaleBottom;

    const toY = (value: number) => PADDING.top + plotHeight - ((value - scaleBottom) / scaleRange) * plotHeight;

    const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;
    const coordinates = points.map((point, index) => ({
      x: PADDING.left + (points.length > 1 ? index * stepX : plotWidth / 2),
      y: toY(point.value),
    }));

    const ticks = Array.from({ length: GRID_LINES + 1 }, (_, index) => {
      const value = scaleBottom + (scaleRange * index) / GRID_LINES;
      return { y: toY(value), value };
    });

    const linePath = buildLinePath(coordinates);

    return { coordinates, linePath, areaPath: buildAreaPath(coordinates, linePath, PADDING.top + plotHeight), ticks };
  }, [points, plotWidth, plotHeight]);

  /** Nearest plotted reading to the pointer, so hovering anywhere works. */
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

  // Only some labels fit on a narrow card, so a stride is taken across the
  // series. The first and the last reading are always labelled.
  const labelStride = Math.max(1, Math.ceil(points.length / (plotWidth > 620 ? 8 : 4)));

  const latestIndex = points.length - 1;
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const activeCoordinate = activeIndex === null ? null : geometry.coordinates[activeIndex];
  const latestCoordinate = geometry.coordinates[latestIndex];

  // The placeholder is the height the plot will be, so the panel does not jump
  // when the readings arrive.
  if (loading) {
    return (
      <div className="model-chart" role="status" aria-label="Loading model performance history">
        <Skeleton width="100%" height={`${CHART_HEIGHT}px`} radius="12px" />
      </div>
    );
  }

  if (points.length === 0) {
    return <p className="model-chart-note">No accuracy readings recorded for this range yet.</p>;
  }

  return (
    <div
      className="model-chart"
      ref={setContainer}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerMove}
      onPointerLeave={() => setActiveIndex(null)}
      onPointerCancel={() => setActiveIndex(null)}
    >
      <svg
        className="model-chart-svg"
        width={width || undefined}
        height={CHART_HEIGHT}
        role="img"
        aria-label={`Prediction accuracy over ${rangeLabel}. ${points
          .map((point) => `${point.caption || point.label} ${point.value.toFixed(1)} percent`)
          .join(', ')}.`}
      >
        <defs>
          <linearGradient id="modelAccuracyAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1D4ED8" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0" />
          </linearGradient>
        </defs>

        {geometry.ticks.map((tick) => (
          <g key={tick.y}>
            <line className="model-chart-grid" x1={PADDING.left} y1={tick.y} x2={PADDING.left + plotWidth} y2={tick.y} />
            <text className="model-chart-axis" x={PADDING.left - 8} y={tick.y + 3} textAnchor="end">
              {tick.value.toFixed(1)}%
            </text>
          </g>
        ))}

        {geometry.areaPath && <path className="model-chart-area" d={geometry.areaPath} fill="url(#modelAccuracyAreaFill)" />}
        {geometry.linePath && <path className="model-chart-line" d={geometry.linePath} />}

        {/*
          Driven by the coordinates, not by the points: before the container has
          been measured there is no geometry to place a label against.
        */}
        {geometry.coordinates.map((coordinate, index) =>
          index % labelStride === 0 || index === latestIndex ? (
            <text
              key={`${points[index].label}-${index}`}
              className="model-chart-axis"
              x={coordinate.x}
              y={CHART_HEIGHT - 8}
              textAnchor={index === 0 ? 'start' : index === latestIndex ? 'end' : 'middle'}
            >
              {points[index].label}
            </text>
          ) : null
        )}

        {activeCoordinate && activeIndex !== latestIndex && (
          <g>
            <line
              className="model-chart-cursor"
              x1={activeCoordinate.x}
              y1={PADDING.top}
              x2={activeCoordinate.x}
              y2={PADDING.top + plotHeight}
            />
            <circle className="model-chart-dot" cx={activeCoordinate.x} cy={activeCoordinate.y} r={4} />
          </g>
        )}

        {latestCoordinate && (
          <g>
            <circle className="model-chart-dot-halo" cx={latestCoordinate.x} cy={latestCoordinate.y} r={8} />
            <circle className="model-chart-dot is-latest" cx={latestCoordinate.x} cy={latestCoordinate.y} r={4.5} />
          </g>
        )}
      </svg>

      {activePoint && activeCoordinate && (
        <div
          className="model-chart-tooltip"
          style={{
            // Clamped to the card so the tooltip never hangs off a narrow screen.
            left: `${Math.min(Math.max(activeCoordinate.x, 64), Math.max(width - 64, 64))}px`,
            top: `${Math.max(activeCoordinate.y - 12, 0)}px`,
          }}
        >
          <small>{activePoint.caption || activePoint.label}</small>
          <strong>{activePoint.value.toFixed(1)}% accuracy</strong>
        </div>
      )}
    </div>
  );
};

export default ModelPerformanceChart;
