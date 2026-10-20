import React, { useEffect, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';
import { getCalendar, type ApiCalendar, type ApiCalendarItem } from '../services/api';
import { moneyExact, shortDate } from '../data/pawnshopStore';
import { SkeletonList } from '../components/Skeleton';
import './StaffDueCalendar.css';

/** A yyyy-mm key for the month a date falls in, which is what the API takes. */
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

/** A yyyy-mm-dd key for a local date, which is how the API keys a due date. */
const dayKey = (date: Date) => `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LEVEL_LABEL = { normal: 'Normal', medium: 'Medium risk', high: 'High risk or overdue' } as const;

/** "3d left", "Due today" or "2d late". */
const daysLeftText = (days: number) => (days < 0 ? `${Math.abs(days)}d late` : days === 0 ? 'Due today' : `${days}d left`);

/** Urgency band for the days-left pill, shared with the old "Due soon" table. */
const dueTone = (days: number) => (days < 0 ? 'overdue' : days <= 3 ? 'urgent' : days <= 7 ? 'soon' : 'ok');

/**
 * Month view of active pawns by due date, with a details panel beside it.
 *
 * Each day shows how many active pawns fall due, coloured by the worst one:
 * green normal, yellow when any has a medium risk alert, red when any is
 * overdue or high risk. The panel starts on "Today and at risk" so risk alerts
 * stay in view without a click; picking a day lists that day, and picking it
 * again goes back.
 *
 * The admin dashboard shows the same calendar with the admin panel styles.
 */
const StaffDueCalendar: React.FC<{
  onView: (row: ApiCalendarItem) => void;
  /** Which portal's panel styles the two cards take. */
  variant?: 'staff' | 'admin';
  /** Extra control shown in the month card's header, before the arrows. */
  headerAction?: React.ReactNode;
}> = ({ onView, variant = 'staff', headerAction }) => {
  const panel = `${variant}-panel`;
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [data, setData] = useState<ApiCalendar | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    getCalendar(monthKey(month))
      .then(result => { if (active) setData(result); })
      .catch(requestError => { if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load the calendar.'); });
    return () => { active = false; };
  }, [month]);

  const shiftMonth = (step: number) => {
    setSelected(null);
    setMonth(current => new Date(current.getFullYear(), current.getMonth() + step, 1));
  };

  const todayKey = data?.today ?? dayKey(new Date());
  const dayInfo = new Map((data?.days ?? []).map(day => [day.date, day]));

  // Monday-first grid, padded with blanks before the 1st.
  const leading = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)),
  ];

  // Default panel: today's pawns, then every at-risk pawn not already listed.
  const defaultRows = (() => {
    if (!data) return [];
    const seen = new Set(data.today_items.map(row => row.transaction_id));
    return [...data.today_items, ...data.at_risk.filter(row => !seen.has(row.transaction_id))];
  })();
  const rows: ApiCalendarItem[] = selected ? (data?.items ?? []).filter(row => row.due_date === selected) : defaultRows;

  const heading = selected
    ? new Date(`${selected}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : 'Today and at risk';

  return (
    <div className={`due-calendar due-calendar-${variant}`}>
      <div className={`${panel} due-calendar-month`}>
        <div className={`${panel}-head`}>
          <div>
            <small>DUE CALENDAR</small>
            <h3>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
          </div>
          <div className="due-calendar-nav">
            {headerAction}
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"><IonIcon icon={chevronBackOutline} /></button>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"><IonIcon icon={chevronForwardOutline} /></button>
          </div>
        </div>

        <div className="due-calendar-grid" role="grid" aria-label="Active pawns by due date">
          {WEEKDAYS.map(day => <span key={day} className="due-calendar-weekday" role="columnheader">{day}</span>)}
          {cells.map((date, index) => {
            if (!date) return <span key={`blank-${index}`} className="due-calendar-blank" />;
            const key = dayKey(date);
            const info = dayInfo.get(key);
            const classes = [
              'due-calendar-day',
              info ? `has-due ${info.level}` : '',
              key === todayKey ? 'today' : '',
              key === selected ? 'selected' : '',
            ].filter(Boolean).join(' ');
            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                className={classes}
                aria-pressed={key === selected}
                aria-label={`${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}${info ? `: ${info.count} due, ${LEVEL_LABEL[info.level]}` : ''}`}
                onClick={() => setSelected(current => (current === key ? null : key))}
              >
                <span className="due-calendar-date">{date.getDate()}</span>
                {info && <span className="due-calendar-count">{info.count}</span>}
              </button>
            );
          })}
        </div>

        <div className="due-calendar-legend">
          <span><i className="normal" />Normal</span>
          <span><i className="medium" />Medium risk</span>
          <span><i className="high" />High risk or overdue</span>
        </div>
      </div>

      <div className={`${panel} due-calendar-details`}>
        <div className={`${panel}-head`}>
          <div>
            <small>{selected ? 'DUE ON' : 'NEEDS ATTENTION'}</small>
            <h3>{heading}</h3>
          </div>
          {selected && <button type="button" onClick={() => setSelected(null)}>Back to today</button>}
        </div>

        <div className="due-calendar-list">
          {!data && !error && <SkeletonList rows={3} />}
          {error && <p className="risk-empty">{error}</p>}
          {data && rows.length === 0 && (
            <p className="risk-empty">
              {selected ? 'No active pawns due on this date.' : 'Nothing due today and no open risk alerts.'}
            </p>
          )}
          {rows.map(row => (
            <div className="due-calendar-row" key={row.transaction_id}>
              <div className="due-calendar-row-main">
                <strong>{row.item}</strong>
                <span>{row.customer} &middot; #{row.ticket_number}</span>
              </div>
              <div className="due-calendar-row-meta">
                <span>{moneyExact(row.loan_amount)}</span>
                <span>Due {shortDate(row.due_date)}</span>
              </div>
              <div className="due-calendar-row-tags">
                <em className={'due-pill ' + dueTone(row.days_left)}>{daysLeftText(row.days_left)}</em>
                <em className={'risk-pill ' + row.risk}>{row.risk.charAt(0).toUpperCase() + row.risk.slice(1)}</em>
              </div>
              <button type="button" className="due-calendar-view" onClick={() => onView(row)}>View</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StaffDueCalendar;
