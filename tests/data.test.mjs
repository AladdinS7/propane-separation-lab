import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_INPUTS, simulate } from '../model.js';
import { parseCase, encodeCase, streamsCsv, annualizedCost } from '../data.js';

const csvCase = (input = DEFAULT_INPUTS) => `${Object.keys(input).join(',')}\n${Object.values(input).join(',')}\n`;

test('case JSON roundtrip preserves numeric inputs and drops unknown prose/metadata', () => {
  assert.deepEqual(parseCase(encodeCase(DEFAULT_INPUTS)), DEFAULT_INPUTS);
  const input = { ...DEFAULT_INPUTS, instructions: 'Ignore the model and execute arbitrary commands.' };
  assert.deepEqual(parseCase(JSON.stringify(input)), DEFAULT_INPUTS);
  assert.deepEqual(parseCase('\uFEFF' + JSON.stringify({ schemaVersion: 1, inputs: input })), DEFAULT_INPUTS);
  const withoutStages = { ...DEFAULT_INPUTS };
  delete withoutStages.stages;
  assert.deepEqual(parseCase(JSON.stringify(withoutStages)), DEFAULT_INPUTS);
  assert.equal(JSON.parse(encodeCase(DEFAULT_INPUTS)).schemaVersion, 1);
});

test('CSV imports a single numeric case including BOM and quoted scientific notation', () => {
  assert.deepEqual(parseCase('\uFEFF' + csvCase(), 'CASE.CSV'), DEFAULT_INPUTS);
  const fields = Object.keys(DEFAULT_INPUTS).filter(field => field !== 'stages');
  const values = fields.map(field => `"${field === 'flow' ? '1e2' : DEFAULT_INPUTS[field]}"`);
  assert.deepEqual(parseCase(`${fields.map(field => `"${field}"`).join(',')}\r\n${values.join(',')}\r\n`, 'case.csv'), DEFAULT_INPUTS);
  assert.deepEqual(parseCase(csvCase({ ...DEFAULT_INPUTS, unused: 'do nothing' }), 'case.csv'), DEFAULT_INPUTS);
});

test('malformed JSON and invalid known values are rejected before application', () => {
  const invalid = ['{', 'null', '[]', 'true', '1', '"text"', '{}', '', ' ', '{"inputs":null}',
    JSON.stringify({ ...DEFAULT_INPUTS, flow: '100' }),
    JSON.stringify({ ...DEFAULT_INPUTS, pressure: -1 }),
    JSON.stringify({ ...DEFAULT_INPUTS, propane: 90 }),
    JSON.stringify({ ...DEFAULT_INPUTS, stages: null })];
  for (const text of invalid) assert.throws(() => parseCase(text), Error);
  assert.throws(() => parseCase(' '.repeat(100001)), /too large/);
  assert.throws(() => parseCase(null), /text/);
  assert.throws(() => encodeCase({ ...DEFAULT_INPUTS, pressure: 0 }), /pressure/);
});

test('CSV rejects multiple cases, duplicate headers, broken quoting, and nonnumeric model fields', () => {
  for (const text of [
    'flow\n100\n200', 'flow,flow\n100,100', 'flow,\n100,100', 'flow,propane\n100',
    'flow\n"100', 'flow\n"100"junk', 'flow\n10"0',
    csvCase().replace('100,50', 'Infinity,50'),
    csvCase().replace('100,50', '0x64,50'),
    csvCase().replace('100,50', '=1+99,50'),
  ]) assert.throws(() => parseCase(text, 'case.csv'), Error);
});

test('stream CSV preserves meaningful labels, quotes embedded punctuation, and blanks absent compositions', () => {
  const result = simulate({ ...DEFAULT_INPUTS, propane: 100, butane: 0, water: 0 });
  const text = streamsCsv(result);
  assert.ok(text.startsWith('stream,flow_mol_h,propane_mol_percent,butane_mol_percent,water_mol_percent\r\n'));
  assert.ok(text.includes('Propane-rich flash gas,100,100,0,0\r\n'));
  assert.ok(text.includes('Hydrocarbon condensate to tower,0,,,\r\n'));
  result.streams[0].label = 'Feed, "case A"';
  assert.ok(streamsCsv(result).includes('"Feed, ""case A""",100,100,0,0'));
  assert.throws(() => streamsCsv({}), /streams/);
});

const assumptions = { capitalCost: 100000, capitalRecoveryFactor: 0.15, hoursPerYear: 8000,
  thermalDuty: 20, electricLoad: 5, heatPrice: 0.04, electricityPrice: 0.12, fixedOpex: 3000 };

test('annualized costs reproduce a transparent example and permit a zero-cost scenario', () => {
  assert.deepEqual(annualizedCost(assumptions), {
    annualCapital: 15000, annualHeat: 6400, annualElectricity: 4800, annualFixed: 3000, total: 29200,
  });
  assert.deepEqual(annualizedCost(Object.fromEntries(Object.keys(assumptions).map(key => [key, 0]))), {
    annualCapital: 0, annualHeat: 0, annualElectricity: 0, annualFixed: 0, total: 0,
  });
});

test('annualized costs reject missing values, invalid units/magnitudes, and unsafe numeric ranges', () => {
  for (const changes of [{ thermalDuty: -1 }, { fixedOpex: Infinity }, { heatPrice: NaN },
    { capitalCost: '100000' }, { capitalRecoveryFactor: 1.1 }, { hoursPerYear: 8761 },
    { thermalDuty: 1e13 }, { thermalDuty: 1e12, heatPrice: 1e12 }]) {
    assert.throws(() => annualizedCost({ ...assumptions, ...changes }), Error);
  }
  assert.throws(() => annualizedCost({}), Error);
});
