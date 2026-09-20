import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IonIcon, IonModal } from '@ionic/react';
import {
  alertCircleOutline,
  arrowUpCircleOutline,
  calendarOutline,
  cashOutline,
  closeOutline,
  informationCircleOutline,
  cubeOutline,
  flashOutline,
  personOutline,
  pricetagOutline,
  refreshOutline,
  shieldCheckmarkOutline,
  speedometerOutline,
  timeOutline,
  warningOutline,
} from 'ionicons/icons';
import { money, shortDate, timeAgo } from '../data/pawnshopStore';
import { getRiskAlerts, type ApiRiskAlert } from '../services/api';
import { SkeletonList } from '../components/Skeleton';
import Pager, { usePagedRows } from '../components/Pager';
import TypeSelect from '../components/TypeSelect';
import './RiskManagement.css';

const AUTO_ESCALATION_OPTIONS = [
  { value: 'Enabled', label: 'Enabled' },
  { value: 'Disabled', label: 'Disabled' },
];

/** The three risk levels the API records, worst first. */
type RiskLevel = 'high' | 'medium' | 'low';

/** Where a case stands: still open, escalated by policy, or closed. */
type CaseStatus = 'escalated' | 'open' | 'resolved';

/**
 * Days an open case may sit before the policy escalates it.
 *
 * This mirrors the review window on the settings form below. Both are a shop
 * policy rather than a model output, so the number lives in one place here.
 */
const REVIEW_WINDOW_DAYS = 14;

const DAY_MS = 86400000;

/** One risk alert, flattened into what every panel on this tab displays. */
type RiskCase = {
  id: number;
  reference: string;
  customer: string;
  item: string;
  category: string;
  level: RiskLevel;
  status: CaseStatus;
  currentValue: number;
  loanAmount: number;
  /** Current value as a percentage of the loan. Under 100 means the loan is uncovered. */
  coverage: number;
  triggeredAt: string;
  /** Whole days the case has been open, used for the escalation rule. */
  ageInDays: number;
};

const LEVEL_LABEL: Record<RiskLevel, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const STATUS_LABEL: Record<CaseStatus, string> = { escalated: 'Escalated', open: 'Open', resolved: 'Resolved' };

/** Sort key so the worst cases lead every list. */
const LEVEL_ORDER: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };

/** Flattens one API alert into the row shape the panels share. */
const toRiskCase = (alert: ApiRiskAlert): RiskCase => {
  const currentValue = Number(alert.current_value) || 0;
  const loanAmount = Number(alert.loan_amount) || 0;
  const level = (alert.risk_level || 'low') as RiskLevel;
  const triggered = new Date(alert.triggered_at).getTime();
  const ageInDays = Number.isFinite(triggered) ? Math.max(0, Math.floor((Date.now() - triggered) / DAY_MS)) : 0;

  return {
    id: alert.risk_alerts_id,
    reference: `RA-${String(alert.risk_alerts_id).padStart(4, '0')}`,
    customer: alert.item?.customer?.name || 'Unknown customer',
    item: alert.item?.description || `Item #${alert.item_id}`,
    // An item recorded under "Others" carries the exact type the staff typed
    // in, so the case shows that instead of the uninformative word "Others".
    category:
        (alert.item?.category === 'others' && alert.item?.custom_item_type?.trim())
            ? alert.item.custom_item_type.trim()
            : alert.item?.category || alert.item?.group || 'Uncategorised',
    level,
    // A case that has outlived the review window has been escalated by policy,
    // so it is called that rather than being left to look like a fresh alert.
    status: alert.resolved ? 'resolved' : level === 'high' && ageInDays >= REVIEW_WINDOW_DAYS ? 'escalated' : 'open',
    currentValue,
    loanAmount,
    coverage: loanAmount > 0 ? (currentValue / loanAmount) * 100 : 0,
    triggeredAt: alert.triggered_at,
    ageInDays,
  };
};

/* -------------------------------------------------------------------------- */
/* Reusable pieces                                                            */
/* -------------------------------------------------------------------------- */

/** Coloured pill for a risk level: red for high, amber for medium, green for low. */
export const RiskBadge: React.FC<{ level: RiskLevel; dot?: boolean }> = ({ level, dot = false }) => (
  <span className={`risk-badge is-${level}`}>
    {dot && <i className="risk-badge-dot" aria-hidden="true" />}
    {LEVEL_LABEL[level]}
  </span>
);

/** Coloured pill for where a case stands. */
export const CaseStatusBadge: React.FC<{ status: CaseStatus }> = ({ status }) => (
  <span className={`risk-status is-${status}`}>{STATUS_LABEL[status]}</span>
);

/** One summary card: icon, count, label, and a one-line note under it. */
export const RiskSummaryCard: React.FC<{ icon: string; tone: RiskLevel | 'escalated'; value: number; label: string; note: string }> = ({
  icon,
  tone,
  value,
  label,
  note,
}) => (
  <div className={`risk-summary is-${tone}`}>
    <span className="risk-summary-icon" aria-hidden="true"><IonIcon icon={icon} /></span>
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{note}</small>
    </div>
  </div>
);

/** One live alert card: the collateral, the shortfall, and how old the alert is. */
export const RiskAlertCard: React.FC<{ entry: RiskCase; onReview: (entry: RiskCase) => void }> = ({ entry, onReview }) => (
  <article className={`risk-alert is-${entry.level}`}>
    <header>
      <div>
        <strong>{entry.item}</strong>
        <small><IonIcon icon={personOutline} aria-hidden="true" />{entry.customer}</small>
      </div>
      <RiskBadge level={entry.level} dot />
    </header>

    <dl className="risk-alert-figures">
      <div>
        <dt>Current value</dt>
        <dd>{money(entry.currentValue)}</dd>
      </div>
      <div>
        <dt>Pawn amount</dt>
        <dd>{money(entry.loanAmount)}</dd>
      </div>
      <div>
        <dt>Coverage</dt>
        <dd className={entry.coverage < 100 ? 'is-short' : ''}>{entry.coverage.toFixed(0)}%</dd>
      </div>
    </dl>

    <div className="risk-alert-meter" aria-hidden="true">
      <b style={{ width: `${Math.min(100, Math.max(2, entry.coverage))}%` }} />
    </div>

    <footer>
      <span><IonIcon icon={timeOutline} aria-hidden="true" />{timeAgo(entry.triggeredAt)}</span>
      <button type="button" onClick={() => onReview(entry)}>Review case</button>
    </footer>
  </article>
);

/* -------------------------------------------------------------------------- */
/* Section                                                                    */
/* -------------------------------------------------------------------------- */

type RiskManagementProps = {
  /** True once the policy form has been saved, so the confirmation can show. */
  policySaved: boolean;
  onSavePolicy: () => void;
  onPolicyEdited: () => void;
};

/**
 * The Risk Management tab: live collateral alerts from /risk-alerts, the case
 * log behind them, and the shop's risk policy form.
 *
 * Every figure on this tab is derived from the alerts the API returns. Nothing
 * is invented on the client, so a quiet day reads as a quiet day.
 */
const RiskManagement: React.FC<RiskManagementProps> = ({ policySaved, onSavePolicy, onPolicyEdited }) => {
  const [autoEscalation, setAutoEscalation] = useState('Enabled');
  const [cases, setCases] = useState<RiskCase[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [openCase, setOpenCase] = useState<RiskCase | null>(null);

  const load = useCallback(() => {
    setRefreshing(true);
    setError('');
    return getRiskAlerts()
      .then((alerts) => setCases(alerts.map(toRiskCase)))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load risk alerts.'))
      .finally(() => {
        setLoaded(true);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { openCases, counts, recentCases } = useMemo(() => {
    const unresolved = cases.filter((entry) => entry.status !== 'resolved');

    return {
      // Worst first, then newest, so the top of the list is what to act on.
      openCases: [...unresolved].sort(
        (left, right) =>
          LEVEL_ORDER[left.level] - LEVEL_ORDER[right.level] ||
          new Date(right.triggeredAt).getTime() - new Date(left.triggeredAt).getTime()
      ),
      counts: {
        high: unresolved.filter((entry) => entry.level === 'high').length,
        medium: unresolved.filter((entry) => entry.level === 'medium').length,
        escalated: unresolved.filter((entry) => entry.status === 'escalated').length,
      },
      recentCases: [...cases].sort(
        (left, right) => new Date(right.triggeredAt).getTime() - new Date(left.triggeredAt).getTime()
      ),
    };
  }, [cases]);

  // The alert grid and the case log are read independently, so each keeps its
  // own page.
  const openPage = usePagedRows(openCases, 6);
  const recentPage = usePagedRows(recentCases);

  return (
    <div className="risk-management">
      <div className="risk-summary-grid">
        <RiskSummaryCard
          icon={warningOutline}
          tone="high"
          value={counts.high}
          label="High risk cases"
          note="Collateral well below the pawn amount"
        />
        <RiskSummaryCard
          icon={alertCircleOutline}
          tone="medium"
          value={counts.medium}
          label="Medium risk cases"
          note="Watch list, no action due yet"
        />
        <RiskSummaryCard
          icon={arrowUpCircleOutline}
          tone="escalated"
          value={counts.escalated}
          label="Auto-escalated cases"
          note={`Open past the ${REVIEW_WINDOW_DAYS} day review window`}
        />
      </div>

      <div className="mini-panel risk-alerts-panel">
        <div className="section-heading">
          <div>
            <small>COLLATERAL WATCH</small>
            <h3>Live risk alerts</h3>
          </div>
          <button type="button" className="risk-refresh" onClick={load} disabled={refreshing} aria-busy={refreshing}>
            <IonIcon icon={refreshOutline} aria-hidden="true" />
            {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </div>

        {error && <p className="admin-form-error">{error}</p>}
        {!loaded && <SkeletonList rows={3} />}

        {loaded && openCases.length > 0 && (
          <>
            <div className="risk-alert-grid">
              {openPage.pageRows.map((entry) => (
                <RiskAlertCard key={entry.id} entry={entry} onReview={setOpenCase} />
              ))}
            </div>
            <Pager pager={openPage.pager} label="alerts" />
          </>
        )}

        {loaded && openCases.length === 0 && !error && (
          <p className="risk-clear">
            <IonIcon icon={shieldCheckmarkOutline} aria-hidden="true" />
            No unresolved risk alerts. All collateral is covering its loan.
          </p>
        )}
      </div>

      <div className="mini-panel risk-cases-panel">
        <div className="section-heading">
          <div>
            <small>CASE LOG</small>
            <h3>Recent risk cases</h3>
          </div>
          <span className="risk-count">{recentCases.length} recorded</span>
        </div>

        {!loaded && <SkeletonList rows={4} />}

        {loaded && recentCases.length > 0 && (
          <div className="risk-table-scroll">
            <table className="risk-table">
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Customer / Item</th>
                  <th scope="col">Risk level</th>
                  <th scope="col">Date</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentPage.pageRows.map((entry) => (
                  <tr key={entry.id}>
                    <td><CaseStatusBadge status={entry.status} /></td>
                    <td>
                      <strong>{entry.customer}</strong>
                      <small>{entry.item} &middot; {entry.reference}</small>
                    </td>
                    <td><RiskBadge level={entry.level} /></td>
                    <td>{shortDate(entry.triggeredAt)}</td>
                    <td>
                      <button type="button" className="risk-row-action" onClick={() => setOpenCase(entry)}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {loaded && recentCases.length > 0 && <Pager pager={recentPage.pager} label="cases" />}

        {loaded && recentCases.length === 0 && <p className="risk-clear">No risk cases recorded yet.</p>}
      </div>

      <div className="mini-panel risk-policy-panel">
        <div className="section-heading">
          <div>
            <small>POLICY</small>
            <h3>Risk management settings</h3>
          </div>
          <button type="button" className="admin-primary-button risk-save" onClick={onSavePolicy}>
            Save policy
          </button>
        </div>

        <div className="risk-policy-grid">
          <label className="risk-policy-field">
            <span className="risk-policy-icon" aria-hidden="true"><IonIcon icon={cashOutline} /></span>
            <span className="risk-policy-copy">
              <b>High-risk threshold</b>
              <small>Pawns above this figure are watched closely.</small>
            </span>
            <input defaultValue="₱75,000" onChange={onPolicyEdited} />
          </label>

          <label className="risk-policy-field">
            <span className="risk-policy-icon" aria-hidden="true"><IonIcon icon={speedometerOutline} /></span>
            <span className="risk-policy-copy">
              <b>Medium-risk threshold</b>
              <small>Where the watch list starts.</small>
            </span>
            <input defaultValue="₱30,000" onChange={onPolicyEdited} />
          </label>

          <label className="risk-policy-field">
            <span className="risk-policy-icon" aria-hidden="true"><IonIcon icon={calendarOutline} /></span>
            <span className="risk-policy-copy">
              <b>Review window</b>
              <small>How long a case may sit before escalation.</small>
            </span>
            <input defaultValue={`${REVIEW_WINDOW_DAYS} days`} onChange={onPolicyEdited} />
          </label>

          <label className="risk-policy-field">
            <span className="risk-policy-icon" aria-hidden="true"><IonIcon icon={flashOutline} /></span>
            <span className="risk-policy-copy">
              <b>Auto-escalation</b>
              <small>Raise overdue high-risk cases on their own.</small>
            </span>
            <TypeSelect
              ariaLabel="Auto-escalation"
              value={autoEscalation}
              options={AUTO_ESCALATION_OPTIONS}
              onChange={(value) => { setAutoEscalation(value); onPolicyEdited(); }}
            />
          </label>
        </div>

        {policySaved && <small className="policy-saved">Risk management policy saved successfully.</small>}
      </div>

      <IonModal isOpen={openCase !== null} onDidDismiss={() => setOpenCase(null)} className="admin-user-modal">
        <div className="admin-user-modal-box risk-case-modal">
          <div className="admin-user-modal-head">
            <span className="admin-modal-icon" aria-hidden="true"><IonIcon icon={shieldCheckmarkOutline} /></span>
            <div>
              <small>RISK CASE</small>
              <h3>{openCase?.reference}</h3>
              <p className="admin-modal-sub">{openCase?.customer} &middot; {openCase?.item}</p>
            </div>
            <button type="button" onClick={() => setOpenCase(null)} aria-label="Close risk case dialog">
              <IonIcon icon={closeOutline} />
            </button>
          </div>

          {openCase && (
            <div className="admin-modal-scroll">
              <div className="risk-case-tags">
                <RiskBadge level={openCase.level} dot />
                <CaseStatusBadge status={openCase.status} />
              </div>

              <dl className="risk-case-details">
                <div>
                  <dt><IonIcon icon={personOutline} aria-hidden="true" />Customer</dt>
                  <dd>{openCase.customer}</dd>
                </div>
                <div>
                  <dt><IonIcon icon={cubeOutline} aria-hidden="true" />Item</dt>
                  <dd>{openCase.item}</dd>
                </div>
                <div>
                  <dt><IonIcon icon={pricetagOutline} aria-hidden="true" />Category</dt>
                  <dd>{openCase.category}</dd>
                </div>
                <div>
                  <dt><IonIcon icon={cashOutline} aria-hidden="true" />Pawn amount</dt>
                  <dd>{money(openCase.loanAmount)}</dd>
                </div>
                <div>
                  <dt><IonIcon icon={speedometerOutline} aria-hidden="true" />Current value</dt>
                  <dd>{money(openCase.currentValue)}</dd>
                </div>
                <div>
                  <dt><IonIcon icon={shieldCheckmarkOutline} aria-hidden="true" />Coverage</dt>
                  <dd className={openCase.coverage < 100 ? 'is-short' : ''}>{openCase.coverage.toFixed(0)}%</dd>
                </div>
                <div>
                  <dt><IonIcon icon={calendarOutline} aria-hidden="true" />Triggered</dt>
                  <dd>{shortDate(openCase.triggeredAt)} &middot; {timeAgo(openCase.triggeredAt)}</dd>
                </div>
                <div>
                  <dt><IonIcon icon={timeOutline} aria-hidden="true" />Open for</dt>
                  <dd>{openCase.ageInDays} {openCase.ageInDays === 1 ? 'day' : 'days'}</dd>
                </div>
              </dl>

              <p className={`risk-case-note ${openCase.status === 'resolved' ? 'is-resolved' : openCase.coverage < 100 ? 'is-short' : 'is-watch'}`}>
                <IonIcon icon={informationCircleOutline} aria-hidden="true" />
                <span>
                  {openCase.status === 'resolved'
                    ? 'This case is closed. The collateral recovered above the threshold on a later valuation.'
                    : openCase.coverage < 100
                      ? 'The collateral no longer covers the pawn amount. Review the appraisal with the customer before the due date.'
                      : 'The collateral still covers the pawn amount. Keep the case on the watch list until the next valuation.'}
                </span>
              </p>
            </div>
          )}

          <div className="admin-user-modal-actions">
            <button type="button" className="admin-secondary-button" onClick={() => setOpenCase(null)}>Close</button>
          </div>
        </div>
      </IonModal>
    </div>
  );
};

export default RiskManagement;
