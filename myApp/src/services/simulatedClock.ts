/**
 * Demo time travel: follow the API's simulated "today".
 *
 * While `php artisan pawnshop:time-travel <date>` is on (local only), every
 * API response carries X-Simulated-Now. The app then shifts its own clock by
 * the same amount, so "due in N days", calendars and charts count from the
 * simulated date, and a banner says so. With no header the real clock is used.
 *
 * The shift is kept in sessionStorage and applied before the app renders, so
 * every screen agrees; a change of simulated date reloads the page once.
 */
const STORAGE_KEY = 'smartpawn_simulated_offset_ms';
/** Smaller differences are network delay, not a new simulated date. */
const SAME_OFFSET_MS = 5 * 60 * 1000;

const RealDate = Date;
let offsetMs = 0;
let installed = false;

const readStoredOffset = () => {
  try {
    return Number(sessionStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
};

const storeOffset = (value: number) => {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, String(value));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the shift still applies until the page is reloaded.
  }
};

/** Replace the global Date with one that runs offsetMs ahead. Done once. */
const install = () => {
  if (installed) return;
  installed = true;
  class ShiftedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(RealDate.now() + offsetMs);
      else super(...(args as [string | number | Date]));
    }

    static now() {
      return RealDate.now() + offsetMs;
    }
  }
  globalThis.Date = ShiftedDate as unknown as DateConstructor;
};

offsetMs = readStoredOffset();
if (offsetMs) install();

/** The simulated "now" while time travel is on, or null. */
export const simulatedNow = (): Date | null => (offsetMs ? new Date() : null);

/** Called with each API response's X-Simulated-Now header (null when absent). */
export function followSimulatedClock(header: string | null): void {
  const next = header ? new RealDate(header).getTime() - RealDate.now() : 0;
  if (Number.isNaN(next)) return;
  if (Math.abs(next - offsetMs) < SAME_OFFSET_MS) return;
  storeOffset(Math.abs(next) < SAME_OFFSET_MS ? 0 : next);
  window.location.reload();
}
