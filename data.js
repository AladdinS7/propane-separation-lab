import { DEFAULT_INPUTS, validateInputs } from './model.js';

const CASE_FIELDS = Object.keys(DEFAULT_INPUTS);
const MAX_CASE_LENGTH = 100_000;

function checkedInputs(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('A case must contain a JSON input object or a CSV header and one numeric data row.');
  }
  const inputs = Object.fromEntries(CASE_FIELDS.map(field => [
    field, field === 'stages' && !Object.hasOwn(source, field) ? 8 : source[field],
  ]));
  const validation = validateInputs(inputs);
  if (!validation.valid) throw new Error(validation.errors.map(error => error.message).join(' '));
  return inputs;
}

// Small RFC-style CSV parser: quotes can contain commas/newlines and escape as "".
// The case format still requires exactly one header row and one data row.
function csvRows(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  let closedQuote = false;
  const endField = () => { row.push(value); value = ''; closedQuote = false; };
  const endRow = () => { endField(); rows.push(row); row = []; };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { value += '"'; index++; }
        else { quoted = false; closedQuote = true; }
      } else value += char;
    } else if (char === ',') endField();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      endRow();
    } else if (char === '"') {
      if (value.trim() !== '' || closedQuote) throw new Error('Malformed CSV: quotes must enclose a whole field.');
      value = '';
      quoted = true;
    } else {
      if (closedQuote && char.trim() !== '') throw new Error('Malformed CSV: unexpected text after a quoted field.');
      if (!closedQuote) value += char;
    }
  }
  if (quoted) throw new Error('Malformed CSV: an opening quote has no closing quote.');
  if (value !== '' || row.length > 0 || closedQuote) endRow();
  return rows;
}

function parseCsv(text) {
  const rows = csvRows(text.trim());
  if (rows.length !== 2) throw new Error('CSV must contain a header row and exactly one data row.');
  const headers = rows[0].map(header => header.trim());
  if (headers.some(header => !header)) throw new Error('CSV column names cannot be blank.');
  if (new Set(headers).size !== headers.length) throw new Error('CSV column names must be unique.');
  if (headers.length !== rows[1].length) throw new Error('CSV header and data row must have the same number of columns.');
  const source = {};
  headers.forEach((header, index) => {
    if (!CASE_FIELDS.includes(header)) return;
    const value = rows[1][index].trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
      throw new Error(`CSV field ${header} must contain a number.`);
    }
    source[header] = Number(value);
  });
  return checkedInputs(source);
}

/** Import only known numeric model fields. Unknown prose is data and is ignored. */
export function parseCase(text, filename = 'case.json') {
  if (typeof text !== 'string') throw new Error('Case content must be text.');
  if (text.length > MAX_CASE_LENGTH) throw new Error('Case file is too large. Use at most 100,000 characters.');
  const clean = text.replace(/^\uFEFF/, '').trim();
  if (!clean) throw new Error('The case file is empty.');
  if (typeof filename !== 'string') throw new Error('The case filename must be text.');
  if (/\.csv$/i.test(filename)) return parseCsv(clean);
  let parsed;
  try { parsed = JSON.parse(clean); }
  catch { throw new Error('Invalid JSON. Import a numeric input object, an object containing inputs, or a one-row CSV file.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('A JSON case must be an object containing numeric input fields.');
  }
  return checkedInputs(Object.hasOwn(parsed, 'inputs') ? parsed.inputs : parsed);
}

/** Serialize a validated case; metadata records its educational approximation. */
export function encodeCase(inputs) {
  return JSON.stringify({
    schemaVersion: 1,
    model: 'Ideal propane/n-butane flash with free-water separation and assumed tower component splits',
    inputs: checkedInputs(inputs),
  }, null, 2) + '\n';
}

function csvCell(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Export mol/h and mol%; absent-phase composition cells are intentionally blank. */
export function streamsCsv(result) {
  if (!Array.isArray(result?.streams)) throw new Error('Provide simulation streams to export.');
  const rows = [['stream', 'flow_mol_h', 'propane_mol_percent', 'butane_mol_percent', 'water_mol_percent']];
  for (const stream of result.streams) {
    if (!Number.isFinite(stream.total) || stream.total < 0) throw new Error('A stream has an invalid flow.');
    const fractions = ['propane', 'butane', 'water'].map(component => {
      if (stream.total === 0) return '';
      const fraction = stream.fractions?.[component];
      if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new Error('A stream has an invalid composition.');
      return Number((100 * fraction).toPrecision(12));
    });
    rows.push([stream.label || stream.id, Number(stream.total.toPrecision(12)), ...fractions]);
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Entered costs only: kW × currency/kWh × hours, plus annualized capital/fixed costs. */
export function annualizedCost(a) {
  const keys = ['capitalCost', 'capitalRecoveryFactor', 'hoursPerYear', 'thermalDuty',
    'electricLoad', 'heatPrice', 'electricityPrice', 'fixedOpex'];
  for (const key of keys) {
    const value = a?.[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`${key} must be a finite, nonnegative number.`);
    }
    if (value > 1e12) throw new Error(`${key} exceeds the supported scenario limit of 1,000,000,000,000.`);
  }
  if (a.capitalRecoveryFactor > 1) throw new Error('Capital recovery factor must be between 0 and 1.');
  if (a.hoursPerYear > 8760) throw new Error('Annual operating hours must be between 0 and 8,760.');
  const annualCapital = a.capitalCost * a.capitalRecoveryFactor;
  const annualHeat = a.thermalDuty * a.heatPrice * a.hoursPerYear;
  const annualElectricity = a.electricLoad * a.electricityPrice * a.hoursPerYear;
  const annualFixed = a.fixedOpex;
  const total = annualCapital + annualHeat + annualElectricity + annualFixed;
  if (![annualCapital, annualHeat, annualElectricity, annualFixed, total].every(value => Number.isFinite(value) && value <= 1e15)) {
    throw new Error('The annualized cost exceeds the supported scenario limit. Check input units and magnitudes.');
  }
  return { annualCapital, annualHeat, annualElectricity, annualFixed, total };
}
