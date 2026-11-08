import React from 'react';
import { IonIcon } from '@ionic/react';
import { lockClosedOutline, ribbonOutline } from 'ionicons/icons';
import './RightsNotice.css';

/** The shop's contact details, as on the landing page and in the FAQ. */
const SHOP_CONTACT = {
  address: 'Kauswagan, Cagayan de Oro City, Misamis Oriental',
  phone: '0970 885 6182',
  email: 'renierjemorellorivas@gmail.com',
};

/**
 * What every pawner is entitled to know: their rights under the Pawnshop
 * Regulation Act (P.D. 114) and how the shop uses their personal data under
 * the Data Privacy Act (R.A. 10173). Shown on the customer's Profile.
 */
const RightsNotice: React.FC<{ redemptionDays?: number; noticeDays?: number }> = ({ redemptionDays = 90, noticeDays = 7 }) => (
  <div className="rights-notice">
    <section className="rights-card" aria-labelledby="rights-pawner">
      <h3 id="rights-pawner"><IonIcon icon={ribbonOutline} aria-hidden="true" />Your rights as a pawner</h3>
      <p className="rights-law">Pawnshop Regulation Act (P.D. 114)</p>
      <ol>
        <li><strong>Pawn ticket.</strong> You get a pawn ticket with the pawn amount, interest rate, due date and the last day to redeem. Keep it safe.</li>
        <li><strong>{redemptionDays} days after the due date to redeem.</strong> During this redemption period you can still redeem or renew your item. Interest continues until you pay.</li>
        <li><strong>Written notice before an auction.</strong> {noticeDays} days before the redemption period ends we send you a notice, in your portal and by email.</li>
        <li><strong>Public auction, never a direct sale.</strong> An item that is not redeemed goes to a public auction. It is not sold straight away, and you are told the result.</li>
        <li><strong>Ask us anytime.</strong> Talk to our staff before your due date if you need more time; we can arrange a renewal.</li>
      </ol>
    </section>

    <section className="rights-card" aria-labelledby="rights-privacy">
      <h3 id="rights-privacy"><IonIcon icon={lockClosedOutline} aria-hidden="true" />Privacy notice</h3>
      <p className="rights-law">Data Privacy Act of 2012 (R.A. 10173)</p>
      <dl>
        <dt>What we collect</dt>
        <dd>Your name, contact number, email, address, valid ID and its photo, a face photo if you agreed to one, and the records of your pawns.</dd>
        <dt>Why</dt>
        <dd>To identify you, manage your pawns and payments, protect your items from being claimed by someone else, and send you the notices the law requires.</dd>
        <dt>Who sees it</dt>
        <dd>Only our authorized staff. We do not sell or share your data, except when the law requires it.</dd>
        <dt>How long</dt>
        <dd>For as long as you have a pawn with us, then as long as the law requires us to keep records.</dd>
        <dt>Your rights</dt>
        <dd>You may ask to see, correct, or have your data deleted where the law allows, and you may file a complaint with the National Privacy Commission.</dd>
      </dl>
      <p className="rights-contact">Questions? Visit us at {SHOP_CONTACT.address}, call {SHOP_CONTACT.phone}, or email {SHOP_CONTACT.email}.</p>
    </section>
  </div>
);

export default RightsNotice;
