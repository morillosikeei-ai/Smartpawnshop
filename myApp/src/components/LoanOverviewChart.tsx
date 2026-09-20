import React, { useEffect, useMemo, useState } from 'react';
import { money } from '../data/pawnshopStore';
import { buildAreaPath, buildLinePath } from './smoothPath';
import './LoanOverviewChart.css';

/** One of the customer's loans, reduced to what the balance over time needs. */
export type LoanRecord = {
  /** When the loan was taken (the transaction's created_at). */
  pawnedIso: string;
  /** When it was redeemed, if it was. Nothing is owed from that day on. */
  redeemedIso?: string | null;
  /** Whether the loan is still open today (active or overdue). */
  open: boolean;
  principal: number;
  /** interest_rate as the API stores it: a fraction per month, e.g. 0.05. */
  monthlyRate: number;
};

export type LoanPoint = {
  /** Local calendar day, "YYYY-MM-DD". */
  date: string;
  /** Principal plus interest accrued by that day, across open loans. */
  due: number;
  /** Principal of the loans open that day. */
  principal: number;
};

export const LOAN_RANGES = [
  { days: 7, label: '7 Days' },
  { days: 30, label: '30 Days' },
  { days: 90, label: '3 Months' },
] as const;

const DAY_MS = 86400000;

const startOfDay = (value: string | Date) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const dayKey = (time: number) => {
  const date = new Date(time);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/**
 * What the customer owed on each of the last `days` days, today included.
 *
 * Mirrors Transaction::interestDue on the API: principal x monthly rate x
 * days held / 30. A loan counts from the day it was pawned until the day it was
 * redeemed. A closed loan with no redemption date (forfeited) cannot be placed
 * in time, so it is left out. There are no payment records, so the figure is
 * an estimate of the balance, not a statement.
 */
export const loanBalanceSeries = (loans: LoanRecord[], days: number, today: Date = new Date()): LoanPoint[] => {
  const end = startOfDay(today);
  const points: LoanPoint[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = end - offset * DAY_MS;
    let due = 0;
    let principal = 0;

    loans.forEach((loan) => {
      const start = startOfDay(loan.pawnedIso);
      if (!Number.isFinite(start) || start > day || loan.principal <= 0) return;

      const closedOn = loan.redeemedIso ? startOfDay(loan.redeemedIso) : null;
      if (closedOn !== null && Number.isFinite(closedOn) ? day >= closedOn : !loan.open) return;

      const held = Math.round((day - start) / DAY_MS);
      principal += loan.principal;
      due += loan.principal + loan.principal * loan.monthlyRate * (held / 30);
    });

    points.push({ date: dayKey(day), due: Math.round(due * 100) / 100, principal: Math.round(principal * 100) / 100 });
  }

  return points;
};

const HEIGHT = 170;
const PAD = { top: 14, right: 14, bottom: 26, left: 14 };

const shortLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * Loan Overview: the customer's estimated amount due over 7 days, 30 days, or
 * 3 months, with the principal beneath it. Drawn in SVG with the same curve
 * helper as the other dashboard charts; the project has no chart library.
 */
const LoanOverviewChart: React.FC<{ loans: LoanRecord[]; loading?: boolean }> = ({ loans, loading = false }) => {
  const [range, setRange] = useState<number>(30);
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

  const series = useMemo(() => loanBalanceSeries(loans, range), [loans, range]);
  const hasData = series.some((point) => point.due > 0);

  const first = series[0];
  const last = series[series.length - 1];
  const change = first && first.due > 0 ? ((last.due - first.due) / first.due) * 100 : null;

  // Drawn only once the container has a width; the chart area stays reserved.
  const plotWidth = Math.max(0, width - PAD.left - PAD.right);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const max = Math.max(...series.map((point) => point.due), 1);
  const step = series.length > 1 ? plotWidth / (series.length - 1) : 0;
  const y = (value: number) => PAD.top + (1 - value / (max * 1.08)) * plotHeight;
  const dueCoords = series.map((point, index) => ({ x: PAD.left + index * step, y: y(point.due) }));
  const principalCoords = series.map((point, index) => ({ x: PAD.left + index * step, y: y(point.principal) }));
  const duePath = width > 0 ? buildLinePath(dueCoords) : '';
  const dueArea = width > 0 ? buildAreaPath(dueCoords, duePath, PAD.top + plotHeight) : '';
  const principalPath = width > 0 ? buildLinePath(principalCoords) : '';

  const active = activeIndex !== null ? series[activeIndex] : null;
  const activeCoord = activeIndex !== null ? dueCoords[activeIndex] : null;

  const onPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!step) return;
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.round((event.clientX - box.left - PAD.left) / step);
    setActiveIndex(Math.min(series.length - 1, Math.max(0, index)));
  };

  return (
    <div className="loan-overview">
      <div className="loan-overview-head">
        <div>
          <small>PAWN OVERVIEW</small>
          <h3>Amount due over time</h3>
        </div>
        <div className="loan-overview-ranges" role="tablist" aria-label="Pawn overview range">
          {LOAN_RANGES.map((option) => (
            <button
              key={option.days}
              type="button"
              role="tab"
              aria-selected={range === option.days}
              className={range === option.days ? 'active' : ''}
              onClick={() => { setRange(option.days); setActiveIndex(null); }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="loan-overview-figures">
        <div>
          <span>Estimated amount due today</span>
          <strong>{loading ? '--' : money(last?.due || 0)}</strong>
        </div>
        <div className="is-principal">
          <span>Principal</span>
          <strong>{loading ? '--' : money(last?.principal || 0)}</strong>
        </div>
        {change !== null && (
          <div>
            <span>Change · {LOAN_RANGES.find((option) => option.days === range)?.label}</span>
            <strong className={change > 0 ? 'is-up' : change < 0 ? 'is-down' : ''}>{change > 0 ? '+' : ''}{change.toFixed(1)}%</strong>
          </div>
        )}
      </div>

      <div className="loan-overview-plot" ref={setContainer} style={{ height: HEIGHT }}>
        {!loading && !hasData && <p className="loan-overview-empty">No open pawns in this period.</p>}
        {!loading && hasData && width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Estimated amount due over the last ${series.length} days, from ${money(first.due)} to ${money(last.due)}.`}
            onPointerMove={onPointer}
            onPointerLeave={() => setActiveIndex(null)}
          >
            <defs>
              <linearGradient id="loan-overview-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1e3a8a" stopOpacity=".16" />
                <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line className="loan-overview-baseline" x1={PAD.left} x2={PAD.left + plotWidth} y1={PAD.top + plotHeight} y2={PAD.top + plotHeight} />
            <path className="loan-overview-area" d={dueArea} fill="url(#loan-overview-fill)" />
            <path className="loan-overview-principal" d={principalPath} />
            <path className="loan-overview-line" d={duePath} />
            {activeCoord && <line className="loan-overview-guide" x1={activeCoord.x} x2={activeCoord.x} y1={PAD.top} y2={PAD.top + plotHeight} />}
            <circle className="loan-overview-dot" cx={(activeCoord || dueCoords[dueCoords.length - 1]).x} cy={(activeCoord || dueCoords[dueCoords.length - 1]).y} r={4.5} />
            <text className="loan-overview-axis" x={PAD.left} y={HEIGHT - 6}>{shortLabel(first.date)}</text>
            <text className="loan-overview-axis" x={PAD.left + plotWidth} y={HEIGHT - 6} textAnchor="end">{shortLabel(last.date)}</text>
          </svg>
        )}
        {active && activeCoord && (
          <div
            className="loan-overview-tooltip"
            style={{ left: Math.min(Math.max(activeCoord.x, 70), Math.max(70, width - 70)) }}
            role="status"
          >
            <small>{shortLabel(active.date)}</small>
            <strong>{money(active.due)}</strong>
            <span>Principal {money(active.principal)}</span>
          </div>
        )}
      </div>

      <div className="loan-overview-foot">
        <span className="loan-overview-legend"><b className="is-due" />Amount due</span>
        <span className="loan-overview-legend"><b className="is-principal" />Principal</span>
        <small>Estimate from your pawns' interest. The exact amount is confirmed at redemption.</small>
      </div>
    </div>
  );
};

export default LoanOverviewChart;
