import React, { useEffect, useState } from 'react';
import { getRedemptionSuggestion, type ApiPurityPrice, type ApiRedemptionSuggestion } from '../services/api';
import './PurityPriceTable.css';

const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Rows: React.FC<{ rows: ApiPurityPrice[] }> = ({ rows }) => (
  <>
    {rows.map((row) => {
      const move = row.predicted - row.current;
      return (
        <tr key={row.code}>
          <th scope="row">{row.label}</th>
          <td>{row.current > 0 ? peso(row.current) : '—'}</td>
          <td className={move > 0 ? 'up' : move < 0 ? 'down' : 'flat'}>
            {row.predicted > 0 ? <>{peso(row.predicted)} <span aria-hidden="true">{move > 0 ? '▲' : move < 0 ? '▼' : '•'}</span></> : '—'}
          </td>
        </tr>
      );
    })}
  </>
);

/**
 * Per gram price of each gold karat and silver fineness, today and forecast
 * for the next recorded day, from the API's moving-average forecast. With
 * `references`, also the admin's reference prices for pearl and a natural
 * diamond, which have no market feed and so are not forecast.
 */
const PurityPriceTable: React.FC<{ metal?: 'gold' | 'silver' | 'both'; references?: boolean; compact?: boolean }> = ({ metal = 'both', references = false, compact = false }) => {
  const [data, setData] = useState<ApiRedemptionSuggestion | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getRedemptionSuggestion().then(setData).catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="purity-prices-note">Prices per karat are unavailable right now.</p>;
  if (!data?.by_purity) return <p className="purity-prices-note">Loading prices per karat...</p>;

  return (
    <div className={`purity-prices ${compact ? 'is-compact' : ''}`}>
      <table>
        <thead>
          <tr><th scope="col">Per gram</th><th scope="col">Today</th><th scope="col">Predicted</th></tr>
        </thead>
        <tbody>
          {metal !== 'silver' && <Rows rows={data.by_purity.gold} />}
          {metal === 'both' && <tr className="purity-prices-group"><th colSpan={3}>Silver</th></tr>}
          {metal !== 'gold' && <Rows rows={data.by_purity.silver} />}
        </tbody>
      </table>

      {references && data.references && (
        <table className="purity-prices-references">
          <thead>
            <tr><th scope="col">Reference price</th><th scope="col" colSpan={2}>Set by the admin</th></tr>
          </thead>
          <tbody>
            {data.references.map((reference) => (
              <tr key={reference.key}>
                <th scope="row">{reference.label}</th>
                <td colSpan={2}>{reference.price !== null ? peso(reference.price) : <em>Not set — Admin → Settings</em>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="purity-prices-note">
        Karat prices are the 24K price × purity; predicted is the next recorded day from the 7-day moving average.
        {references && ' Pearl and diamond have no market feed, so they are references, not forecasts.'}
      </p>
    </div>
  );
};

export default PurityPriceTable;
