import React, { useEffect, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { informationCircleOutline, removeOutline, trendingDownOutline, trendingUpOutline } from 'ionicons/icons';
import { getRedemptionSuggestion, type ApiRedemptionSuggestion } from '../services/api';
import './TrendSuggestionCard.css';

const TREND_ICON: Record<ApiRedemptionSuggestion['trend'], string> = {
  up: trendingUpOutline,
  down: trendingDownOutline,
  stable: removeOutline,
};

/**
 * Small info card showing the gold price trend and what it means for timing a
 * redemption. Read only, and labelled as an observation rather than advice.
 */
const TrendSuggestionCard: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [suggestion, setSuggestion] = useState<ApiRedemptionSuggestion | null>(null);

  useEffect(() => {
    let active = true;
    getRedemptionSuggestion()
      .then((result) => { if (active) setSuggestion(result); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  // The card adds nothing until the trend is known, so render nothing.
  if (!suggestion) return null;

  const sign = suggestion.change_percent > 0 ? '+' : '';

  return (
    <div className={`trend-suggestion ${suggestion.trend} ${compact ? 'compact' : ''}`}>
      <span className="trend-suggestion-icon" aria-hidden="true">
        <IonIcon icon={TREND_ICON[suggestion.trend]} />
      </span>
      <div className="trend-suggestion-body">
        <small>BEST TIME TO REDEEM OR RENEW</small>
        <p className="trend-suggestion-message">{suggestion.message}</p>
        <p className="trend-suggestion-figures">
          Current ₱{suggestion.current_price.toLocaleString()}/g · forecast ₱{suggestion.predicted_price.toLocaleString()}/g
          <b>{sign}{suggestion.change_percent}%</b>
          <span> · {suggestion.sample_size}-day average ₱{suggestion.average_price.toLocaleString()}/g</span>
        </p>
        <div className="trend-suggestion-confidence">
          <div className="trend-confidence-label">
            <span>AI confidence</span>
            <b>{suggestion.confidence_label} · {suggestion.confidence}%</b>
          </div>
          <div
            className="trend-confidence-track"
            role="img"
            aria-label={`Forecast confidence ${suggestion.confidence} percent, rated ${suggestion.confidence_label}`}
          >
            <i style={{ width: `${suggestion.confidence}%` }} />
          </div>
          <small>Read from how steady the last {suggestion.sample_size} recorded days were.</small>
        </div>
        <p className="trend-suggestion-note">
          <IonIcon icon={informationCircleOutline} aria-hidden="true" />
          {suggestion.disclaimer}
        </p>
      </div>
    </div>
  );
};

export default TrendSuggestionCard;
