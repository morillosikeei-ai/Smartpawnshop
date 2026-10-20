import React, { useEffect, useMemo, useState } from 'react';
import { IonIcon, IonModal } from '@ionic/react';
import { chevronBackOutline, chevronForwardOutline, closeOutline, documentTextOutline, searchOutline } from 'ionicons/icons';
import { getTransactions, type ApiTransaction } from '../services/api';
import { moneyExact, purityLabel, shortDate, statusLabel } from '../data/pawnshopStore';
import { Spinner } from '../components/Skeleton';
import './ReportsTable.css';

/** Rows shown per page. Small enough to read without scrolling the panel. */
const PAGE_SIZE = 10;

/** "brooch_pin" reads as "Brooch Pin"; a custom type is shown as typed. */
const categoryLabel = (transaction: ApiTransaction) => {
  const item = transaction.item;
  if (!item) return '-';
  if (item.category === 'others' && item.custom_item_type) return item.custom_item_type;
  return /^[a-z0-9_]+$/.test(item.category)
    ? item.category.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
    : item.category;
};

const weightLabel = (transaction: ApiTransaction) =>
  transaction.item?.weight_grams ? `${Number(transaction.item.weight_grams)} g` : '-';

/** The item's full value, gemstone included, falling back to the gold or staff value. */
const appraisedValue = (transaction: ApiTransaction) =>
  Number(transaction.item?.total_value ?? transaction.item?.appraised_value ?? 0);

/** The local calendar day of an API timestamp, as the date inputs write it. */
const dayKey = (value: string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/**
 * Reports > Table: every pawn record in one searchable, paged list.
 *
 * Read only. Search matches the ticket, item, category and customer; the date
 * range filters on the day the pawn was recorded.
 */
const ReportsTable: React.FC<{ initialSearch?: string }> = ({ initialSearch = '' }) => {
  const [records, setRecords] = useState<ApiTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(initialSearch);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ApiTransaction | null>(null);

  useEffect(() => {
    getTransactions()
      .then(rows => setRecords([...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))))
      .catch(loadError => setError(loadError instanceof Error ? loadError.message : 'Unable to load report records.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter(record => {
      const day = dayKey(record.created_at);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!term) return true;
      return [record.ticket_number, record.item?.description, categoryLabel(record), record.customer?.name, statusLabel(record.status)]
        .some(value => value?.toLowerCase().includes(term));
    });
  }, [records, search, from, to]);

  // A narrower filter can leave the current page past the end.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstShown = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const updateFilter = (setter: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setter(event.target.value);
    setPage(1);
  };

  const clearDates = () => {
    setFrom('');
    setTo('');
    setPage(1);
  };

  return (
    <div className="rpt-table-wrap">
      <div className="rpt-toolbar">
        <label className="acct-search rpt-search">
          <IonIcon icon={searchOutline} aria-hidden="true" />
          <input value={search} onChange={updateFilter(setSearch)} placeholder="Search ticket, item, category or customer" aria-label="Search report records" />
        </label>
        <div className="rpt-dates">
          <label>From<input type="date" value={from} max={to || undefined} onChange={updateFilter(setFrom)} /></label>
          <label>To<input type="date" value={to} min={from || undefined} onChange={updateFilter(setTo)} /></label>
          {(from || to) && <button type="button" className="rpt-clear" onClick={clearDates}>Clear</button>}
        </div>
      </div>

      <div className="rpt-table" role="table" aria-label="Report records">
        <div className="rpt-head" role="row">
          <span role="columnheader">Date</span>
          <span role="columnheader">Item</span>
          <span role="columnheader">Category</span>
          <span role="columnheader">Weight (g)</span>
          <span role="columnheader" className="rpt-num">Appraised Value</span>
          <span role="columnheader" className="rpt-num">Pawn Amount</span>
          <span role="columnheader">Status</span>
          <span role="columnheader" className="rpt-sr">Action</span>
        </div>

        {loading && <p className="admin-inline-message acct-empty rpt-loading"><Spinner /> Loading records...</p>}

        {!loading && pageRows.map(record => (
          <div className="rpt-row" role="row" key={record.transactions_id}>
            <span role="cell" className="rpt-date">{shortDate(record.created_at)}</span>
            <span role="cell" className="rpt-item">
              <strong>{record.item?.description || 'Item'}</strong>
              <small>{record.ticket_number}</small>
            </span>
            <span role="cell">{categoryLabel(record)}</span>
            <span role="cell">{weightLabel(record)}</span>
            <span role="cell" className="rpt-num">{moneyExact(appraisedValue(record))}</span>
            <span role="cell" className="rpt-num">{moneyExact(Number(record.loan_amount))}</span>
            <span role="cell"><em className={`rpt-status ${record.status}`}>{statusLabel(record.status)}</em></span>
            <span role="cell"><button type="button" className="acct-action rpt-view" onClick={() => setSelected(record)}>View</button></span>
          </div>
        ))}

        {!loading && pageRows.length === 0 && (
          <p className="admin-inline-message acct-empty">
            {error || (records.length === 0 ? 'No pawn records yet.' : 'No records match these filters.')}
          </p>
        )}
      </div>

      <div className="rpt-pagination">
        <span>{filtered.length === 0 ? 'No records' : `Showing ${firstShown}–${lastShown} of ${filtered.length}`}</span>
        <div className="rpt-pages">
          <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">
            <IonIcon icon={chevronBackOutline} />
          </button>
          <span>Page {currentPage} of {pageCount}</span>
          <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount} aria-label="Next page">
            <IonIcon icon={chevronForwardOutline} />
          </button>
        </div>
      </div>

      <IonModal isOpen={selected !== null} onDidDismiss={() => setSelected(null)} className="admin-user-modal">
        {selected && <RecordDetail record={selected} onClose={() => setSelected(null)} />}
      </IonModal>
    </div>
  );
};

const Field: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div className="rpt-field">
    <span>{label}</span>
    <strong>{value === undefined || value === null || value === '' ? '-' : value}</strong>
  </div>
);

/** The complete record behind one table row. */
const RecordDetail: React.FC<{ record: ApiTransaction; onClose: () => void }> = ({ record, onClose }) => {
  const item = record.item;
  // Metal, purity and weight describe jewelry only; other items have none.
  const isJewelry = item?.group === 'jewelry';
  const purity = purityLabel(item) ?? undefined;

  return (
    <div className="admin-user-modal-box rpt-detail">
      <div className="admin-user-modal-head">
        <span className="admin-modal-icon" aria-hidden="true"><IonIcon icon={documentTextOutline} /></span>
        <div>
          <small>PAWN RECORD</small>
          <h3>{record.ticket_number}</h3>
          <p className="admin-modal-sub">Recorded {shortDate(record.created_at)} &middot; <em className={`rpt-status ${record.status}`}>{statusLabel(record.status)}</em></p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close record"><IonIcon icon={closeOutline} /></button>
      </div>

      <div className="admin-modal-scroll">
        <section>
          <h4>Customer</h4>
          <div className="rpt-fields">
            <Field label="Name" value={record.customer?.name} />
            <Field label="Contact" value={record.customer?.contact_number} />
            <Field label="Email" value={record.customer?.email} />
          </div>
        </section>
        <section>
          <h4>Item</h4>
          <div className="rpt-fields">
            <Field label="Description" value={item?.description} />
            <Field label="Category" value={categoryLabel(record)} />
            <Field label="Brand / Model" value={item?.brand_model} />
            {isJewelry && <Field label="Metal" value={item?.metal_type === 'silver' ? 'Silver' : 'Gold'} />}
            {isJewelry && <Field label="Karat / Purity" value={purity} />}
            {isJewelry && <Field label="Weight (g)" value={weightLabel(record)} />}
            <Field label="Condition" value={item?.condition} />
            <Field label="Diamond" value={item?.has_gemstone ? [item.gemstone_details, item.gemstone_value ? moneyExact(Number(item.gemstone_value)) : null].filter(Boolean).join(' · ') || 'Yes' : 'None'} />
          </div>
        </section>
        <section>
          <h4>Pawn</h4>
          <div className="rpt-fields">
            <Field label="Appraised Value" value={moneyExact(appraisedValue(record))} />
            <Field label="Pawn Amount" value={moneyExact(Number(record.loan_amount))} />
            <Field label="Pawn-to-Value" value={`${Number(record.loan_to_value_percent)}%`} />
            <Field label="Interest Rate" value={`${(Number(record.interest_rate) * 100).toFixed(2)}% / month`} />
            <Field label="Due Date" value={shortDate(record.due_date)} />
            <Field label="Grace Period" value={`${record.grace_period_days} days`} />
            <Field label="Interest Due" value={moneyExact(Number(record.interest_due))} />
            <Field label="Total Payable" value={moneyExact(Number(record.total_payable))} />
            <Field label="Redeemed On" value={record.redeemed_at ? shortDate(record.redeemed_at) : undefined} />
          </div>
        </section>
      </div>
    </div>
  );
};

export default ReportsTable;
