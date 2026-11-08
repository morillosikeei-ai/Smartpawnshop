# PSGC address list

Provinces, cities/municipalities and barangays for the customer address
fields, from the Philippine Statistics Authority's Philippine Standard
Geographic Code (PSGC), downloaded from the psgc.gitlab.io mirror on
2026-10-28: 81 provinces, 1,634 cities and municipalities, 42,046 barangays.

- `provinces.json`: `[{code, name}]`, sorted by name. Metro Manila is added
  with the code `NCR`, since its cities have no province.
- `cities.json`: `{provinceCode: [{code, name}]}`. NCR cities are under `NCR`.
  The two independent cities without a province code are placed in the
  province they sit in: City of Isabela under Basilan, City of Cotabato under
  Maguindanao.
- `barangays/<cityCode>.json`: barangay names for one city or municipality.

Read through `App\Support\Psgc`. To refresh, download
`https://psgc.gitlab.io/api/{provinces,cities-municipalities,barangays}/`
and rebuild these files in the same shape.
