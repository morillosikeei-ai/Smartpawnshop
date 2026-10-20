import React, { useEffect, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronBackOutline, chevronForwardOutline, storefrontOutline } from 'ionicons/icons';
import { getShopSchedule, type ApiShopSchedule } from '../services/api';
import { SkeletonList } from './Skeleton';
import './ShopCalendar.css';

/** A yyyy-mm-dd key for a local date, which is how the API keys a closure. */
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** ISO weekday: 1 is Monday, 7 Sunday. JavaScript counts Sunday as 0. */
const isoDay = (date: Date) => (date.getDay() === 0 ? 7 : date.getDay());

/** "09:00" as "9:00 AM", which is how a shop writes its hours. */
const clockTime = (value: string) => {
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const shown = hour % 12 === 0 ? 12 : hour % 12;
  return `${shown}:${String(minute).padStart(2, '0')} ${suffix}`;
};

const MONTH_LABEL = (date: Date) => date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const SHORT_DATE = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const LONG_DATE = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Shop Schedule & Holiday Notice.
 *
 * A customer deciding whether to travel to the branch needs one answer: is it
 * open. The card is the size of a date picker on purpose — this is something
 * to glance at, not a page to work in, and the dashboard belongs to the
 * customer's own pawns.
 *
 * Weeks start on Monday: the shop's own week does, and a Sunday-first grid
 * would put the one usually closed day in the middle of the working week.
 */
const ShopCalendar: React.FC = () => {
  // Which month the grid shows. Starts on today's.
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [schedule, setSchedule] = useState<ApiShopSchedule | null>(null);
  const [error, setError] = useState('');
  // The day the customer has tapped, so a closure's reason can be read on a
  // phone where there is no room to print it in the cell.
  const [picked, setPicked] = useState<string | null>(null);

  const month = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    let active = true;
    setError('');
    getShopSchedule(month)
      .then(loaded => { if (active) setSchedule(loaded); })
      .catch(loadError => { if (active) setError(loadError instanceof Error ? loadError.message : 'The shop schedule could not be loaded.'); });
    return () => { active = false; };
  }, [month]);

  const closures = new Map((schedule?.closures || []).map(row => [row.closure_date, row]));
  const todayKey = dayKey(new Date());

  // A Monday-first grid: lead with the blanks before the 1st, then run to the
  // end of the month.
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const lead = isoDay(first) - 1;
  const cells: Array<Date | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(cursor.getFullYear(), cursor.getMonth(), index + 1)),
  ];

  const step = (months: number) => {
    setPicked(null);
    setCursor(current => new Date(current.getFullYear(), current.getMonth() + months, 1));
  };

  const pickedClosure = picked ? closures.get(picked) : undefined;
  const openDays = schedule?.open_days || [];

  const usualHours = schedule ? `${clockTime(schedule.opens_at)} – ${clockTime(schedule.closes_at)}` : '';
  const pickedIsRestDay = picked ? !openDays.includes(isoDay(new Date(`${picked}T00:00:00`))) : false;
  const next = schedule?.next_closure;

  let detailTitle = 'Open ' + usualHours;
  let detailBody = 'Tap a date for its hours.';
  let detailTone = 'is-open';

  if (pickedClosure) {
    detailTitle = SHORT_DATE(pickedClosure.closure_date);
    detailBody = pickedClosure.kind === 'closed'
      ? `Closed · ${pickedClosure.label}`
      : `${clockTime(pickedClosure.opens_at || '')} – ${clockTime(pickedClosure.closes_at || '')} · ${pickedClosure.label}`;
    detailTone = pickedClosure.kind === 'closed' ? 'is-shut' : 'is-half';
  } else if (picked) {
    detailTitle = SHORT_DATE(picked);
    detailBody = pickedIsRestDay ? 'Closed' : `Open ${usualHours}`;
    detailTone = pickedIsRestDay ? 'is-shut' : 'is-open';
  } else if (next) {
    detailTitle = `Next closed: ${SHORT_DATE(next.closure_date)}`;
    detailBody = next.kind === 'closed'
      ? next.label
      : `${clockTime(next.opens_at || '')} – ${clockTime(next.closes_at || '')} · ${next.label}`;
    detailTone = next.kind === 'closed' ? 'is-shut' : 'is-half';
  }

  return (
    <section className="shop-calendar" aria-label="Shop schedule and holiday notice">
      <header className="shop-calendar-head">
        <span className="shop-calendar-title"><IonIcon icon={storefrontOutline} aria-hidden="true" />Shop Schedule</span>
        <span className="shop-calendar-nav">
          <button type="button" onClick={() => step(-1)} aria-label="Previous month"><IonIcon icon={chevronBackOutline} /></button>
          <strong>{MONTH_LABEL(cursor)}</strong>
          <button type="button" onClick={() => step(1)} aria-label="Next month"><IonIcon icon={chevronForwardOutline} /></button>
        </span>
      </header>

      {error && <p className="shop-calendar-error">{error}</p>}
      {!schedule && !error && <SkeletonList rows={3} />}

      {schedule && (
        <>
          <div className="shop-calendar-grid" role="grid">
            {WEEKDAY_INITIALS.map((letter, index) => (
              <span key={WEEKDAYS[index]} className="shop-calendar-weekday" role="columnheader" title={WEEKDAYS[index]}>{letter}</span>
            ))}

            {cells.map((date, index) => {
              if (!date) return <span key={`blank-${index}`} className="shop-calendar-blank" aria-hidden="true" />;

              const key = dayKey(date);
              const closure = closures.get(key);
              // Shut either because it is a closure, or because the branch
              // never opens on that weekday.
              const restDay = !openDays.includes(isoDay(date));
              const shut = closure?.kind === 'closed' || restDay;
              const classes = [
                'shop-calendar-day',
                shut ? 'is-shut' : 'is-open',
                closure?.kind === 'half_day' ? 'is-half' : '',
                key === todayKey ? 'is-today' : '',
                picked === key ? 'is-picked' : '',
              ].filter(Boolean).join(' ');

              return (
                <button
                  key={key}
                  type="button"
                  className={classes}
                  role="gridcell"
                  aria-label={`${LONG_DATE(key)} — ${closure ? closure.label : shut ? 'closed' : 'open'}`}
                  onClick={() => setPicked(current => (current === key ? null : key))}
                >
                  <b>{date.getDate()}</b>
                  {closure && <i aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          {/* One line under the grid. With nothing picked it falls back to
              the next shut day, which is what most customers came for. */}
          <div className={`shop-calendar-detail ${detailTone}`} aria-live="polite">
            <strong>{detailTitle}</strong>
            <span>{detailBody}</span>
          </div>

          <ul className="shop-calendar-key">
            <li><i className="is-open" aria-hidden="true" />Open</li>
            <li><i className="is-half" aria-hidden="true" />Short hours</li>
            <li><i className="is-shut" aria-hidden="true" />Closed</li>
          </ul>
        </>
      )}
    </section>
  );
};

export default ShopCalendar;
