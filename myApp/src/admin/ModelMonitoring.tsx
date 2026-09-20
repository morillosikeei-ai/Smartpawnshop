import React, { useMemo, useState } from 'react';
import { IonIcon } from '@ionic/react';
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  cloudDoneOutline,
  closeCircleOutline,
  flashOutline,
  informationCircleOutline,
  layersOutline,
  refreshOutline,
  serverOutline,
  speedometerOutline,
  timeOutline,
  trendingDownOutline,
} from 'ionicons/icons';
import ModelPerformanceChart, { type ModelPerformancePoint } from '../components/ModelPerformanceChart';
import './ModelMonitoring.css';

/* -------------------------------------------------------------------------- */
/* Reusable pieces                                                            */
/* -------------------------------------------------------------------------- */

/** The three states every badge in this section uses, healthiest first. */
export type StatusTone = 'success' | 'review' | 'failed';

/** Small coloured pill. One tone per state, used by the health rows and the table. */
export const StatusBadge: React.FC<{ tone: StatusTone; label: string; dot?: boolean }> = ({ tone, label, dot = false }) => (
  <span className={`model-badge is-${tone}`}>
    {dot && <i className="model-badge-dot" aria-hidden="true" />}
    {label}
  </span>
);

/** One statistic tile: icon, figure, label, and an optional footnote. */
export const StatTile: React.FC<{ icon: string; tone: 'primary' | 'success' | 'warning' | 'neutral'; value: string; label: string; note?: string }> = ({
  icon,
  tone,
  value,
  label,
  note,
}) => (
  <div className={`model-tile is-${tone}`}>
    <span className="model-tile-icon" aria-hidden="true"><IonIcon icon={icon} /></span>
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
      {note && <small>{note}</small>}
    </div>
  </div>
);

/** One line in the model health card: what is being checked and how it reads. */
export const HealthRow: React.FC<{ icon: string; label: string; tone: StatusTone; value: string }> = ({ icon, label, tone, value }) => (
  <li className="model-health-row">
    <span className="model-health-icon" aria-hidden="true"><IonIcon icon={icon} /></span>
    <span className="model-health-label">{label}</span>
    <StatusBadge tone={tone} label={value} dot />
  </li>
);

/* -------------------------------------------------------------------------- */
/* Sample data                                                                */
/* -------------------------------------------------------------------------- */

/** The ranges the performance chart can be filtered to. */
type RangeId = '24h' | '7d' | '30d' | '90d';

const RANGES: Array<{ id: RangeId; label: string; caption: string }> = [
  { id: '24h', label: '24H', caption: 'the last 24 hours' },
  { id: '7d', label: '7 Days', caption: 'the last 7 days' },
  { id: '30d', label: '30 Days', caption: 'the last 30 days' },
  { id: '90d', label: '90 Days', caption: 'the last 90 days' },
];

/**
 * Sample accuracy readings per range.
 *
 * These are placeholders until the model logs its own scored predictions. They
 * are kept in the shape the chart already takes, so swapping in an API series
 * later is a change of source and nothing else.
 */
const ACCURACY_SERIES: Record<RangeId, ModelPerformancePoint[]> = {
  '24h': [
    { label: '3 PM', value: 96.4, caption: 'Yesterday, 3:00 PM' },
    { label: '6 PM', value: 96.9, caption: 'Yesterday, 6:00 PM' },
    { label: '9 PM', value: 97.3, caption: 'Yesterday, 9:00 PM' },
    { label: '12 AM', value: 97.1, caption: 'Today, 12:00 AM' },
    { label: '3 AM', value: 96.6, caption: 'Today, 3:00 AM' },
    { label: '6 AM', value: 97.4, caption: 'Today, 6:00 AM' },
    { label: '9 AM', value: 98.0, caption: 'Today, 9:00 AM' },
    { label: '12 PM', value: 97.6, caption: 'Today, 12:00 PM' },
    { label: '3 PM', value: 97.9, caption: 'Today, 3:00 PM' },
  ],
  '7d': [
    { label: 'Sep 3', value: 95.8, caption: 'September 3' },
    { label: 'Sep 4', value: 96.5, caption: 'September 4' },
    { label: 'Sep 5', value: 96.1, caption: 'September 5' },
    { label: 'Sep 6', value: 97.2, caption: 'September 6' },
    { label: 'Sep 7', value: 97.6, caption: 'September 7' },
    { label: 'Sep 8', value: 97.4, caption: 'September 8' },
    { label: 'Sep 9', value: 97.9, caption: 'September 9' },
  ],
  '30d': [
    { label: 'Aug 11', value: 93.9, caption: 'August 11' },
    { label: 'Aug 14', value: 94.6, caption: 'August 14' },
    { label: 'Aug 17', value: 94.2, caption: 'August 17' },
    { label: 'Aug 20', value: 95.4, caption: 'August 20' },
    { label: 'Aug 23', value: 95.9, caption: 'August 23' },
    { label: 'Aug 26', value: 95.5, caption: 'August 26' },
    { label: 'Aug 29', value: 96.4, caption: 'August 29' },
    { label: 'Sep 1', value: 96.8, caption: 'September 1' },
    { label: 'Sep 4', value: 96.5, caption: 'September 4' },
    { label: 'Sep 9', value: 97.9, caption: 'September 9' },
  ],
  '90d': [
    { label: 'Jun 12', value: 90.6, caption: 'June 12' },
    { label: 'Jun 26', value: 91.8, caption: 'June 26' },
    { label: 'Jul 10', value: 91.2, caption: 'July 10' },
    { label: 'Jul 24', value: 92.7, caption: 'July 24' },
    { label: 'Aug 7', value: 93.8, caption: 'August 7' },
    { label: 'Aug 21', value: 95.6, caption: 'August 21' },
    { label: 'Sep 4', value: 96.5, caption: 'September 4' },
    { label: 'Sep 9', value: 97.9, caption: 'September 9' },
  ],
};

/** Sample prediction log rows, newest first. */
const RECENT_PREDICTIONS: Array<{
  id: string;
  timestamp: string;
  goldPrice: string;
  prediction: 'Increase' | 'Stable' | 'Decrease';
  confidence: number;
  status: StatusTone;
  statusLabel: string;
}> = [
  { id: 'p-1', timestamp: 'Sep 9, 2:30 PM', goldPrice: '₱2,350', prediction: 'Increase', confidence: 96, status: 'success', statusLabel: 'Success' },
  { id: 'p-2', timestamp: 'Sep 9, 1:00 PM', goldPrice: '₱2,340', prediction: 'Stable', confidence: 92, status: 'success', statusLabel: 'Success' },
  { id: 'p-3', timestamp: 'Sep 9, 11:30 AM', goldPrice: '₱2,320', prediction: 'Decrease', confidence: 88, status: 'review', statusLabel: 'Review' },
  { id: 'p-4', timestamp: 'Sep 9, 10:00 AM', goldPrice: '₱2,318', prediction: 'Stable', confidence: 94, status: 'success', statusLabel: 'Success' },
  { id: 'p-5', timestamp: 'Sep 9, 8:30 AM', goldPrice: '₱2,305', prediction: 'Increase', confidence: 61, status: 'failed', statusLabel: 'Failed' },
];

/** Sample notification feed for the alerts card, newest first. */
const AI_ALERTS: Array<{ id: string; icon: string; tone: StatusTone | 'info'; title: string; detail: string; time: string }> = [
  { id: 'a-1', icon: checkmarkCircleOutline, tone: 'success', title: 'Model running normally', detail: 'All health checks passed on the scheduled run.', time: 'Just now' },
  { id: 'a-2', icon: trendingDownOutline, tone: 'review', title: 'Confidence dropped by 3%', detail: 'Average confidence moved from 95% to 92%.', time: '25 minutes ago' },
  { id: 'a-3', icon: flashOutline, tone: 'info', title: 'New prediction generated', detail: 'Gold price forecast issued for tomorrow.', time: '1 hour ago' },
  { id: 'a-4', icon: refreshOutline, tone: 'info', title: 'Model data updated', detail: 'Training window refreshed with the latest price records.', time: '2 hours ago' },
];

/* -------------------------------------------------------------------------- */
/* Section                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Everything on the AI Model Monitoring tab below the three summary cards:
 * the performance chart and its range filter, the health card, the prediction
 * statistics, the recent prediction log, and the alert feed.
 */
const ModelMonitoring: React.FC = () => {
  const [range, setRange] = useState<RangeId>('7d');

  const activeRange = RANGES.find((entry) => entry.id === range) || RANGES[1];
  const points = ACCURACY_SERIES[range];

  // The panel quotes the newest reading and its movement across the range, so
  // both are read off the charted series rather than stated separately.
  const summary = useMemo(() => {
    const latest = points[points.length - 1]?.value ?? 0;
    const first = points[0]?.value ?? 0;
    const change = latest - first;
    return {
      latest,
      change,
      tone: Math.abs(change) < 0.05 ? 'is-flat' : change > 0 ? 'is-up' : 'is-down',
      label: Math.abs(change) < 0.05 ? 'No change' : `${change > 0 ? '+' : '-'}${Math.abs(change).toFixed(1)}%`,
    };
  }, [points]);

  return (
    <div className="model-monitoring">
      <div className="model-monitoring-split">
        <div className="mini-panel model-performance-panel">
          <div className="section-heading">
            <div>
              <small>PREDICTION ACCURACY</small>
              <h3>AI Model Performance</h3>
            </div>
            <span className={`model-delta ${summary.tone}`}>{summary.label}</span>
          </div>

          <div className="model-range" role="group" aria-label="Performance range">
            {RANGES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={range === entry.id ? 'active' : ''}
                aria-pressed={range === entry.id}
                onClick={() => setRange(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <p className="model-performance-current">
            <strong>{summary.latest.toFixed(1)}%</strong>
            <span>accuracy over {activeRange.caption}</span>
          </p>

          <ModelPerformanceChart points={points} rangeLabel={activeRange.caption} />
        </div>

        <div className="mini-panel model-health-panel">
          <div className="section-heading">
            <div>
              <small>SYSTEM CHECK</small>
              <h3>Model Health</h3>
            </div>
          </div>

          <ul className="model-health-list">
            <HealthRow icon={serverOutline} label="Model status" tone="success" value="Operational" />
            <HealthRow icon={cloudDoneOutline} label="API connection" tone="success" value="Stable" />
            <HealthRow icon={layersOutline} label="Data quality" tone="success" value="Good" />
          </ul>

          <dl className="model-health-meta">
            <div>
              <dt>Last model training</dt>
              <dd>2 hours ago</dd>
            </div>
            <div>
              <dt>Last prediction</dt>
              <dd>Just now</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="model-tiles">
        <StatTile icon={layersOutline} tone="primary" value="12,458" label="Total predictions" note="All time" />
        <StatTile icon={checkmarkCircleOutline} tone="success" value="12,102" label="Successful predictions" note="97.1% of total" />
        <StatTile icon={closeCircleOutline} tone="warning" value="356" label="Failed predictions" note="2.9% of total" />
        <StatTile icon={speedometerOutline} tone="neutral" value="0.84s" label="Average response time" note="Across the last 24 hours" />
      </div>

      <div className="mini-panel model-predictions-panel">
        <div className="section-heading">
          <div>
            <small>PREDICTION LOG</small>
            <h3>Recent AI Predictions</h3>
          </div>
          <span className="model-count">{RECENT_PREDICTIONS.length} entries</span>
        </div>

        <div className="model-table-scroll">
          <table className="model-table">
            <thead>
              <tr>
                <th scope="col">Date &amp; Time</th>
                <th scope="col">Gold Price</th>
                <th scope="col">Prediction</th>
                <th scope="col">Confidence</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {RECENT_PREDICTIONS.map((row) => (
                <tr key={row.id}>
                  <td data-label="Date &amp; Time"><strong>{row.timestamp}</strong></td>
                  <td data-label="Gold Price">{row.goldPrice}</td>
                  <td data-label="Prediction">
                    <span className={`model-direction is-${row.prediction.toLowerCase()}`}>{row.prediction}</span>
                  </td>
                  <td data-label="Confidence">
                    <span className="model-confidence">
                      <i aria-hidden="true"><b style={{ width: `${row.confidence}%` }} /></i>
                      {row.confidence}%
                    </span>
                  </td>
                  <td data-label="Status"><StatusBadge tone={row.status} label={row.statusLabel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mini-panel model-alerts-panel">
        <div className="section-heading">
          <div>
            <small>NOTIFICATIONS</small>
            <h3>AI Alerts</h3>
          </div>
        </div>

        <ul className="model-alert-list">
          {AI_ALERTS.map((alert) => (
            <li key={alert.id} className={`model-alert is-${alert.tone}`}>
              <span className="model-alert-icon" aria-hidden="true"><IonIcon icon={alert.icon} /></span>
              <div>
                <strong>{alert.title}</strong>
                <span>{alert.detail}</span>
              </div>
              <time>
                <IonIcon icon={alert.tone === 'review' ? alertCircleOutline : alert.tone === 'info' ? informationCircleOutline : timeOutline} aria-hidden="true" />
                {alert.time}
              </time>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ModelMonitoring;
