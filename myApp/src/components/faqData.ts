/**
 * Canned answers for the FAQ chatbot.
 *
 * This is a rule based bot: no API call, no model, no training. Each entry
 * carries a list of trigger keywords. The first entry with a keyword found
 * inside the customer's message wins, so keep the more specific entries
 * higher up in the list.
 *
 * Keywords must be lowercase, because the matcher lowercases the message
 * before it compares.
 */
export type FaqEntry = {
  id: string;
  keywords: string[];
  answer: string;
  /**
   * A place in the app the answer points at. The chat widget turns this into a
   * button, and only when the customer is signed in, because the destination
   * exists in the Customer Portal and not on the public landing page.
   */
  action?: 'items';
};

export const FALLBACK_ANSWER =
  "Pasensya na, wala nako nasabtan imong pangutana. Sorry, I didn't get that. You can visit the shop or check our Contact section for help.";

export const FAQ_ENTRIES: FaqEntry[] = [
  {
    id: 'redeem',
    keywords: ['redeem', 'redemption', 'tubos', 'motubos', 'kuhaon', 'get my item', 'claim'],
    answer:
      'Para motubos (redeem) sa imong butang: dad-a ang imong pawn ticket ug valid ID sa shop, then bayad sa principal plus interest. Bring your pawn ticket and a valid ID, pay the principal plus the accrued interest, and we release your item on the same day.',
  },
  {
    id: 'interest',
    keywords: ['interest', 'renta', 'rate', 'tubo', 'porsyento', 'percent', 'how much interest', 'charge'],
    answer:
      'Ang among monthly interest (renta): 5% para sa alahas, relo, ug cellphone. 6% para sa bulky items. Our monthly interest (renta) is 5% for jewelry, watches, and cellphones, and 6% for bulky items.',
  },
  {
    id: 'status',
    keywords: ['status', 'value', 'balor', 'presyo', 'check my item', 'my item', 'appraisal', 'magkano', 'pila'],
    answer:
      'Log in sa Customer Portal, then adto sa "My Items" para makita ang status ug updated value sa imong butang. Log in to the Customer Portal and open My Items to see each item\'s status, appraised value, pawn amount, and due date. Values update daily with the gold price.',
    action: 'items',
  },
  {
    id: 'overdue',
    keywords: ['due date', 'overdue', 'late', 'expire', 'forfeit', 'grace', 'extension', 'unclaimed', 'lapas', 'nalapas', 'dili maka bayad', 'what happens if'],
    answer:
      'Naa kay 7 ka adlaw nga extension period human sa due date. Sulod ana, pwede pa ka mobayad o mo-renew. If the extension period passes without payment or renewal, the item becomes expired/unclaimed and may be put up for sale. Please talk to our staff before the due date so we can arrange a renewal.',
    action: 'items',
  },
  {
    id: 'requirements',
    keywords: ['document', 'requirement', 'valid id', 'id', 'kinahanglan', 'unsay dad-on', 'what do i need', 'papers'],
    answer:
      'Kinahanglan nimo: isa ka valid government ID ug ang item nga i-prenda. Bring one valid government ID (UMID, passport, driver\'s license, PhilSys, or postal ID) and the item itself. For gold, we weigh and check the karat in front of you before we quote a pawn amount.',
  },
  {
    id: 'pawn',
    keywords: ['pawn', 'prenda', 'iprenda', 'sanla', 'loan', 'utang', 'borrow'],
    answer:
      'Para mo-prenda: dad-a ang item ug valid ID sa shop. Our staff appraises the item on the spot, quotes a pawn amount, and issues a pawn ticket. The standard pawn term is 60 days, plus a 7 day extension period.',
  },
  {
    id: 'contact',
    keywords: ['contact', 'address', 'location', 'asa', 'number', 'phone', 'email', 'open', 'hours', 'schedule', 'oras'],
    answer:
      'Naa mi sa Poblacion, Pagasawa, Philippines. Bukas Monday to Saturday, 8:00 AM to 5:00 PM. Call (02) 8123 4567 or email hello@pagasapawnshop.ph.',
  },
];

/**
 * Match a customer message against the FAQ list.
 *
 * The message is lowercased and trimmed first, then each entry is checked in
 * order. A keyword counts as a match when it appears anywhere inside the
 * message, so "unsa ang interest rate ninyo" matches the "interest" keyword.
 * The first matching entry wins. Returns the fallback when nothing matches.
 */
export function matchFor(message: string): FaqEntry | null {
  const text = message.toLowerCase().trim();
  if (!text) return null;

  return FAQ_ENTRIES.find((entry) => entry.keywords.some((keyword) => text.includes(keyword))) || null;
}

export function answerFor(message: string): string {
  const match = matchFor(message);

  return match ? match.answer : FALLBACK_ANSWER;
}

/** The place the answer points at, or null when the answer points nowhere. */
export function actionFor(message: string): FaqEntry['action'] | null {
  return matchFor(message)?.action || null;
}
