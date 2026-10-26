# Case files, exports, and displayed costs

`data.js` exports four pure functions. They throw an `Error` with a user-readable message when input is invalid.

## `parseCase(text, filename = 'case.json')`

Returns a validated object with exactly these numeric fields: `flow`, `propane`, `butane`, `water`, `temperature`, `pressure`, `c3Recovery`, `c4Carryover`, `stages`.

JSON may be a flat input object or `{ "inputs": { ... } }`. JSON numbers must be numeric values, not strings. A filename ending in `.csv` selects CSV parsing: exactly one header row and one data row, with case-sensitive field names matching those above. Quoted headers/numbers, scientific notation, CRLF/LF endings, and a leading BOM are supported. Unknown fields are ignored. Omitted `stages` defaults to 8; all other fields are required. The numeric domain and composition sum are checked by `validateInputs` in `model.js`. Files over 100,000 characters are rejected.

No imported prose is executed or treated as instructions. A case import only selects known numeric fields.

## `encodeCase(inputs)`

Returns formatted JSON text with `{ schemaVersion: 1, model: "…", inputs: { … } }`. Input validation is identical to import validation. Exported cases can be imported again without losing numeric inputs.

## `streamsCsv(result)`

Returns a CSV string from a `simulate()` result. The header is:

```csv
stream,flow_mol_h,propane_mol_percent,butane_mol_percent,water_mol_percent
```

Rows use descriptive stream labels and properly quote embedded punctuation. Flow is mol/h; compositions are mol%. Composition cells for zero-flow streams are blank because those phase compositions are unavailable. Values retain up to 12 significant digits.

## `annualizedCost(assumptions)`

Inputs:

| Field | Unit |
|---|---|
| `capitalCost` | Currency, entered installed capital assumption |
| `capitalRecoveryFactor` | Per year, between 0 and 1 |
| `hoursPerYear` | h/year, between 0 and 8,760 |
| `thermalDuty`, `electricLoad` | kW, entered utility assumptions |
| `heatPrice`, `electricityPrice` | Same currency/kWh |
| `fixedOpex` | Same currency/year |

Returns `{ annualCapital, annualHeat, annualElectricity, annualFixed, total }`, all in the selected currency per year. Capital is annualized by multiplication by the entered capital recovery factor. Each utility cost is power × unit energy price × annual operating hours. Fixed OpEx is added directly; total is the sum of those four annual costs.

For example, capital of 100,000 at a 0.15 factor, 8,000 h/year, 20 kW heat at 0.04/kWh, 5 kW electricity at 0.12/kWh, and 3,000 annual fixed costs give **29,200 per year**. Duties and capital are user assumptions: the model does not size equipment or solve an energy balance. Only the entered cost categories are included; this is not a vendor estimate or a profit calculation.

Every input must be finite, numeric, and nonnegative. Individual fields are capped at 10¹² and calculated annual amounts at 10¹⁵ to catch unreasonable magnitudes/unit mistakes. These are numerical interface bounds, not engineering or market limits.
