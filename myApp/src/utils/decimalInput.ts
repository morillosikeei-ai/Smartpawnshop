/**
 * Keeps a typed or pasted amount to digits and one decimal point, so a minus
 * sign, "+", "e" or any other character never reaches the field. Every amount
 * in the app (weight, value, pawn amount, payment) is zero or more.
 */
export const cleanDecimal = (value: string) => {
  const [whole, ...rest] = value.replace(/[^\d.]/g, '').split('.');
  return rest.length ? `${whole}.${rest.join('')}` : whole;
};

/**
 * Reads an IonInput's ionInput event as a clean amount. IonInput does not
 * re-render a rejected keystroke on its own, so the cleaned text is written
 * back into the field as well as returned.
 */
export const readDecimal = (event: { detail: { value?: string | null }; target: { value?: string | number | null } }) => {
  const cleaned = cleanDecimal(event.detail.value || '');
  if (event.target.value !== cleaned) event.target.value = cleaned;
  return cleaned;
};
