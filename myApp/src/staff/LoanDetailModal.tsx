import React, { useEffect, useState } from 'react';
import { IonIcon, IonModal } from '@ionic/react';
import {
  alertCircleOutline,
  calendarOutline,
  cashOutline,
  closeOutline,
  cubeOutline,
  documentTextOutline,
  imageOutline,
  personOutline,
  refreshOutline,
  shieldCheckmarkOutline,
  trendingDownOutline,
  trendingUpOutline,
} from 'ionicons/icons';
import type { ApiCustomer, ApiItemDetail } from '../services/api';
import { FORFEITED_LABEL, money, moneyExact, shortDate, statusClass } from '../data/pawnshopStore';
import ModalSections from '../components/ModalSections';
import ItemValueChart from '../components/ItemValueChart';
import { deviceDetailRows } from './DeviceDetailsFields';
import './LoanDetailModal.css';

/** The loan row fields this modal reads. The row itself is built by the Loans screen. */
export type LoanDetailRow = {
  transactionId: number;
  ticketNumber: string;
  item: string;
  customer: string;
  specs: string;
  currentValue: number;
  loanAmount: number;
  interestDue: number;
  totalPayable: number;
  dueDate: string;
  daysUntilDue: number;
  risk: 'Low' | 'Medium' | 'High';
  status: 'Active' | 'Overdue' | 'Redeemed' | typeof FORFEITED_LABEL;
  valueHistory: Array<{ date: string; value: number }>;
};

type Props = {
  loan: LoanDetailRow | null;
  /** The item record behind the loan, with its customer and transactions. */
  item: ApiItemDetail | null;
  /** Used when the item record did not carry its customer. */
  customer: ApiCustomer | null;
  /** The item type as the Loans screen labels it. */
  itemTypeLabel: string;
  onClose: () => void;
};

const readable = (value?: string | null) =>
  (value || '').split('_').filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

const orDash = (value?: string | number | null) =>
  value === null || value === undefined || String(value).trim() === '' ? '-' : String(value);

const GROUP_LABELS: Record<string, string> = { jewelry: 'Jewelry', watch_phone: 'Watch / Cellphone', bulky: 'Bulky item' };

const RISK_HINTS: Record<LoanDetailRow['risk'], string> = {
  Low: 'Item value comfortably covers the pawn amount.',
  Medium: 'Item value is close to the pawn amount.',
  High: 'Item value has fallen below the pawn amount. Review today.',
};

/** Days until due, as a short phrase staff can read at a glance. */
const dueLabel = (days: number, status: LoanDetailRow['status']) => {
  if (status === 'Redeemed' || status === FORFEITED_LABEL) return 'Closed';
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  return `In ${days} day${days === 1 ? '' : 's'}`;
};

type Preview = { key: string; label: string; caption: string; src: string | null; icon: string };

/**
 * One uploaded image. A missing file, or one the browser cannot decode, shows
 * the same "No image available" tile, so a broken upload never renders as an
 * empty box.
 */
const PreviewTile: React.FC<{ preview: Preview; onOpen: (preview: Preview) => void }> = ({ preview, onOpen }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [preview.src]);
  const hasImage = Boolean(preview.src) && !failed;

  return (
    <figure className={`ldm-preview ${hasImage ? 'has-image' : 'is-empty'}`}>
      {hasImage ? (
        <button type="button" className="ldm-preview-frame" onClick={() => onOpen(preview)} aria-label={`Enlarge ${preview.label}`}>
          <img src={preview.src as string} alt={preview.label} loading="lazy" onError={() => setFailed(true)} />
        </button>
      ) : (
        <div className="ldm-preview-frame" role="img" aria-label={`${preview.label}: no image available`}>
          <IonIcon icon={preview.icon} />
          <span>No image available</span>
        </div>
      )}
      <figcaption>
        <strong>{preview.label}</strong>
        <small>{preview.caption}</small>
      </figcaption>
    </figure>
  );
};

const Field: React.FC<{ label: string; value: React.ReactNode; wide?: boolean }> = ({ label, value, wide }) => (
  <div className={`ldm-field${wide ? ' wide' : ''}`}>
    <dt>{label}</dt>
    <dd>{value}</dd>
  </div>
);

const Section: React.FC<{ title: string; icon: string; children: React.ReactNode }> = ({ title, icon, children }) => (
  <section className="ldm-section">
    <h4><IonIcon icon={icon} />{title}</h4>
    {children}
  </section>
);

/**
 * The View Item Detail modal on Staff Portal, Active Loans/Items.
 *
 * It only presents records the Loans screen already loaded: the loan row, the
 * item behind it, and that item's customer. Nothing here writes to the API.
 */
/** What each renewal outcome is called in the record. */
const RENEWAL_RESULT: Record<'pending' | 'confirmed' | 'rejected', string> = {
  pending: 'Waiting for staff',
  confirmed: 'Confirmed',
  rejected: 'Not confirmed',
};

const LoanDetailModal: React.FC<Props> = ({ loan, item, customer, itemTypeLabel, onClose }) => {
  const [enlarged, setEnlarged] = useState<Preview | null>(null);

  // A different loan starts with nothing enlarged.
  useEffect(() => setEnlarged(null), [loan?.transactionId]);

  const owner = item?.customer || customer;
  const transaction = item?.transactions?.find(entry => entry.transactions_id === loan?.transactionId) || null;
  const isJewelry = item?.group === 'jewelry';
  const history = loan?.valueHistory || [];
  const renewals = transaction?.renewal_requests || [];
  const coverage = loan && loan.loanAmount > 0 ? (loan.currentValue / loan.loanAmount) * 100 : null;

  // Every photo taken at intake gets a tile; an item without one still shows
  // a single "No image available" tile.
  const itemPhotos = item?.photo_urls?.length ? item.photo_urls : [null];
  const previews: Preview[] = [
    ...itemPhotos.map((src, index) => ({
      key: `item-${index}`,
      label: itemPhotos.length > 1 ? `Item photo ${index + 1}` : 'Item photo',
      caption: loan?.item || 'Pawned item',
      src,
      icon: imageOutline,
    })),
    {
      key: 'id',
      label: 'Valid ID',
      caption: [readable(owner?.valid_id_type) || owner?.valid_id_type, owner?.valid_id_number].filter(Boolean).join(' · ') || 'Customer identification',
      src: owner?.valid_id_photo || null,
      icon: documentTextOutline,
    },
  ];

  return (
    <IonModal isOpen={Boolean(loan)} onDidDismiss={onClose} className="ldm-modal">
      <div className="ldm-panel">
        <header className="ldm-header">
          <div className="ldm-heading">
            <small>Item detail · {loan?.ticketNumber}</small>
            <h3>{loan?.item}</h3>
            <div className="ldm-badges">
              {loan && <span className={`ldm-badge status-${statusClass(loan.status)}`}>{loan.status}</span>}
              {loan && <span className={`ldm-badge risk-${loan.risk.toLowerCase()}`}>{loan.risk} risk</span>}
            </div>
          </div>
          <button type="button" className="ldm-close" onClick={onClose} aria-label="Close item detail">
            <IonIcon icon={closeOutline} />
          </button>
        </header>

        <div className="ldm-body">
          {loan && (
            <>
              <div className="ldm-stats">
                <div className="ldm-stat">
                  <span>Current Value</span>
                  <strong>{money(loan.currentValue)}</strong>
                  <small>{coverage === null ? 'No pawn amount recorded' : `${coverage.toFixed(0)}% of the pawn amount`}</small>
                </div>
                <div className="ldm-stat">
                  <span>Pawn Amount</span>
                  <strong>{money(loan.loanAmount)}</strong>
                  <small>Total payable {moneyExact(loan.totalPayable)}</small>
                </div>
                <div className="ldm-stat">
                  <span>Status</span>
                  <strong><span className={`ldm-badge status-${statusClass(loan.status)}`}>{loan.status}</span></strong>
                  <small>Due {loan.dueDate} · {dueLabel(loan.daysUntilDue, loan.status)}</small>
                </div>
                <div className="ldm-stat">
                  <span>Risk Status</span>
                  <strong><span className={`ldm-badge risk-${loan.risk.toLowerCase()}`}>{loan.risk}</span></strong>
                  <small>{RISK_HINTS[loan.risk]}</small>
                </div>
              </div>

              {/* One section at a time, picked from the side menu, so the
                  record no longer stacks into one long scroll. */}
              <ModalSections
                label="Item detail sections"
                resetKey={loan.transactionId}
                sections={[
                  { id: 'pawn', label: 'Pawn', icon: cashOutline, content: (
                    <Section title="Pawn Information" icon={cashOutline}>
                      <dl className="ldm-fields three">
                        <Field label="Ticket number" value={loan.ticketNumber} />
                        <Field label="Date pawned" value={transaction ? shortDate(transaction.created_at) : '-'} />
                        <Field label="Due date" value={<>{loan.dueDate} <em className="ldm-muted">({dueLabel(loan.daysUntilDue, loan.status)})</em></>} />
                        <Field label="Interest (Renta)"value={transaction ? `${(Number(transaction.interest_rate) * 100).toFixed(2)}% monthly` : '-'} />
                        <Field label="Pawn-to-value" value={transaction ? `${Number(transaction.loan_to_value_percent).toFixed(0)}%` : '-'} />
                        <Field label="Extension Period"value={transaction ? `${transaction.grace_period_days} days` : '-'} />
                        <Field label="Principal" value={moneyExact(loan.loanAmount)} />
                        <Field label="Interest due" value={moneyExact(loan.interestDue)} />
                        <Field label="Total payable" value={<strong>{moneyExact(loan.totalPayable)}</strong>} />
                      </dl>
                    </Section>
                  ) },
                  { id: 'item', label: 'Item', icon: cubeOutline, content: (
                    <Section title="Item Information" icon={cubeOutline}>
                      <dl className="ldm-fields">
                        <Field label="Description" value={loan.item} wide />
                        <Field label="Item type" value={orDash(itemTypeLabel)} />
                        <Field label="Category" value={orDash(GROUP_LABELS[item?.group || ''] || readable(item?.group))} />
                        <Field label={isJewelry ? 'Karat / Weight (g)' : 'Brand / Model'} value={orDash(loan.specs)} />
                        <Field label="Condition" value={orDash(readable(item?.condition) || item?.condition)} />
                        <Field label="Appraised value" value={item ? money(Number(item.appraised_value)) : '-'} />
                        {item?.adjusted_value != null && <Field label="Adjusted value" value={money(Number(item.adjusted_value))} />}
                        {item?.has_gemstone && <Field label="Diamond" value={`${money(Number(item.gemstone_value || 0))}${item.gemstone_details ? ` · ${item.gemstone_details}` : ''}`} wide />}
                        {/* A watch or cellphone's IMEI, movement, papers and the like. */}
                        {deviceDetailRows(item?.item_details).map(([label, value]) => <Field key={label} label={label} value={value} />)}
                        {item?.adjustment_reason && <Field label="Adjustment note" value={item.adjustment_reason} wide />}
                      </dl>
                    </Section>
                  ) },
                  { id: 'customer', label: 'Customer', icon: personOutline, content: (
                    <Section title="Customer Information" icon={personOutline}>
                      <dl className="ldm-fields">
                        <Field label="Name" value={orDash(owner?.name || loan.customer)} wide />
                        <Field label="Contact number" value={orDash(owner?.contact_number)} />
                        <Field label="Email" value={orDash(owner?.email || owner?.user?.email)} />
                        <Field label="Address" value={orDash(owner?.address)} wide />
                        <Field label="Valid ID type" value={orDash(readable(owner?.valid_id_type) || owner?.valid_id_type)} />
                        <Field label="Valid ID number" value={orDash(owner?.valid_id_number)} />
                      </dl>
                    </Section>
                  ) },
                  { id: 'photos', label: 'Photos & ID', icon: imageOutline, count: previews.filter(preview => preview.src).length, content: (
                    <Section title="Photos & Documents" icon={imageOutline}>
                      <div className="ldm-previews">
                        {previews.map(preview => <PreviewTile key={preview.key} preview={preview} onOpen={setEnlarged} />)}
                      </div>
                    </Section>
                  ) },
                  { id: 'renewals', label: 'Renewals', icon: refreshOutline, count: renewals.length, content: (
                    <Section title="Renewal History" icon={refreshOutline}>
                      {/* A renewal is renta paid to move the due date, so it never
                          shows up in the redemption record. This is the only place
                          the pawn's renewals are accounted for. */}
                      <div className="ldm-table ldm-renewals" role="table" aria-label="Renewal history">
                        <div className="ldm-table-row ldm-table-head" role="row">
                          <span role="columnheader">Submitted</span>
                          <span role="columnheader">GCash Ref.</span>
                          <span role="columnheader">Amount</span>
                          <span role="columnheader">Result</span>
                        </div>
                        {renewals.map(renewal => (
                          <div className="ldm-table-row" role="row" key={renewal.renewal_requests_id}>
                            <span role="cell" data-label="Submitted">{renewal.submitted_at ? shortDate(renewal.submitted_at) : '-'}</span>
                            <span role="cell" data-label="GCash Ref.">
                              {renewal.gcash_reference_number}
                              {renewal.receipt_url && <a className="ldm-receipt" href={renewal.receipt_url} target="_blank" rel="noreferrer">View receipt</a>}
                            </span>
                            <span role="cell" data-label="Amount">{moneyExact(renewal.amount)}</span>
                            <span role="cell" data-label="Result">
                              <em className={`ldm-renewal-status is-${renewal.status}`}>{RENEWAL_RESULT[renewal.status]}</em>
                              {renewal.reviewed_at && <small className="ldm-muted"> {shortDate(renewal.reviewed_at)}</small>}
                              {renewal.review_note && <small className="ldm-muted"> · {renewal.review_note}</small>}
                            </span>
                          </div>
                        ))}
                        {renewals.length === 0 && (
                          <div className="ldm-empty">
                            <IonIcon icon={refreshOutline} />
                            <div>
                              <strong>No renewals on this pawn</strong>
                              <p>The customer has not paid a renta to extend the due date.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </Section>
                  ) },
                  { id: 'value', label: 'Value History', icon: calendarOutline, content: (
                    <Section title="Value History" icon={calendarOutline}>
                      {/* Jewelry is revalued daily against the gold price, so only
                          jewelry has a recorded value history to chart. */}
                      {history.length > 1 && <ItemValueChart points={history} loanAmount={loan.loanAmount} />}

                      <div className="ldm-table" role="table" aria-label="Value history">
                        <div className="ldm-table-row ldm-table-head" role="row">
                          <span role="columnheader">Date</span>
                          <span role="columnheader">Event</span>
                          <span role="columnheader">Value</span>
                        </div>
                        {history.map((row, index) => {
                          const previous = index > 0 ? history[index - 1].value : null;
                          const change = previous === null ? 0 : row.value - previous;
                          return (
                            <div className="ldm-table-row" role="row" key={row.date}>
                              <span role="cell" data-label="Date">{row.date}</span>
                              <span role="cell" data-label="Event">Daily gold price revaluation</span>
                              <span role="cell" data-label="Value" className="ldm-value">
                                {money(row.value)}
                                {change !== 0 && (
                                  <em className={change > 0 ? 'up' : 'down'}>
                                    <IonIcon icon={change > 0 ? trendingUpOutline : trendingDownOutline} />
                                    {money(Math.abs(change))}
                                  </em>
                                )}
                              </span>
                            </div>
                          );
                        })}
                        {history.length === 0 && (
                          <div className="ldm-empty">
                            <IonIcon icon={alertCircleOutline} />
                            <div>
                              <strong>No recorded value history</strong>
                              <p>This item is not revalued from the gold price.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </Section>
                  ) },
                ]}
              />

              <p className="ldm-footnote"><IonIcon icon={shieldCheckmarkOutline} />Read-only view. Values come from the shop's latest records.</p>
            </>
          )}
        </div>

        {enlarged?.src && (
          <div className="ldm-lightbox" role="dialog" aria-label={enlarged.label} onClick={() => setEnlarged(null)}>
            <img src={enlarged.src} alt={enlarged.label} onClick={event => event.stopPropagation()} />
            <button type="button" className="ldm-close" onClick={() => setEnlarged(null)} aria-label="Close preview">
              <IonIcon icon={closeOutline} />
            </button>
          </div>
        )}
      </div>
    </IonModal>
  );
};

export default LoanDetailModal;
