import { matchNameToIdText, normalizeText } from './idOcr';

const PHILSYS = `REPUBLIKA NG PILIPINAS
Philippine Identification Card
Apelyido/Last Name
DELA CRUZ
Mga Pangalan/Given Names
JUAN MIGUEL
Middle Name
SANTOS
Petsa ng Kapanganakan/Date of Birth
JANUARY 01, 1990`;

test('normalizes case, accents, and punctuation', () => {
  expect(normalizeText('Dela Cruz, Juan Ñ.')).toBe('DELA CRUZ JUAN N');
});

test('matches a name typed in a different order and case', () => {
  expect(matchNameToIdText('juan miguel santos dela cruz', PHILSYS)).toBe('match');
});

test('ignores a middle initial', () => {
  expect(matchNameToIdText('Juan S. Dela Cruz', PHILSYS)).toBe('match');
});

test('allows a misread character in the OCR text', () => {
  const misread = PHILSYS.replace('MIGUEL', 'M1GUEL').replace('SANTOS', 'SANT0S');
  expect(matchNameToIdText('Juan Miguel Santos', misread)).toBe('match');
});

test('finds words OCR ran together', () => {
  expect(matchNameToIdText('Juan Delacruz', PHILSYS)).toBe('match');
  expect(matchNameToIdText('Maria Santos', 'REPUBLIC OF THE PHILIPPINES DRIVER LICENSE MARIASANTOS 1990')).toBe('match');
});

test('does not match a different person', () => {
  expect(matchNameToIdText('Pedro Reyes', PHILSYS)).toBe('mismatch');
  expect(matchNameToIdText('Maria Clara Reyes', PHILSYS)).toBe('mismatch');
});

test('treats very little text as unreadable', () => {
  expect(matchNameToIdText('Juan Dela Cruz', '  ~ .. ,,  ')).toBe('unreadable');
  expect(matchNameToIdText('Juan Dela Cruz', 'JUAN 12 x')).toBe('unreadable');
});
