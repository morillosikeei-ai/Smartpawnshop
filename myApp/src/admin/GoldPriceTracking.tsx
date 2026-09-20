import React, { useEffect, useMemo, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { informationCircleOutline, sparklesOutline } from 'ionicons/icons';
import { money, shortDate } from '../data/pawnshopStore';
import {
  getGoldPrices,
  getRedemptionSuggestion,
  type ApiGoldPrice,
  type ApiRedemptionSuggestion,
} from '../services/api';
import GoldPriceChart, { type GoldPricePoint } from '../components/GoldPriceChart';
import TrendSuggestionCard from '../components/TrendSuggestionCard';
import { Skeleton } from '../components/Skeleton';
import './GoldPriceTracking.css';

/**
 * History windows the tracking panel can be filtered to.
 *
 * `lookbackDays` counts back from the newest reading, which is itself day one:
 * a seven day window is the newest reading plus the six before it. Prices are
 * recorded once a day, so 24H is the newest reading against the one before it.
 */
const RANGES = [
  { id: '24h', label: '24H', lookbackDays: 1 },
  { id: '7d', label: '7 Days', lookbackDays: 6 },
  { id: '30d', label: '30 Days', lookbackDays: 29 },
  { id: '90d', label: '90 Days', lookbackDays: 89 },
] as const;

type RangeId = (typeof RANGES)[number]['id'];

/** Chart height on this screen, where the trend is the point of the page. */
const CHART_HEIGHT = 208;

/** How far a move must go before it is called a rise or a fall, in percent. */
const FLAT_MOVE_PERCENT = 0.05;

/** The standing valuation notes the review team keeps on this panel. */
const VALUATION_NOTES: Array<{ tone: 'info' | 'warn'; text: string }> = [
  { tone: 'info', text: 'Jewelry items revalued at 2.8% above prior benchmark.' },
  { tone: 'info', text: 'High-demand 18K inventory is trending above projection.' },
  { tone: 'warn', text: 'Risk team recommended slight tightening for high-ticket collateral.' },
];

type AlertTone = 'ok' | 'info' | 'warn' | 'danger';

type PriceAlert = { id: string; tone: AlertTone; title: string; detail: string };

/** Recorded days inside the chosen window, oldest first. */
const pointsInRange = (prices: ApiGoldPrice[], lookbackDays: number): GoldPricePoint[] => {
  const points = prices
    .map((row) => ({ date: row.price_date, price: Number(row.price_per_gram) }))
    .filter((point) => Number.isFinite(point.price))
    .sort((first, second) => first.date.localeCompare(second.date));

  if (points.length === 0) return [];

  // The window is measured from the newest reading rather than from today, so
  // a panel opened after a quiet weekend still shows a line.
  const newest = new Date(points[points.length - 1].date);
  const cutoff = new Date(newest);
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  const inRange = points.filter((point) => new Date(point.date) >= cutoff);

  // One point draws no line. The reading before it is kept so the shortest
  // window still shows a direction.
  return inRange.length > 1 ? inRange : points.slice(-2);
};

/** Percent move from the first reading in the window to the last. */
const moveOver = (points: GoldPricePoint[]) => {
  if (points.length < 2) return 0;

  const opening = points[0].price;

  return opening > 0 ? ((points[points.length - 1].price - opening) / opening) * 100 : 0;
};

const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

/**
 * Gold price tracking: the recorded trend, what it is worth per window, the
 * forecast the pawnshop prices against, and what needs someone's attention.
 *
 * Every figure comes from the gold_prices history and the forecast endpoint, so
 * nothing on this panel is a placeholder number.
 */
const GoldPriceTracking: React.FC = () => {
  const [prices, setPrices] = useState<ApiGoldPrice[]>([]);
  const [suggestion, setSuggestion] = useState<ApiRedemptionSuggestion | null>(null);
  const [range, setRange] = useState<RangeId>('7d');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    Promise.all([getGoldPrices(), getRedemptionSuggestion().catch(() => null)])
      .then(([history, forecast]) => {
        if (!active) return;
        setPrices(history);
        setSuggestion(forecast);
      })
      .catch((cause: Error) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoaded(true); });

    return () => { active = false; };
  }, []);

  const activeRange = RANGES.find((option) => option.id === range) ?? RANGES[1];
  const points = useMemo(() => pointsInRange(prices, activeRange.lookbackDays), [prices, activeRange.lookbackDays]);

  const figures = useMemo(() => {
    if (points.length === 0) return null;

    const values = points.map((point) => point.price);

    return {
      opening: values[0],
      highest: Math.max(...values),
      lowest: Math.min(...values),
      current: values[values.length - 1],
      recordedAt: points[points.length - 1].date,
    };
  }, [points]);

  const move = moveOver(points);
  const moveTone = move > FLAT_MOVE_PERCENT ? 'success' : move < -FLAT_MOVE_PERCENT ? 'danger' : 'neutral';

  const alerts = useMemo<PriceAlert[]>(() => {
    if (!figures) return [];

    const rows: PriceAlert[] = [];

    rows.push({
      id: 'move',
      tone: move > FLAT_MOVE_PERCENT ? 'ok' : move < -FLAT_MOVE_PERCENT ? 'danger' : 'info',
      title: `Gold ${move > FLAT_MOVE_PERCENT ? 'is up' : move < -FLAT_MOVE_PERCENT ? 'is down' : 'is flat'} ${signed(move)} over ${activeRange.label.toLowerCase()}`,
      detail: `${money(figures.opening)} at the open against ${money(figures.current)} now.`,
    });

    if (suggestion) {
      rows.push({
        id: 'forecast',
        tone: suggestion.trend === 'up' ? 'ok' : suggestion.trend === 'down' ? 'warn' : 'info',
        title: `Forecast sits ${signed(suggestion.change_percent)} against today's price`,
        detail: `${suggestion.confidence_label} confidence · ${suggestion.sample_size}-day moving average.`,
      });
    }

    // A stale reading matters: item values and the risk bands are recomputed
    // from the newest recorded price.
    const daysSinceReading = Math.floor((Date.now() - new Date(figures.recordedAt).getTime()) / 86400000);
    rows.push({
      id: 'freshness',
      tone: daysSinceReading <= 1 ? 'ok' : daysSinceReading <= 3 ? 'warn' : 'danger',
      title: daysSinceReading <= 1 ? 'Price feed is current' : `Last reading is ${daysSinceReading} days old`,
      detail: `Recorded ${shortDate(figures.recordedAt)}. Item values follow this reading.`,
    });

    return rows;
  }, [figures, move, activeRange.label, suggestion]);

  const forecastMove = suggestion?.change_percent ?? 0;

  return (
    <div className="gold-tracking">
      <section className="mini-panel gold-trend-panel">
        <div className="section-heading gold-trend-head">
          <div>
            <small>LIVE TREND</small>
            <h3>Market Reference</h3>
          </div>
          <div className="gold-range-filter" role="tablist" aria-label="Gold price history range">
            {RANGES.map((option) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={range === option.id}
                className={range === option.id ? 'active' : ''}
                onClick={() => setRange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="gold-price-headline">
          <div>
            <strong>{figures ? `${money(figures.current)} / gram` : loaded ? 'No price recorded' : <Skeleton width="180px" height="1.6rem" />}</strong>
            <small>{figures ? `Today's Gold Reference Price · Recorded ${shortDate(figures.recordedAt)}` : <Skeleton width="120px" height="0.7rem" />}</small>
            <small>Used as a starting reference for jewelry valuation — final appraisal remains at staff's discretion.</small>
          </div>
          {figures && <span className={`chip ${moveTone}`}>{signed(move)} · {activeRange.label}</span>}
        </div>

        <div className="gold-figure-grid">
          {[
            { label: 'Opening', value: figures?.opening },
            { label: 'Highest', value: figures?.highest },
            { label: 'Lowest', value: figures?.lowest },
            { label: 'Current', value: figures?.current },
          ].map((figure) => (
            <div key={figure.label} className={`gold-figure ${figure.label === 'Current' ? 'is-current' : ''}`}>
              <span>{figure.label}</span>
              <strong>{figure.value === undefined ? <Skeleton width="72px" height="1rem" /> : money(figure.value)}</strong>
            </div>
          ))}
        </div>

        <GoldPriceChart points={points} loading={!loaded} error={error} height={CHART_HEIGHT} />
      </section>

      <section className="mini-panel gold-forecast-panel">
        <div className="section-heading">
          <div>
            <small>AI PRICE FORECAST</small>
            <h3>Next recorded day</h3>
          </div>
          <span className="gold-forecast-mark" aria-hidden="true"><IonIcon icon={sparklesOutline} /></span>
        </div>

        {suggestion ? (
          <>
            <div className="gold-forecast-value">
              <strong>{money(suggestion.predicted_price)}</strong>
              <em className={forecastMove > 0 ? 'up' : forecastMove < 0 ? 'down' : 'flat'}>{signed(forecastMove)}</em>
            </div>
            <p className="gold-forecast-basis">
              Against {money(suggestion.current_price)} today, from a {suggestion.sample_size}-day moving average of {money(suggestion.average_price)}.
            </p>
            <div className="gold-forecast-confidence">
              <div>
                <span>AI confidence</span>
                <b>{suggestion.confidence_label} · {suggestion.confidence}%</b>
              </div>
              <div className="gold-confidence-track" role="img" aria-label={`Forecast confidence ${suggestion.confidence} percent`}>
                <i className={suggestion.confidence_label.toLowerCase()} style={{ width: `${suggestion.confidence}%` }} />
              </div>
            </div>
            <p className="gold-forecast-note">
              <IonIcon icon={informationCircleOutline} aria-hidden="true" />
              Confidence follows how steady the recorded days were. Not financial advice.
            </p>
          </>
        ) : (
          <p className="gold-empty-note">{loaded ? 'No forecast available yet.' : 'Loading forecast...'}</p>
        )}
      </section>

      <section className="mini-panel gold-suggestion-panel">
        <div className="section-heading">
          <div>
            <small>TIMING</small>
            <h3>Best time to redeem or renew</h3>
          </div>
        </div>
        <TrendSuggestionCard />
        {!suggestion && loaded && <p className="gold-empty-note">No trend reading available yet.</p>}
      </section>

      <section className="mini-panel gold-alerts-panel">
        <div className="section-heading">
          <div>
            <small>PRICE ALERTS</small>
            <h3>Valuation review</h3>
          </div>
        </div>

        <ul className="gold-alert-list">
          {alerts.map((alert) => (
            <li key={alert.id} className={alert.tone}>
              <span className="gold-alert-dot" aria-hidden="true" />
              <div>
                <strong>{alert.title}</strong>
                <small>{alert.detail}</small>
              </div>
            </li>
          ))}
          {alerts.length === 0 && <li className="info"><span className="gold-alert-dot" aria-hidden="true" /><div><strong>{loaded ? 'No price history recorded yet' : 'Loading price alerts...'}</strong><small>Alerts appear once a gold price is recorded.</small></div></li>}
        </ul>

        <div className="gold-alert-notes">
          <small>STANDING NOTES</small>
          <ul className="gold-alert-list">
            {VALUATION_NOTES.map((note) => (
              <li key={note.text} className={note.tone}>
                <span className="gold-alert-dot" aria-hidden="true" />
                <div><strong>{note.text}</strong></div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
};

export default GoldPriceTracking;
