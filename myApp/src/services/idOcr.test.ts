import { matchBirthdateToIdText, matchIdNumberToIdText, matchNameToIdText, normalizeText, parseIdText } from './idOcr';

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

describe('parseIdText', () => {
  test('reads a PhilSys card', () => {
    const text = `${PHILSYS}
1234-5678-9012-3456
Tirahan/Address
123 RIZAL ST, BRGY SAN ISIDRO
CEBU CITY, CEBU`;
    expect(parseIdText(text)).toEqual({
      idType: 'National ID',
      fullName: 'Juan Miguel Santos Dela Cruz',
      idNumber: '1234-5678-9012-3456',
      address: '123 Rizal St, Brgy San Isidro, Cebu City, Cebu',
      birthdate: '1990-01-01',
    });
  });

  test("reads a driver's license name line and number", () => {
    const text = `REPUBLIC OF THE PHILIPPINES
LAND TRANSPORTATION OFFICE
NON-PROFESSIONAL DRIVER'S LICENSE
Last Name, First Name, Middle Name
REYES, MARIA CLARA LOPEZ
License No. N01-23-456789`;
    const fields = parseIdText(text);
    expect(fields.idType).toBe("Driver's License");
    expect(fields.fullName).toBe('Maria Clara Lopez Reyes');
    expect(fields.idNumber).toBe('N01-23-456789');
  });

  test('reads a passport machine readable line', () => {
    const text = `PASAPORTE PASSPORT
P<PHLDELA<CRUZ<<JUAN<MIGUEL<<<<<<<<<<<<<<<<<
P1234567A7PHL9001013M3001015<<<<<<<<<<<<<<04`;
    const fields = parseIdText(text);
    expect(fields.idType).toBe('Passport');
    expect(fields.fullName).toBe('Juan Miguel Dela Cruz');
    expect(fields.idNumber).toBe('P1234567A');
  });

  test('reads dashes that OCR turned into spaces', () => {
    expect(parseIdText('UNIFIED MULTI-PURPOSE ID\nCRN 0111 2345678 9').idNumber).toBe('0111-2345678-9');
  });

  test('returns nothing it cannot find', () => {
    expect(parseIdText('blurry %% text')).toEqual({});
  });
});

test('a wrong first name does not match, even with the right surname', () => {
  const mary = PHILSYS.replace('JUAN MIGUEL', 'MARY');
  expect(matchNameToIdText('Merry Dela Cruz', mary)).toBe('mismatch');
  expect(matchNameToIdText('Mery Dela Cruz', mary)).toBe('mismatch');
  expect(matchNameToIdText('Mary Dela Cruz', mary)).toBe('match');
});

test('every word of the name must be on the ID', () => {
  expect(matchNameToIdText('Juan Pedro Dela Cruz', PHILSYS)).toBe('mismatch');
  expect(matchNameToIdText('Juan Miguel Dela Cruz', PHILSYS)).toBe('match');
});

test('the date of birth is found in the layouts IDs print it in', () => {
  expect(matchBirthdateToIdText('1990-01-01', PHILSYS)).toBe('match');
  expect(matchBirthdateToIdText('1990-01-02', PHILSYS)).toBe('mismatch');
  const license = 'REPUBLIC OF THE PHILIPPINES LAND TRANSPORTATION OFFICE DELA CRUZ, JUAN Date of Birth 1990/01/15';
  expect(matchBirthdateToIdText('1990-01-15', license)).toBe('match');
  const passport = 'REPUBLIKA NG PILIPINAS PASSPORT DELA CRUZ JUAN Date of birth 15 JAN 1990';
  expect(matchBirthdateToIdText('1990-01-15', passport)).toBe('match');
});

test('the ID number must be on the ID, ignoring dashes and OCR lookalikes', () => {
  const card = `${PHILSYS}\nPCN 1234-5678-9012-3456`;
  expect(matchIdNumberToIdText('1234 5678 9012 3456', card)).toBe('match');
  expect(matchIdNumberToIdText('1234-5678-9012-3457', card)).toBe('mismatch');
  expect(matchIdNumberToIdText('1234-5678-9012-3456', card.replace('1234-5678', 'I234-5678'))).toBe('match');
});

test('reads the date of birth for autofill', () => {
  expect(parseIdText(PHILSYS).birthdate).toBe('1990-01-01');
  expect(parseIdText('LAND TRANSPORTATION OFFICE DELA CRUZ, JUAN Date of Birth 1990/01/15 Expiration 2030/01/15').birthdate).toBe('1990-01-15');
});
