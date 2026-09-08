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
 * in the New Transaction form.
 */
export const purityForKarat = (karat: string) =>
  ({ '10k': 0.417, '14k': 0.583, '18k': 0.75, '21k': 0.875, '24k': 1 }[karat.toLowerCase()] ?? 1);

/** Jewelry value at a gold price: weight x purity x price per gram. */
export const calculateAppraisal = (weight: number, karat: string, price: number) =>
  weight * purityForKarat(karat) * price;

/** "Sep 12, 2026" from an API date string. */
export const shortDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '-';

/** "September 12, 2026" from an API date string. */
export const longDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' }) : '-';

/** Status text as the portals show it, from the API's lowercase value. */
export const statusLabel = (status?: string | null) => {
  if (!status) return 'Unknown';
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

/** Risk level text as the portals show it, from the API's lowercase value. */
export const riskLabel = (level: string) => (level.charAt(0).toUpperCase() + level.slice(1)) as 'Low' | 'Medium' | 'High';

/** Whole days from today until the given date. Negative once overdue. */
export const daysUntil = (isoDate: string) => {
  const due = new Date(isoDate);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
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
