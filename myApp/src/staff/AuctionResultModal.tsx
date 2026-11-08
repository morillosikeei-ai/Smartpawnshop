import React, { useEffect, useState } from 'react';
import { IonIcon, IonModal } from '@ionic/react';
import { closeOutline, hammerOutline } from 'ionicons/icons';
import { moneyExact } from '../data/pawnshopStore';
import './AuctionResultModal.css';

export type AuctionOutcome = { result: 'sold' | 'unsold'; auctionDate: string; price: number };

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/** A typed peso amount, or null when it is not a positive number. */
const parsePrice = (text: string) => {
  const raw = text.replace(/[,\s₱]/g, '');
  const price = Number(raw);
  return raw !== '' && Number.isFinite(price) && price > 0 ? price : null;
};

/**
 * Record the public auction of an item set for auction (PD 114).
 *
 * Sold: the auction date and the price it fetched; the item becomes Sold.
 * Not sold: the auction date and the price to list it at on Items for Sale.
 * Either way the auction comes first: an item is never listed without one.
 */
const AuctionResultModal: React.FC<{
  item: { description: string; ticket?: string } | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (outcome: AuctionOutcome) => void;
}> = ({ item, busy, onClose, onSubmit }) => {
  const [result, setResult] = useState<AuctionOutcome['result']>('sold');
  const [auctionDate, setAuctionDate] = useState(todayKey());
  const [priceText, setPriceText] = useState('');

  useEffect(() => {
    if (!item) return;
    setResult('sold');
    setAuctionDate(todayKey());
    setPriceText('');
  }, [item]);

  const price = parsePrice(priceText);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(auctionDate) && auctionDate <= todayKey();
  const ready = price !== null && dateOk && !busy;

  return (
    <IonModal isOpen={item !== null} onDidDismiss={onClose} className="auction-modal">
      <div className="auction-box">
        <div className="auction-head">
          <div>
            <small><IonIcon icon={hammerOutline} aria-hidden="true" /> PUBLIC AUCTION</small>
            <h3>Auction result</h3>
            {item && <p>{item.description}{item.ticket ? ` · Ticket ${item.ticket}` : ''}</p>}
          </div>
          <button type="button" className="auction-close" onClick={onClose} aria-label="Close"><IonIcon icon={closeOutline} /></button>
        </div>

        <fieldset className="auction-choice">
          <legend>Result</legend>
          <label className={result === 'sold' ? 'is-on' : ''}>
            <input type="radio" name="auction-result" checked={result === 'sold'} onChange={() => setResult('sold')} />
            <span><strong>Sold at the auction</strong><small>The item is marked Sold.</small></span>
          </label>
          <label className={result === 'unsold' ? 'is-on' : ''}>
            <input type="radio" name="auction-result" checked={result === 'unsold'} onChange={() => setResult('unsold')} />
            <span><strong>Not sold at the auction</strong><small>List it on Items for Sale.</small></span>
          </label>
        </fieldset>

        <div className="auction-fields">
          <label>
            <span>Auction date</span>
            <input type="date" value={auctionDate} max={todayKey()} onChange={(event) => setAuctionDate(event.target.value)} />
          </label>
          <label>
            <span>{result === 'sold' ? 'Sold price' : 'Selling price'}</span>
            <input inputMode="decimal" placeholder="₱0.00" value={priceText} onChange={(event) => setPriceText(event.target.value)} />
          </label>
        </div>
        {!dateOk && <p className="auction-hint">The auction date cannot be in the future.</p>}

        <div className="auction-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="primary-button"
            disabled={!ready}
            onClick={() => price !== null && onSubmit({ result, auctionDate, price })}
          >
            {result === 'sold' ? `Record sale${price ? ` · ${moneyExact(price)}` : ''}` : `List for sale${price ? ` · ${moneyExact(price)}` : ''}`}
          </button>
        </div>
      </div>
    </IonModal>
  );
};

export default AuctionResultModal;
