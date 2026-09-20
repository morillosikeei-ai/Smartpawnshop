import type { ApiAuditLog, ApiCustomer, ApiTransaction } from '../services/api';
import { shortDate, statusLabel } from '../data/pawnshopStore';

/**
 * Row rules and CSV layouts shared by Admin > Records and Reports > Exports.
 */

/* ------------------------------------------------------------------ */
/* CSV export                                                          */
/* ------------------------------------------------------------------ */

type CsvCell = string | number | null | undefined;

/** Quote a cell only when it holds a comma, quote or line break. */
const csvCell = (value: CsvCell) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Build a CSV file in the browser and hand it to the viewer as a download. */
export const downloadCsv = (fileName: string, header: string[], rows: CsvCell[][]) => {
  const body = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  // The byte order mark makes Excel read the peso sign and accents correctly.
  const blob = new Blob(['﻿', body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

/* ------------------------------------------------------------------ */
/* Shared row rules                                                    */
/* ------------------------------------------------------------------ */

/** An active pawn past its due date. The daily job forfeits it after the grace period. */
export const isOverdue = (transaction: ApiTransaction) =>
  transaction.status === 'active' && transaction.days_until_due < 0;

/** A redeemed pawn is a payment: principal plus the interest accrued to that day. */
export const isPayment = (transaction: ApiTransaction) =>
  transaction.status === 'redeemed' && Boolean(transaction.redeemed_at);

/** The day the pawn is forfeited when still unpaid: due date plus the grace period. */
export const forfeitDate = (transaction: ApiTransaction) => {
  const date = new Date(transaction.due_date);
  date.setDate(date.getDate() + Number(transaction.grace_period_days || 0));
  return date.toISOString();
};

export const dateTime = (value: string) =>
  new Date(value).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export const itemName = (transaction: ApiTransaction) => transaction.item?.description || `Item #${transaction.item_id}`;

/* CSV layouts, shared by the Records tabs and the Reports > Exports list. */

export const transactionsCsv = (rows: ApiTransaction[]) => downloadCsv(
  'pawn-transactions',
  ['Ticket', 'Date', 'Customer', 'Item', 'Appraised value', 'Pawn amount', 'Interest rate (%/month)', 'Due date', 'Status', 'Interest due', 'Total payable'],
  rows.map(row => [
    row.ticket_number, shortDate(row.created_at), row.customer?.name, itemName(row),
    Number(row.item?.appraised_value ?? 0), Number(row.loan_amount), (Number(row.interest_rate) * 100).toFixed(2),
    shortDate(row.due_date), statusLabel(row.status), Number(row.interest_due), Number(row.total_payable),
  ]),
);

export const paymentsCsv = (rows: ApiTransaction[]) => downloadCsv(
  'payments',
  ['Date paid', 'Ticket', 'Customer', 'Item', 'Principal', 'Interest', 'Total paid', 'Days held'],
  rows.map(row => [
    shortDate(row.redeemed_at), row.ticket_number, row.customer?.name, itemName(row),
    Number(row.loan_amount), Number(row.interest_due), Number(row.total_payable), row.days_elapsed,
  ]),
);

export const overdueCsv = (rows: ApiTransaction[]) => downloadCsv(
  'overdue-and-forfeited',
  ['Ticket', 'Customer', 'Contact', 'Item', 'Status', 'Due date', 'Days overdue', 'Forfeit date', 'Pawn amount', 'Amount due'],
  rows.map(row => [
    row.ticket_number, row.customer?.name, row.customer?.contact_number, itemName(row),
    isOverdue(row) ? 'Overdue' : statusLabel(row.status), shortDate(row.due_date),
    isOverdue(row) ? Math.abs(row.days_until_due) : '', shortDate(forfeitDate(row)),
    Number(row.loan_amount), Number(row.total_payable),
  ]),
);

export const customersCsv = (rows: ApiCustomer[]) => downloadCsv(
  'customers',
  ['Name', 'Email', 'Contact', 'Address', 'Valid ID type', 'Valid ID number', 'Active pawns', 'Total pawns'],
  rows.map(row => [
    row.name, row.user?.email ?? row.email, row.contact_number, row.address, row.valid_id_type, row.valid_id_number,
    row.active_items_count ?? 0, row.total_items_count ?? 0,
  ]),
);

export const activityCsv = (rows: ApiAuditLog[]) => downloadCsv(
  'staff-activity',
  ['Date and time', 'User', 'Role', 'Action', 'Ticket', 'Reason'],
  rows.map(row => [dateTime(row.created_at), row.user?.name ?? 'System', row.user?.role ?? '', row.action, row.ticket_number, row.reason]),
);
