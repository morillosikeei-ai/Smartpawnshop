import React, { useEffect, useMemo, useState } from 'react';
import { IonIcon, IonModal } from '@ionic/react';
import { chevronBackOutline, chevronForwardOutline, closeOutline, downloadOutline, personCircleOutline, searchOutline } from 'ionicons/icons';
import {
  getAuditLogs,
  getCustomers,
  getTransactions,
  type ApiAuditLog,
  type ApiCustomer,
  type ApiTransaction,
} from '../services/api';
import { moneyExact, shortDate, statusLabel } from '../data/pawnshopStore';
import { activityCsv, customersCsv, dateTime, forfeitDate, isOverdue, isPayment, itemName, overdueCsv, paymentsCsv } from './recordsExport';
import { Spinner } from '../components/Skeleton';
import TypeSelect from '../components/TypeSelect';
import ReportsTable from './ReportsTable';
import './ReportsTable.css';
import './AdminRecords.css';

/* ------------------------------------------------------------------ */
/* Generic table                                                       */
/* ------------------------------------------------------------------ */

type Column<T> = {
  label: string;
  /** CSS grid track for this column. */
  width: string;
  render: (row: T) => React.ReactNode;
  numeric?: boolean;
  /** Hidden below 760px so the table stays readable on a phone. */
  wide?: boolean;
  /** A control rather than a value: centred under its header. */
  action?: boolean;
};

const PAGE_SIZE = 10;

/**
 * Search, paging and CSV export around one list. Each Records tab passes its
 * own columns and rows, so every tab reads and behaves the same way.
 */
function DataTable<T>({
  rows, columns, rowKey, searchText, placeholder, loading, error, emptyText, onExport, toolbar, initialSearch = '',
}: {
  rows: T[];
  columns: Array<Column<T>>;
  rowKey: (row: T) => string | number;
  searchText: (row: T) => Array<string | null | undefined>;
  placeholder: string;
  loading: boolean;
  error: string;
  emptyText: string;
  onExport: (rows: T[]) => void;
  toolbar?: React.ReactNode;
  initialSearch?: string;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(row => searchText(row).some(value => value?.toLowerCase().includes(term)));
  }, [rows, search, searchText]);

  // A narrower filter can leave the current page past the end.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstShown = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const tracks = columns.map(column => column.width).join(' ');
  const narrowTracks = columns.filter(column => !column.wide).map(column => column.width).join(' ');
  const gridStyle = { '--rec-cols': tracks, '--rec-cols-narrow': narrowTracks } as React.CSSProperties;

  return (
    <div className="rec-wrap">
      <div className="rpt-toolbar">
        <label className="acct-search rpt-search">
          <IonIcon icon={searchOutline} aria-hidden="true" />
          <input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder={placeholder} aria-label={placeholder} />
        </label>
        <div className="rec-toolbar-actions">
          {toolbar}
          <button type="button" className="rec-export" onClick={() => onExport(filtered)} disabled={loading || filtered.length === 0}>
            <IonIcon icon={downloadOutline} aria-hidden="true" /> Export CSV
          </button>
        </div>
      </div>

      <div className="rec-table" role="table">
        <div className="rec-head" role="row" style={gridStyle}>
          {columns.map(column => (
            <span key={column.label} role="columnheader" className={`${column.numeric ? 'rpt-num' : ''} ${column.wide ? 'rec-wide' : ''} ${column.action ? 'rec-action' : ''}`}>{column.label}</span>
          ))}
        </div>

        {loading && <p className="admin-inline-message acct-empty rpt-loading"><Spinner /> Loading records...</p>}

        {!loading && pageRows.map(row => (
          <div className="rec-row" role="row" key={rowKey(row)} style={gridStyle}>
            {columns.map(column => (
              <span key={column.label} role="cell" className={`${column.numeric ? 'rpt-num' : ''} ${column.wide ? 'rec-wide' : ''} ${column.action ? 'rec-action' : ''}`}>{column.render(row)}</span>
            ))}
          </div>
        ))}

        {!loading && pageRows.length === 0 && (
          <p className="admin-inline-message acct-empty">{error || (rows.length === 0 ? emptyText : 'No records match that search.')}</p>
        )}
      </div>

      <div className="rpt-pagination">
        <span>{filtered.length === 0 ? 'No records' : `Showing ${firstShown}–${lastShown} of ${filtered.length}`}</span>
        <div className="rpt-pages">
          <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page"><IonIcon icon={chevronBackOutline} /></button>
          <span>Page {currentPage} of {pageCount}</span>
          <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount} aria-label="Next page"><IonIcon icon={chevronForwardOutline} /></button>
        </div>
      </div>
    </div>
  );
}

const Stacked: React.FC<{ title: React.ReactNode; sub?: React.ReactNode }> = ({ title, sub }) => (
  <span className="rpt-item"><strong>{title}</strong>{sub && <small>{sub}</small>}</span>
);

const Summary: React.FC<{ items: Array<{ label: string; value: string; tone?: string }> }> = ({ items }) => (
  <div className="rec-summary">
    {items.map(item => (
      <div key={item.label} className={`rec-summary-card ${item.tone || ''}`}>
        <span>{item.label}</span>
        <strong>{item.value}</strong>
      </div>
    ))}
  </div>
);

/* ------------------------------------------------------------------ */
/* Data hooks                                                          */
/* ------------------------------------------------------------------ */

function useLoad<T>(load: () => Promise<T[]>, failure: string) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    load()
      .then(setRows)
      .catch(requestError => setError(requestError instanceof Error ? requestError.message : failure))
      .finally(() => setLoading(false));
    // The loader is a module level function, so one request per mount is right.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { rows, loading, error };
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

const CustomersTab: React.FC = () => {
  const { rows, loading, error } = useLoad(getCustomers, 'Unable to load customers.');
  const [selected, setSelected] = useState<ApiCustomer | null>(null);

  const columns: Array<Column<ApiCustomer>> = [
    { label: 'Customer', width: 'minmax(0, 1.5fr)', render: row => <Stacked title={row.name} sub={row.user?.email ?? row.email} /> },
    { label: 'Contact', width: 'minmax(0, 1fr)', wide: true, render: row => row.contact_number || '-' },
    { label: 'Valid ID', width: 'minmax(0, 1.2fr)', wide: true, render: row => <Stacked title={row.valid_id_type || '-'} sub={row.valid_id_number} /> },
    { label: 'Active pawns', width: '96px', numeric: true, render: row => row.active_items_count ?? 0 },
    { label: 'Total pawns', width: '96px', numeric: true, wide: true, render: row => row.total_items_count ?? 0 },
    { label: 'Action', width: '72px', action: true, render: row => <button type="button" className="acct-action rpt-view" onClick={() => setSelected(row)}>View</button> },
  ];

  return (
    <>
      <Summary items={[
        { label: 'Registered customers', value: String(rows.length) },
        { label: 'With active pawns', value: String(rows.filter(row => (row.active_items_count ?? 0) > 0).length), tone: 'blue' },
      ]} />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={row => row.customers_id}
        searchText={row => [row.name, row.user?.email, row.contact_number, row.valid_id_number]}
        placeholder="Search name, email, contact or ID number"
        loading={loading}
        error={error}
        emptyText="No customers registered yet."
        onExport={customersCsv}
      />
      <IonModal isOpen={selected !== null} onDidDismiss={() => setSelected(null)} className="admin-user-modal">
        {selected && <CustomerDetail customer={selected} onClose={() => setSelected(null)} />}
      </IonModal>
    </>
  );
};

const Field: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div className="rpt-field"><span>{label}</span><strong>{value === undefined || value === null || value === '' ? '-' : value}</strong></div>
);

/** One customer's profile, ID and every pawn ticket on file. */
const CustomerDetail: React.FC<{ customer: ApiCustomer; onClose: () => void }> = ({ customer, onClose }) => {
  const tickets = [...(customer.transactions || [])].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="admin-user-modal-box rpt-detail">
      <div className="admin-user-modal-head">
        <span className="admin-modal-icon" aria-hidden="true"><IonIcon icon={personCircleOutline} /></span>
        <div>
          <small>CUSTOMER RECORD</small>
          <h3>{customer.name}</h3>
          <p className="admin-modal-sub">{customer.active_items_count ?? 0} active of {customer.total_items_count ?? 0} pawns</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close customer record"><IonIcon icon={closeOutline} /></button>
      </div>

      <div className="admin-modal-scroll">
        <section>
          <h4>Profile</h4>
          <div className="rpt-fields">
            <Field label="Email" value={customer.user?.email ?? customer.email} />
            <Field label="Contact" value={customer.contact_number} />
            <Field label="Address" value={customer.address} />
            <Field label="Valid ID type" value={customer.valid_id_type} />
            <Field label="Valid ID number" value={customer.valid_id_number} />
          </div>
          {customer.valid_id_photo && <img className="rec-id-photo" src={customer.valid_id_photo} alt={`${customer.name} valid ID`} />}
        </section>
        <section>
          <h4>Pawn history</h4>
          {tickets.length === 0 && <p className="admin-inline-message">No pawn tickets yet.</p>}
          <div className="rec-history">
            {tickets.map(ticket => (
              <div key={ticket.transactions_id} className="rec-history-row">
                <Stacked title={itemName(ticket)} sub={`${ticket.ticket_number} · ${shortDate(ticket.created_at)}`} />
                <span className="rpt-num">{moneyExact(Number(ticket.loan_amount))}</span>
                <em className={`rpt-status ${isOverdue(ticket) ? 'overdue' : ticket.status}`}>{isOverdue(ticket) ? 'Overdue' : statusLabel(ticket.status)}</em>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

/** Month key "2026-09" of an API timestamp, in local time. */
const monthKey = (value: string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const PaymentsTab: React.FC = () => {
  const { rows: all, loading, error } = useLoad(getTransactions, 'Unable to load payments.');
  const rows = useMemo(
    () => all.filter(isPayment).sort((a, b) => (b.redeemed_at || '').localeCompare(a.redeemed_at || '')),
    [all],
  );

  const thisMonth = monthKey(new Date().toISOString());
  const monthRows = rows.filter(row => monthKey(row.redeemed_at!) === thisMonth);
  const sum = (list: ApiTransaction[], pick: (row: ApiTransaction) => number) => list.reduce((total, row) => total + pick(row), 0);

  const columns: Array<Column<ApiTransaction>> = [
    { label: 'Date paid', width: '104px', render: row => <span className="rpt-date">{shortDate(row.redeemed_at)}</span> },
    { label: 'Ticket / Item', width: 'minmax(0, 1.5fr)', render: row => <Stacked title={itemName(row)} sub={row.ticket_number} /> },
    { label: 'Customer', width: 'minmax(0, 1fr)', wide: true, render: row => row.customer?.name || '-' },
    { label: 'Principal', width: 'minmax(0, .9fr)', numeric: true, wide: true, render: row => moneyExact(Number(row.loan_amount)) },
    { label: 'Interest', width: 'minmax(0, .8fr)', numeric: true, wide: true, render: row => moneyExact(Number(row.interest_due)) },
    { label: 'Total paid', width: 'minmax(0, .9fr)', numeric: true, render: row => <strong>{moneyExact(Number(row.total_payable))}</strong> },
  ];

  return (
    <>
      <Summary items={[
        { label: 'Payments recorded', value: String(rows.length) },
        { label: 'Total collected', value: moneyExact(sum(rows, row => Number(row.total_payable))), tone: 'green' },
        { label: 'Interest earned', value: moneyExact(sum(rows, row => Number(row.interest_due))), tone: 'gold' },
        { label: 'Collected this month', value: moneyExact(sum(monthRows, row => Number(row.total_payable))), tone: 'blue' },
      ]} />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={row => row.transactions_id}
        searchText={row => [row.ticket_number, row.customer?.name, row.item?.description]}
        placeholder="Search ticket, customer or item"
        loading={loading}
        error={error}
        emptyText="No redemption payments recorded yet."
        onExport={paymentsCsv}
      />
    </>
  );
};

type OverdueFilter = 'all' | 'overdue' | 'forfeited';

const OverdueTab: React.FC<{ initialSearch?: string }> = ({ initialSearch }) => {
  const { rows: all, loading, error } = useLoad(getTransactions, 'Unable to load pawns.');
  const [filter, setFilter] = useState<OverdueFilter>('all');

  const overdue = useMemo(() => all.filter(isOverdue).sort((a, b) => a.days_until_due - b.days_until_due), [all]);
  const forfeited = useMemo(() => all.filter(row => row.status === 'forfeited').sort((a, b) => b.due_date.localeCompare(a.due_date)), [all]);
  const rows = filter === 'overdue' ? overdue : filter === 'forfeited' ? forfeited : [...overdue, ...forfeited];

  const columns: Array<Column<ApiTransaction>> = [
    { label: 'Ticket / Item', width: 'minmax(0, 1.5fr)', render: row => <Stacked title={itemName(row)} sub={row.ticket_number} /> },
    { label: 'Customer', width: 'minmax(0, 1fr)', render: row => <Stacked title={row.customer?.name || '-'} sub={row.customer?.contact_number} /> },
    { label: 'Due date', width: '104px', wide: true, render: row => <span className="rpt-date">{shortDate(row.due_date)}</span> },
    {
      label: 'Days late', width: '120px', wide: true,
      render: row => isOverdue(row)
        ? <Stacked title={`${Math.abs(row.days_until_due)} days`} sub={`Forfeits ${shortDate(forfeitDate(row))}`} />
        : <Stacked title="Past grace" sub={`Forfeited ${shortDate(forfeitDate(row))}`} />,
    },
    { label: 'Pawn amount', width: 'minmax(0, .9fr)', numeric: true, wide: true, render: row => moneyExact(Number(row.loan_amount)) },
    { label: 'Amount due', width: 'minmax(0, .9fr)', numeric: true, render: row => isOverdue(row) ? moneyExact(Number(row.total_payable)) : '-' },
    { label: 'Status', width: '132px', render: row => <em className={`rpt-status ${isOverdue(row) ? 'overdue' : 'forfeited'}`}>{isOverdue(row) ? 'Overdue' : statusLabel(row.status)}</em> },
  ];

  const filters: Array<{ id: OverdueFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: overdue.length + forfeited.length },
    { id: 'overdue', label: 'Overdue', count: overdue.length },
    { id: 'forfeited', label: 'Expired/Unclaimed', count: forfeited.length },
  ];

  return (
    <>
      <Summary items={[
        { label: 'Overdue pawns', value: String(overdue.length), tone: 'gold' },
        { label: 'Overdue amount due', value: moneyExact(overdue.reduce((total, row) => total + Number(row.total_payable), 0)), tone: 'gold' },
        { label: 'Expired/Unclaimed', value: String(forfeited.length), tone: 'red' },
        { label: 'Principal in forfeited', value: moneyExact(forfeited.reduce((total, row) => total + Number(row.loan_amount), 0)), tone: 'red' },
      ]} />
      <DataTable
        key={filter}
        rows={rows}
        columns={columns}
        rowKey={row => row.transactions_id}
        searchText={row => [row.ticket_number, row.customer?.name, row.item?.description]}
        placeholder="Search ticket, customer or item"
        loading={loading}
        error={error}
        emptyText={filter === 'forfeited' ? 'No expired or unclaimed pawns.' : filter === 'overdue' ? 'No overdue pawns. Every active pawn is within its due date.' : 'No overdue or expired pawns.'}
        onExport={overdueCsv}
        initialSearch={initialSearch}
        toolbar={(
          <div className="acct-tabs rec-filter" role="tablist" aria-label="Overdue filter">
            {filters.map(entry => (
              <button key={entry.id} role="tab" aria-selected={filter === entry.id} className={filter === entry.id ? 'active' : ''} onClick={() => setFilter(entry.id)}>
                {entry.label} <b>{entry.count}</b>
              </button>
            ))}
          </div>
        )}
      />
    </>
  );
};

const StaffActivityTab: React.FC = () => {
  const { rows: all, loading, error } = useLoad(() => getAuditLogs(200), 'Unable to load activity.');
  const [actor, setActor] = useState('all');

  // Everyone who has a recorded action, so the filter never lists an empty name.
  const actors = useMemo(() => {
    const seen = new Map<number, string>();
    all.forEach(row => { if (row.user) seen.set(row.user.users_id, `${row.user.name} (${row.user.role})`); });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);

  const rows = actor === 'all' ? all : all.filter(row => String(row.user?.users_id) === actor);
  const today = new Date().toDateString();

  const columns: Array<Column<ApiAuditLog>> = [
    { label: 'Date and time', width: '176px', render: row => <span className="rpt-date">{dateTime(row.created_at)}</span> },
    { label: 'Staff', width: 'minmax(0, 1fr)', render: row => <Stacked title={row.user?.name || 'System'} sub={row.user?.role} /> },
    { label: 'Action', width: 'minmax(0, 1.6fr)', render: row => <Stacked title={row.action} sub={row.reason} /> },
    { label: 'Ticket', width: 'minmax(0, .9fr)', wide: true, render: row => row.ticket_number || '-' },
  ];

  return (
    <>
      <Summary items={[
        { label: 'Actions recorded', value: String(all.length) },
        { label: 'Actions today', value: String(all.filter(row => new Date(row.created_at).toDateString() === today).length), tone: 'blue' },
        { label: 'Active staff', value: String(actors.length), tone: 'green' },
      ]} />
      <DataTable
        key={actor}
        rows={rows}
        columns={columns}
        rowKey={row => row.audit_logs_id}
        searchText={row => [row.action, row.user?.name, row.ticket_number, row.reason]}
        placeholder="Search action, staff or ticket"
        loading={loading}
        error={error}
        emptyText="No recorded activity yet."
        onExport={activityCsv}
        toolbar={(
          <label className="rec-select">
            Staff
            <TypeSelect
              ariaLabel="Staff"
              value={actor}
              options={[{ value: 'all', label: 'All staff' }, ...actors.map(([id, name]) => ({ value: String(id), label: name }))]}
              onChange={setActor}
            />
          </label>
        )}
      />
      <small className="rec-note">Shows the latest 200 recorded actions.</small>
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Records page                                                        */
/* ------------------------------------------------------------------ */

export type RecordsTab = 'customers' | 'transactions' | 'payments' | 'overdue' | 'activity';

const RECORD_TABS: Array<{ id: RecordsTab; label: string }> = [
  { id: 'customers', label: 'Customer Records' },
  { id: 'transactions', label: 'Pawn Transactions' },
  { id: 'payments', label: 'Payments' },
  { id: 'overdue', label: 'Overdue & Forfeited' },
  { id: 'activity', label: 'Staff Activity' },
];

/**
 * Admin > Records. One tab per list the admin monitors, each read only, each
 * with search, paging and a CSV export of what is on screen.
 */
const AdminRecords: React.FC<{ initialTab?: RecordsTab; initialSearch?: string }> = ({ initialTab = 'customers', initialSearch = '' }) => {
  const [tab, setTab] = useState<RecordsTab>(initialTab);
  // The search a notification opened with applies to its own tab only.
  const searchFor = (target: RecordsTab) => (target === initialTab ? initialSearch : '');

  return (
    <section className="admin-content">
      <div className="admin-page-intro">
        <small>GENERATE RECORDS</small>
        <h2>View list of all Records</h2>
        <p>Customers, pawn tickets, payments, overdue items and staff activity, one list per tab.</p>
      </div>
      <div className="admin-tabs" role="tablist">
        {RECORD_TABS.map(entry => (
          <button key={entry.id} role="tab" aria-selected={tab === entry.id} className={tab === entry.id ? 'active' : ''} onClick={() => setTab(entry.id)}>
            {entry.label}
          </button>
        ))}
      </div>
      <div className="admin-panel">
        {tab === 'customers' && <CustomersTab />}
        {tab === 'transactions' && <ReportsTable initialSearch={searchFor('transactions')} />}
        {tab === 'payments' && <PaymentsTab />}
        {tab === 'overdue' && <OverdueTab initialSearch={searchFor('overdue')} />}
        {tab === 'activity' && <StaffActivityTab />}
      </div>
    </section>
  );
};

export default AdminRecords;
