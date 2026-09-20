import { dueStatus, localDayKey } from './pawnshopStore';

/** ISO date for the day that many days from today. Negative reaches the past. */
const inDays = (count: number) => {
  const day = new Date();
  day.setDate(day.getDate() + count);
  return localDayKey(day);
};

test('reports nothing for an item with no open pawn', () => {
  expect(dueStatus(null)).toBeNull();
  expect(dueStatus('')).toBeNull();
  expect(dueStatus(undefined)).toBeNull();
});

test('counts the days a loan is past due', () => {
  expect(dueStatus(inDays(-1))).toEqual({ tone: 'is-overdue', label: '1d overdue' });
  expect(dueStatus(inDays(-12))).toEqual({ tone: 'is-overdue', label: '12d overdue' });
});

test('calls out the due date itself rather than counting zero days', () => {
  expect(dueStatus(inDays(0))).toEqual({ tone: 'is-due', label: 'Due today' });
});

test('changes tone a week before the due date, not the wording', () => {
  expect(dueStatus(inDays(7))).toEqual({ tone: 'is-soon', label: 'Due in 7d' });
  expect(dueStatus(inDays(8))).toEqual({ tone: 'is-ontrack', label: 'Due in 8d' });
});
