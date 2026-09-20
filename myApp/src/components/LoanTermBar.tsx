import React from 'react';
import { daysUntil } from '../data/pawnshopStore';
import './LoanTermBar.css';

/** Days before the due date when the bar turns yellow, whatever the term length. */
export const DUE_SOON_DAYS = 7;

/** Share of the term left when the bar turns yellow: the last 25%. */
export const DUE_SOON_FRACTION = 0.25;

export type LoanTermTone = 'is-ontrack' | 'is-soon' | 'is-overdue';

export type LoanTerm = {
  /** Share of the term already elapsed, 0-100. Null when the start date is unknown. */
  percent: number | null;
  daysLeft: number;
  termDays: number | null;
  tone: LoanTermTone;
  label: string;
};

const startOfDay = (isoDate: string) => {
  const date = new Date(isoDate);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/**
 * How far a loan has run from the date pawned to its due date, and how that
 * should read.
 *
 * Green while there is plenty of time. Yellow once the loan is within
 * DUE_SOON_DAYS of its due date, or into the last DUE_SOON_FRACTION of its
 * term, whichever comes first. Red once the due date has passed. Returns null
 * without a due date.
 */
export const loanTermProgress = (
  pawnedIso: string | null | undefined,
  dueIso: string | null | undefined,
  { soonDays = DUE_SOON_DAYS, soonFraction = DUE_SOON_FRACTION } = {},
): LoanTerm | null => {
  if (!dueIso || !Number.isFinite(new Date(dueIso).getTime())) return null;

  const daysLeft = daysUntil(dueIso);
  const label = daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `Due in ${daysLeft}d`;

  let termDays: number | null = null;
  let percent: number | null = null;
  if (pawnedIso && Number.isFinite(new Date(pawnedIso).getTime())) {
    const days = Math.round((startOfDay(dueIso) - startOfDay(pawnedIso)) / 86400000);
    if (days > 0) {
      termDays = days;
      // Clamped so an overdue loan reads as a full bar instead of overflowing.
      percent = Math.min(100, Math.max(0, ((days - daysLeft) / days) * 100));
    }
  }

  const tone: LoanTermTone = daysLeft < 0
    ? 'is-overdue'
    : daysLeft <= soonDays || (termDays !== null && daysLeft <= termDays * soonFraction)
      ? 'is-soon'
      : 'is-ontrack';

  return { percent, daysLeft, termDays, tone, label };
};

/**
 * A loan's term as a bar that fills toward the due date, with the "Due in Xd"
 * label beside it. Used for every due indicator in the Customer Portal so they
 * all read the same way.
 */
const LoanTermBar: React.FC<{ pawnedIso?: string | null; dueIso?: string | null; className?: string }> = ({ pawnedIso, dueIso, className = '' }) => {
  const term = loanTermProgress(pawnedIso, dueIso);
  if (!term) return null;

  const elapsed = term.percent === null ? null : Math.round(term.percent);

  return (
    <span className={`loan-term-bar ${term.tone} ${className}`.trim()}>
      {term.percent !== null && (
        <span
          className="loan-term-track"
          role="progressbar"
          aria-label="Pawn term elapsed"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={elapsed ?? 0}
          aria-valuetext={`${elapsed}% of the pawn term elapsed, ${term.label}`}
        >
          <i style={{ width: `${term.percent}%` }} />
        </span>
      )}
      <b className="loan-term-label">{term.label}</b>
    </span>
  );
};

export default LoanTermBar;
