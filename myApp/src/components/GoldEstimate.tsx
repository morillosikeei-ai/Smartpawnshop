import React, { useState } from 'react';
import { IonButton, IonIcon } from '@ionic/react';
import { calculatorOutline, chatbubbleEllipsesOutline, locationOutline } from 'ionicons/icons';
import { getEstimate, type ApiEstimate, type MetalType } from '../services/api';
import { longDate, moneyExact } from '../data/pawnshopStore';
import TypeSelect from './TypeSelect';
import { cleanDecimal } from '../utils/decimalInput';
import './GoldEstimate.css';

/**
 * Jewelry types the estimate covers. Same labels as the Jewelry group of the
 * New Pawn Transaction form. The type only frames the result; the value is
 * computed from metal, purity and weight alone.
 */
const ITEM_TYPES = ['Ring', 'Necklace', 'Bracelet', 'Earrings', 'Pendant', 'Others'];
// Suggestions only: a visitor may type any other jewelry, such as an anklet.
const ITEM_TYPE_OPTIONS = ITEM_TYPES.map(type => ({ value: type, label: type }));

const MATERIALS: Array<{ value: MetalType; label: string }> = [
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
];

/** Purity options per metal. value is what the API expects in karat. */
const PURITIES: Record<MetalType, Array<{ value: string; label: string }>> = {
  gold: ['10k', '14k', '18k', '21k', '24k'].map(karat => ({ value: karat, label: karat.toUpperCase() })),
  silver: [
    { value: '925', label: '925 Sterling Silver' },
    { value: '999', label: '999 Fine Silver' },
  ],
};

const DEFAULT_PURITY: Record<MetalType, string> = { gold: '18k', silver: '925' };

const DISCLAIMER =
  'This is a rough estimate based on gold weight and today’s market price. It does not account for item condition, diamonds, or other factors. Final appraisal is done in-store by our staff.';

/** A plain "2026-09-18" date read as a local day, so it never shifts back a day west of UTC. */
const dayLabel = (date: string) => longDate(`${date}T00:00:00`);

const metalLabel = (metal: MetalType) => (metal === 'silver' ? 'Silver' : 'Gold');

/** "Gold Ring", or "Silver jewelry item" for the catch-all or an empty type. */
const itemLabel = (metal: MetalType, itemType: string) =>
  itemType === 'Others' || !itemType.trim() ? `${metalLabel(metal)} jewelry item` : `${metalLabel(metal)} ${itemType}`;

const purityLabel = (metal: MetalType, value: string) =>
  PURITIES[metal].find(option => option.value === value)?.label ?? value.toUpperCase();

type GoldEstimateProps = {
  /** Opens the FAQ chat for follow up questions. */
  onAskQuestion?: () => void;
};

/**
 * Public "Get an Estimate" section of the landing page.
 *
 * Needs no sign in and asks for no personal details. The figure comes from
 * POST /api/estimate, which uses the same price formula as a jewelry pawn
 * ticket, for gold or silver, and never saves anything.
 */
const GoldEstimate: React.FC<GoldEstimateProps> = ({ onAskQuestion }) => {
  const [itemType, setItemType] = useState(ITEM_TYPES[0]);
  const [metal, setMetal] = useState<MetalType>('gold');
  const [karat, setKarat] = useState(DEFAULT_PURITY.gold);
  const [weight, setWeight] = useState('');
  const [estimate, setEstimate] = useState<ApiEstimate | null>(null);
  // The item type and metal the shown figure was computed for, so editing the
  // form never relabels an old result.
  const [estimatedFor, setEstimatedFor] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const weightGrams = Number(weight);
  const weightValid = weight.trim() !== '' && Number.isFinite(weightGrams) && weightGrams > 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!weightValid) {
      setError('Enter the weight in grams, greater than 0.');
      return;
    }
    setLoading(true);
    try {
      setEstimate(await getEstimate(karat, weightGrams, metal));
      setEstimatedFor(itemLabel(metal, itemType));
    } catch (estimateError) {
      setEstimate(null);
      setError(estimateError instanceof Error ? estimateError.message : 'Unable to get an estimate right now.');
    } finally {
      setLoading(false);
    }
  };

  // A changed input makes the shown figure stale, so it is cleared.
  const clearResult = () => {
    setEstimate(null);
    setError('');
  };

  // Karats and silver fineness do not overlap, so a metal switch resets the
  // purity to that metal's default.
  const chooseMetal = (value: MetalType) => {
    if (value === metal) return;
    setMetal(value);
    setKarat(DEFAULT_PURITY[value]);
    clearResult();
  };

  const resultMetal = estimate?.metal_type ?? 'gold';

  return (
    <section className="estimate-section landing-section" id="estimate">
      <div className="estimate-copy">
        <div className="section-eyebrow">FREE JEWELRY ESTIMATE</div>
        <h2>Get an Estimate before you visit.</h2>
        <p>
          This estimate is for gold and silver jewelry only (rings, necklaces, bracelets, earrings, pendants) based on weight and purity — it does not cover watches, cellphones, gadgets, appliances, or items with diamonds, which require in-person appraisal. No login and no personal details needed.
        </p>
      </div>

      <div className="estimate-card">
        <form className="estimate-form" onSubmit={handleSubmit} noValidate>
          <label className="estimate-field">
            <span>Item Type</span>
            <TypeSelect
              free
              ariaLabel="Item Type"
              value={itemType}
              options={ITEM_TYPE_OPTIONS}
              onChange={value => { setItemType(value); clearResult(); }}
              maxLength={50}
              placeholder="Pick or type"
            />
          </label>
          <div className="estimate-field">
            <span id="estimate-material-label">Material</span>
            <div className="estimate-material" role="radiogroup" aria-labelledby="estimate-material-label">
              {MATERIALS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={metal === option.value}
                  className={metal === option.value ? 'active' : ''}
                  onClick={() => chooseMetal(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <label className="estimate-field">
            <span>Karat / Purity</span>
            {/* Keyed on the metal so the field starts over with that metal's options. */}
            <TypeSelect
              key={metal}
              ariaLabel="Karat / Purity"
              value={karat}
              options={PURITIES[metal]}
              onChange={value => { setKarat(value); clearResult(); }}
              placeholder="Pick or type, e.g. 18k"
            />
          </label>
          <label className="estimate-field">
            <span>Weight (grams)</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="e.g. 5.2"
              value={weight}
              onChange={event => { setWeight(cleanDecimal(event.target.value)); clearResult(); }}
            />
          </label>
          <IonButton type="submit" className="hero-btn primary-btn estimate-submit" disabled={loading}>
            <IonIcon icon={calculatorOutline} slot="start" />
            {loading ? 'Calculating...' : 'Get an Estimate'}
          </IonButton>
        </form>

        {error && <p className="estimate-error" role="alert">{error}</p>}

        {estimate && (
          <div className="estimate-result" aria-live="polite">
            <p className="estimate-value">Estimated value for your {estimatedFor}: <strong>{moneyExact(estimate.estimated_value)}</strong></p>
            <dl className="estimate-meta">
              <div><dt>Date</dt><dd>{dayLabel(estimate.estimate_date)}</dd></div>
              <div>
                <dt>{metalLabel(resultMetal)} price used</dt>
                <dd>
                  {moneyExact(estimate.price_per_gram)} / g
                  {estimate.price_date !== estimate.estimate_date && <small> (recorded {dayLabel(estimate.price_date)})</small>}
                </dd>
              </div>
              <div><dt>Computation</dt><dd>{estimate.weight_grams} g × {purityLabel(resultMetal, estimate.karat)} ({(estimate.purity * 100).toFixed(1)}%) × {moneyExact(estimate.price_per_gram)}</dd></div>
            </dl>
            <p className="estimate-disclaimer">{DISCLAIMER}</p>
            <div className="estimate-cta">
              <IonButton className="hero-btn primary-btn" href="#contact">
                <IonIcon icon={locationOutline} slot="start" />
                Visit Our Shop
              </IonButton>
              {onAskQuestion && (
                <IonButton fill="outline" className="hero-btn estimate-ask" onClick={onAskQuestion}>
                  <IonIcon icon={chatbubbleEllipsesOutline} slot="start" />
                  Ask a Question
                </IonButton>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default GoldEstimate;
