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
    keywords: ['interest', 'rate', 'tubo', 'porsyento', 'percent', 'how much interest', 'charge'],
    answer:
      'Ang among monthly interest: 5% para sa alahas, relo, ug cellphone. 6% para sa bulky items. Our monthly interest is 5% for jewelry, watches, and cellphones, and 6% for bulky items.',
  },
  {
    id: 'status',
    keywords: ['status', 'value', 'balor', 'presyo', 'check my item', 'my item', 'appraisal', 'magkano', 'pila'],
    answer:
      'Log in sa Customer Portal, then adto sa "My Items" para makita ang status ug updated value sa imong butang. Log in to the Customer Portal and open My Items to see each item\'s status, appraised value, loan amount, and due date. Values update daily with the gold price.',
  },
  {
    id: 'overdue',
    keywords: ['due date', 'overdue', 'late', 'expire', 'forfeit', 'grace', 'lapas', 'nalapas', 'dili maka bayad', 'what happens if'],
    answer:
      'Naa kay 7 ka adlaw nga grace period human sa due date. Sulod ana, pwede pa ka mobayad o mo-renew. If the grace period passes without payment or renewal, the item is forfeited and may be put up for sale. Please talk to our staff before the due date so we can arrange a renewal.',
  },
  {
    id: 'requirements',
    keywords: ['document', 'requirement', 'valid id', 'id', 'kinahanglan', 'unsay dad-on', 'what do i need', 'papers'],
    answer:
      'Kinahanglan nimo: isa ka valid government ID ug ang item nga i-prenda. Bring one valid government ID (UMID, passport, driver\'s license, PhilSys, or postal ID) and the item itself. For gold, we weigh and check the karat in front of you before we quote a loan.',
  },
  {
    id: 'pawn',
    keywords: ['pawn', 'prenda', 'iprenda', 'sanla', 'loan', 'utang', 'borrow'],
    answer:
      'Para mo-prenda: dad-a ang item ug valid ID sa shop. Our staff appraises the item on the spot, quotes a loan amount, and issues a pawn ticket. The standard loan term is 60 days, plus a 7 day grace period.',
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
export function answerFor(message: string): string {
  const text = message.toLowerCase().trim();
  if (!text) return FALLBACK_ANSWER;

  const match = FAQ_ENTRIES.find((entry) => entry.keywords.some((keyword) => text.includes(keyword)));

  return match ? match.answer : FALLBACK_ANSWER;
}
