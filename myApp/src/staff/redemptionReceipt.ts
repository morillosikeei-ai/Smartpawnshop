/**
 * The printed receipt for a redeemed pawn.
 *
 * Built from what the API answered when the pawn was closed (principal,
 * interest and total as of that moment, and the receipt number), plus what
 * was taken at the counter. It opens in its own window and prints straight
 * away, the same way the pawn ticket does.
 */
export type RedemptionReceipt = {
  receiptNumber: string;
  ticketNumber: string;
  customer: string;
  item: string;
  /** Date the pawn was opened, already formatted. */
  pawnedOn: string;
  principal: number;
  /** Monthly interest rate as a percentage, e.g. 5 for 5% a month. */
  ratePercent: number;
  /** Days the pawn ran, which the interest is charged on (rate per 30 days). */
  daysElapsed: number;
  interest: number;
  totalPayable: number;
  method: string;
  reference: string | null;
  collected: number;
  cashReceived: number | null;
  staffName: string;
};

const peso = (value: number) =>
  `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));

/** The interest line as a person reads it: "5% / month × 42 days". */
export const interestBasis = (ratePercent: number, daysElapsed: number) =>
  `${Number(ratePercent.toFixed(2))}% / month × ${daysElapsed} ${daysElapsed === 1 ? 'day' : 'days'}`;

/**
 * Open the receipt and print it.
 *
 * Call it from a click (or straight after one): a window opened long after the
 * click is blocked as a popup. Returns false when the browser blocked it.
 */
export function printRedemptionReceipt(receipt: RedemptionReceipt): boolean {
  if (typeof window === 'undefined') return false;
  const printWindow = window.open('', '_blank', 'width=720,height=900');
  if (!printWindow) return false;

  const isCash = receipt.method.trim().toLowerCase() === 'cash';
  const change = receipt.cashReceived !== null ? receipt.cashReceived - receipt.collected : null;
  const issued = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  const row = (label: string, value: string, className = '') =>
    `<div class="row ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;

  const html = `
    <html>
      <head>
        <title>${escapeHtml(receipt.receiptNumber)}</title>
        <style>
          body { font-family: 'Inter Variable', Inter, 'Segoe UI', system-ui, sans-serif; color: #061028; margin: 28px; }
          .receipt { max-width: 520px; margin: 0 auto; border: 2px solid #061028; border-radius: 16px; padding: 24px; }
          .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 2px solid #d4a72c; padding-bottom: 12px; margin-bottom: 14px; }
          .brand { font-size: 12px; letter-spacing: .2em; font-weight: 800; color: #52627b; }
          .title { font-size: 24px; font-weight: 800; margin-top: 6px; }
          .label { display: block; font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #52627b; }
          .number { font-size: 16px; font-weight: 800; margin-top: 4px; }
          .section { margin-top: 16px; }
          .section h4 { margin: 0 0 6px; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #52627b; }
          .row { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; border-bottom: 1px dashed #dfe7f0; font-size: 14px; }
          .row span { color: #334155; }
          .row strong { text-align: right; }
          .row.total { border-bottom: 0; border-top: 2px solid #061028; margin-top: 4px; padding-top: 10px; font-size: 17px; }
          .row.muted span, .row.muted strong { color: #52627b; font-weight: 600; font-size: 13px; }
          .stamp { margin-top: 18px; padding: 10px 12px; border-radius: 10px; background: #ecfdf3; color: #15803d; font-weight: 800; text-align: center; letter-spacing: .08em; }
          .footer { margin-top: 18px; font-size: 12px; color: #52627b; line-height: 1.6; }
          .sign { display: flex; justify-content: space-between; gap: 24px; margin-top: 36px; font-size: 12px; color: #52627b; }
          .sign div { flex: 1; border-top: 1px solid #061028; padding-top: 6px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <div>
              <div class="brand">PAG-ASA PAWNSHOP</div>
              <div class="title">REDEMPTION RECEIPT</div>
            </div>
            <div style="text-align: right;">
              <span class="label">Receipt No.</span>
              <div class="number">${escapeHtml(receipt.receiptNumber)}</div>
              <span class="label" style="margin-top: 8px;">Issued</span>
              <div style="font-size: 13px; font-weight: 700; margin-top: 4px;">${escapeHtml(issued)}</div>
            </div>
          </div>

          <div class="section">
            ${row('Pawn ticket', receipt.ticketNumber)}
            ${row('Customer', receipt.customer)}
            ${row('Item', receipt.item)}
            ${row('Pawned on', receipt.pawnedOn)}
          </div>

          <div class="section">
            <h4>Breakdown</h4>
            ${row('Principal (pawn amount)', peso(receipt.principal))}
            ${row(`Interest (${interestBasis(receipt.ratePercent, receipt.daysElapsed)})`, peso(receipt.interest))}
            ${row('Total payable', peso(receipt.totalPayable), 'total')}
          </div>

          <div class="section">
            <h4>Payment</h4>
            ${row('Payment method', receipt.method)}
            ${!isCash && receipt.reference ? row('Reference no.', receipt.reference) : ''}
            ${row('Amount paid', peso(receipt.collected))}
            ${isCash && receipt.cashReceived !== null ? row('Cash received', peso(receipt.cashReceived), 'muted') : ''}
            ${isCash && change !== null ? row('Change', peso(Math.max(0, change)), 'muted') : ''}
          </div>

          <div class="stamp">PAID · ITEM RELEASED</div>

          <div class="footer">
            Interest is charged at the monthly rate for each day the pawn ran (rate × days ÷ 30).
            Keep this receipt as proof that the item was redeemed and released.
          </div>

          <div class="sign">
            <div>${escapeHtml(receipt.staffName || 'Staff')}<br />Processed by</div>
            <div>${escapeHtml(receipt.customer)}<br />Received by</div>
          </div>
        </div>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
  return true;
}
