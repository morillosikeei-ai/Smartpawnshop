import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { money } from '../data/pawnshopStore';
import { buildAreaPath, buildLinePath, type ChartPoint } from './smoothPath';
import './ItemValueChart.css';

/** One recorded day of an item's value. `date` is already formatted for display. */
export type ItemValuePoint = { date: string; value: number };

type ItemValueChartProps = {
  points: ItemValuePoint[];
  /** The loan on the item, drawn as a reference line so the margin is visible. */
  loanAmount?: number;
  height?: number;
};

const CHART_HEIGHT = 180;

/** Left room holds the value labels; bottom room holds the date labels. */
const PADDING = { top: 16, right: 16, bottom: 26, left: 64 };

/**
 * An item's daily value as a smooth area chart, in the same style as the gold
 * price and revenue charts. Drawn in SVG with their shared curve maths.
 */
const ItemValueChart: React.FC<ItemValueChartProps> = ({ points, loanAmount, height = CHART_HEIGHT }) => {
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
  const plotBottom = PADDING.top + plotHeight;

  const geometry = useMemo(() => {
    if (points.length === 0 || plotWidth <= 0) {
      return { coordinates: [] as ChartPoint[], linePath: '', areaPath: '', ticks: [] as Array<{ y: number; value: number }>, loanY: null as number | null };
    }

    // The scale spans the recorded range, not zero upward: item values move by
    // a few percent a day, which would flatten into a straight line from zero.
    // The loan amount joins the range when it is close enough to matter.
    const values = points.map(point => point.value);
    let highest = Math.max(...values);
    let lowest = Math.min(...values);
    const showLoan = typeof loanAmount === 'number' && loanAmount > 0 && loanAmount >= lowest * 0.85;
    if (showLoan) {
      highest = Math.max(highest, loanAmount as number);
      lowest = Math.min(lowest, loanAmount as number);
    }
    const spread = highest - lowest;
    const margin = spread > 0 ? spread * 0.12 : Math.max(highest * 0.02, 1);
    const scaleTop = highest + margin;
    const scaleBottom = Math.max(0, lowest - margin);
    const scaleRange = scaleTop - scaleBottom || 1;
    const toY = (value: number) => PADDING.top + plotHeight - ((value - scaleBottom) / scaleRange) * plotHeight;

    const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;
    const coordinates = points.map((point, index) => ({
      x: PADDING.left + (points.length > 1 ? index * stepX : plotWidth / 2),
      y: toY(point.value),
    }));
    const linePath = buildLinePath(coordinates);
    const ticks = [scaleTop, (scaleTop + scaleBottom) / 2, scaleBottom].map(value => ({ y: toY(value), value }));

    return {
      coordinates,
      linePath,
      areaPath: buildAreaPath(coordinates, linePath, plotBottom),
      ticks,
      loanY: showLoan ? toY(loanAmount as number) : null,
    };
  }, [points, plotWidth, plotHeight, plotBottom, loanAmount]);

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
    [container, geometry.coordinates],
  );

  if (points.length === 0) return null;

  const latestIndex = points.length - 1;
  const first = points[0];
  const latest = points[latestIndex];
  const change = latest.value - first.value;
  const changePercent = first.value > 0 ? (change / first.value) * 100 : 0;
  const trend = change > 0 ? 'is-up' : change < 0 ? 'is-down' : 'is-flat';

  const activePoint = activeIndex === null ? null : points[activeIndex];
  const activeCoordinate = activeIndex === null ? null : geometry.coordinates[activeIndex];
  const latestCoordinate = geometry.coordinates[latestIndex];

  // At most about one date label per 90px, always keeping the first and last.
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotWidth / 90))));

  return (
    <div className="item-value-chart-card">
      <div className="item-value-summary">
        <div>
          <small>Latest value</small>
          <strong>{money(latest.value)}</strong>
        </div>
        <span className={`item-value-delta ${trend}`}>
          {change > 0 ? '+' : change < 0 ? '-' : ''}{money(Math.abs(change))} ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)
          <i>since {first.date}</i>
        </span>
      </div>

      <div
        className="item-value-chart"
        ref={setContainer}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerMove}
        onPointerLeave={() => setActiveIndex(null)}
        onPointerCancel={() => setActiveIndex(null)}
      >
        <svg
          className="item-value-chart-svg"
          width={width || undefined}
          height={height}
          role="img"
          aria-label={`Item value over ${points.length} recorded days. ${points.map(point => `${point.date} ${money(point.value)}`).join(', ')}.`}
        >
          <defs>
            <linearGradient id="itemValueAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1D4ED8" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0" />
            </linearGradient>
          </defs>

          {geometry.ticks.map(tick => (
            <g key={tick.y}>
              <line className="item-value-grid" x1={PADDING.left} x2={PADDING.left + plotWidth} y1={tick.y} y2={tick.y} />
              <text className="item-value-axis" x={PADDING.left - 8} y={tick.y + 3} textAnchor="end">{money(tick.value)}</text>
            </g>
          ))}

          {geometry.loanY !== null && (
            <g>
              <line className="item-value-loan" x1={PADDING.left} x2={PADDING.left + plotWidth} y1={geometry.loanY} y2={geometry.loanY} />
              <text className="item-value-loan-label" x={PADDING.left + plotWidth} y={geometry.loanY - 5} textAnchor="end">Pawn {money(loanAmount as number)}</text>
            </g>
          )}

          {geometry.areaPath && <path className="item-value-area" d={geometry.areaPath} fill="url(#itemValueAreaFill)" />}
          {geometry.linePath && <path className="item-value-line" d={geometry.linePath} />}

          {geometry.coordinates.map((coordinate, index) => (
            index === 0 || index === latestIndex || (index % labelEvery === 0 && latestIndex - index >= labelEvery) ? (
              <text
                key={points[index].date}
                className="item-value-axis"
                x={coordinate.x}
                y={height - 6}
                textAnchor={index === 0 ? 'start' : index === latestIndex ? 'end' : 'middle'}
              >
                {points[index].date}
              </text>
            ) : null
          ))}

          {geometry.coordinates.map((coordinate, index) => index !== latestIndex && (
            <circle key={`dot-${points[index].date}`} className={`item-value-dot${activeIndex === index ? ' is-active' : ''}`} cx={coordinate.x} cy={coordinate.y} r={activeIndex === index ? 4 : 3} />
          ))}

          {activeCoordinate && (
            <line className="item-value-cursor" x1={activeCoordinate.x} y1={PADDING.top} x2={activeCoordinate.x} y2={plotBottom} />
          )}

          {latestCoordinate && (
            <g>
              <circle className="item-value-dot-halo" cx={latestCoordinate.x} cy={latestCoordinate.y} r={7} />
              <circle className="item-value-dot is-latest" cx={latestCoordinate.x} cy={latestCoordinate.y} r={4} />
            </g>
          )}
        </svg>

        {activePoint && activeCoordinate && (
          <div
            className="item-value-tooltip"
            style={{
              left: `${Math.min(Math.max(activeCoordinate.x, 62), Math.max(width - 62, 62))}px`,
              top: `${Math.max(activeCoordinate.y - 10, 0)}px`,
            }}
          >
            <small>{activePoint.date}</small>
            <strong>{money(activePoint.value)}</strong>
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemValueChart;
