/**
 * Shared formatting and appraisal helpers.
 *
 * This module used to hold a seeded localStorage "workflow store" with demo
 * customers, tickets, and gold prices. Every screen now reads the real records
 * from the API, so nothing is kept or invented on the client and only these
 * pure helpers remain.
 */

/** Peso amount, rounded to whole pesos for display. */
export const money = (value: number) => `₱${Math.round(value).toLocaleString()}`;

/** Peso amount keeping centavos. Use where the exact figure matters. */
export const moneyExact = (value: number) =>
  `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Gold purity by karat, as a fraction of pure gold. Mirrors Item::KARAT_PURITY
 * in the API, which is the authority: this copy only drives the live preview
 * in the New Pawn Transaction form.
 */
export const purityForKarat = (karat: string) =>
  ({ '10k': 0.417, '14k': 0.583, '18k': 0.75, '21k': 0.875, '22k': 0.917, '24k': 1 }[karat.toLowerCase()] ?? 1);

/** Jewelry value at a gold price: weight x purity x price per gram. */
export const calculateAppraisal = (weight: number, karat: string, price: number) =>
  weight * purityForKarat(karat) * price;

/**
 * Silver fineness options, as a fraction of pure silver. Mirrors
 * Item::SILVER_PURITY in the API. Sent and stored as fineness, never as karat.
 */
export const SILVER_PURITIES = [
  { value: '800', label: '800 Silver', purity: 0.8 },
  { value: '925', label: '925 Sterling Silver', purity: 0.925 },
  { value: '950', label: '950 Silver', purity: 0.95 },
  { value: '999', label: '999 Fine Silver', purity: 0.999 },
];

/** The fineness a new silver item starts on: sterling. */
export const DEFAULT_SILVER_FINENESS = '925';

/** Karat or fineness as the screens show it: "18K" for gold, "925" for silver. */
export const purityLabel = (item?: { metal_type?: string | null; karat?: string | null; fineness?: string | null } | null) =>
  item?.metal_type === 'silver'
    ? item.fineness || item.karat || null
    : item?.karat ? item.karat.toUpperCase() : null;

export const purityForSilver = (fineness: string) =>
  SILVER_PURITIES.find(option => option.value === fineness)?.purity ?? 1;

/**
 * A calendar day from the API ("2026-09-12", or a date cast sent as
 * "2026-09-12T00:00:00.000000Z") as local midnight of that same day.
 *
 * new Date("2026-09-12") reads the string as UTC midnight, which is the
 * previous evening anywhere west of UTC, so a due date would land a day early.
 * A full timestamp with a time of day is a real instant and is parsed as is.
 */
export const parseDay = (value: string) => {
  const day = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.0+)?Z)?$/.exec(value);
  return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
};

/** Local "YYYY-MM-DD" of a date, the same shape the API sends for a day. */
export const localDayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** "Sep 12, 2026" from an API date string. */
export const shortDate = (value?: string | null) =>
  value ? parseDay(value).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '-';

/** "September 12, 2026" from an API date string. */
export const longDate = (value?: string | null) =>
  value ? parseDay(value).toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' }) : '-';

/**
 * What the portals call the API's 'forfeited' status. The stored value stays
 * 'forfeited'; only the text people read changes.
 */
export const FORFEITED_LABEL = 'Expired/Unclaimed';

/** Status text as the portals show it, from the API's lowercase value. */
export const statusLabel = (status?: string | null) => {
  if (!status) return 'Unknown';
  if (status === 'forfeited') return FORFEITED_LABEL;
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

/**
 * CSS class for a status label, so styles keyed on the stored value
 * (.forfeited, .for-sale) still apply after the label is reworded.
 */
export const statusClass = (label: string) =>
  label === FORFEITED_LABEL ? 'forfeited' : label.toLowerCase().replace(' ', '-');

/** Risk level text as the portals show it, from the API's lowercase value. */
export const riskLabel = (level: string) => (level.charAt(0).toUpperCase() + level.slice(1)) as 'Low' | 'Medium' | 'High';

/** Whole days from today until the given date. Negative once overdue. */
export const daysUntil = (isoDate: string) => {
  const due = parseDay(isoDate);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
};

/**
 * How a loan's due date reads on a card: the wording, and which tone the badge
 * carries. Derived from the due date alone, so it says nothing the record does
 * not already hold. Returns null for an item with no open loan.
 */
export const dueStatus = (dueIso?: string | null): { tone: string; label: string } | null => {
  if (!dueIso) return null;

  const days = daysUntil(dueIso);
  if (days < 0) return { tone: 'is-overdue', label: `${Math.abs(days)}d overdue` };
  if (days === 0) return { tone: 'is-due', label: 'Due today' };
  // A week out is when a redemption stops being something to plan and starts
  // being something to do, so that is where the badge changes colour.
  if (days <= 7) return { tone: 'is-soon', label: `Due in ${days}d` };
  return { tone: 'is-ontrack', label: `Due in ${days}d` };
};

/** "5 minutes ago", "2 days ago" — relative time for notification rows. */
export const timeAgo = (isoDate: string) => {
  const elapsedSeconds = Math.max(0, (Date.now() - new Date(isoDate).getTime()) / 1000);
  if (elapsedSeconds < 60) return 'just now';

  const units: Array<[number, string]> = [[60, 'minute'], [3600, 'hour'], [86400, 'day'], [604800, 'week']];
  for (let index = 0; index < units.length; index += 1) {
    const [seconds, name] = units[index];
    const next = units[index + 1];
    if (!next || elapsedSeconds < next[0]) {
      const count = Math.floor(elapsedSeconds / seconds);
      return `${count} ${name}${count === 1 ? '' : 's'} ago`;
    }
  }

  return 'a while ago';
};
