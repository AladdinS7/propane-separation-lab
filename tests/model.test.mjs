import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_INPUTS, simulate, validateInputs, generateSensitivity, vaporPressure } from '../model.js';

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const byId = (result, id) => result.streams.find(s => s.id === id);

function verify(result) {
  assert.ok(result.balances.closed);
  assert.ok(result.balances.maxAbsoluteError <= Math.max(1, result.inputs.flow) * 1e-9);
  for (const stream of result.streams) {
    assert.ok(Number.isFinite(stream.total) && stream.total >= 0);
    near(Object.values(stream.components).reduce((a, b) => a + b, 0), stream.total, 1e-7);
    for (const component of ['propane', 'butane', 'water']) {
      assert.ok(Number.isFinite(stream.components[component]) && stream.components[component] >= 0);
      assert.ok(Number.isFinite(stream.fractions[component]) && stream.fractions[component] >= 0 && stream.fractions[component] <= 1);
    }
    near(Object.values(stream.fractions).reduce((a, b) => a + b, 0), stream.total > 0 ? 1 : 0);
  }
  for (const value of Object.values(result.metrics)) assert.ok(Number.isFinite(value) && value >= 0);
  for (const key of ['propaneRecovery', 'productPurity', 'flashVaporFraction', 'flashGasPurity', 'propaneFlashRecovery', 'towerPropaneRecovery', 'combinedProductPurity']) {
    assert.ok(result.metrics[key] <= 100);
  }
  const feed = byId(result, 'feed');
  for (const component of ['propane', 'butane', 'water']) {
    const out = ['flashGas', 'water', 'product', 'bottoms'].reduce((sum, id) => sum + byId(result, id).components[component], 0);
    near(out, feed.components[component], 1e-7);
    near(byId(result, 'product').components[component] + byId(result, 'bottoms').components[component], byId(result, 'condensate').components[component], 1e-7);
  }
}

test('default model has three separate outlets, correct connections, and closed component balances', () => {
  const result = simulate();
  verify(result);
  assert.equal(result.phase, 'two-phase');
  for (const id of ['flashGas', 'condensate', 'water']) assert.ok(byId(result, id).total > 0);
  assert.equal(byId(result, 'water').components.water, 20);
  assert.equal(byId(result, 'water').components.propane, 0);
  assert.equal(byId(result, 'condensate').components.water, 0);
  near(byId(result, 'product').components.propane, byId(result, 'condensate').components.propane * 0.95);
  near(byId(result, 'product').components.butane, byId(result, 'condensate').components.butane * 0.05);
});

test('vapor pressures reproduce NIST correlations and VLE satisfies equilibrium', () => {
  near(vaporPressure('propane', 25), 9.528109393221717, 1e-10);
  near(vaporPressure('butane', 25), 10 ** (4.35576 - 1175.581 / (298.15 - 2.071)), 1e-10);
  const r = simulate();
  for (const c of ['propane', 'butane']) near(byId(r, 'flashGas').fractions[c], r.K[c] * byId(r, 'condensate').fractions[c]);
  assert.throws(() => vaporPressure('water', 25), RangeError);
  assert.throws(() => vaporPressure('propane', 100), RangeError);
});

test('zero feed, pure water, pure propane, pure butane, and no-water endpoints remain valid', () => {
  const cases = [
    { flow: 0 },
    { propane: 0, butane: 0, water: 100 },
    { propane: 100, butane: 0, water: 0 },
    { propane: 0, butane: 100, water: 0 },
    { propane: 65, butane: 35, water: 0 },
    { propane: 100, butane: 0, water: 0, pressure: vaporPressure('propane', 25) },
  ];
  for (const changes of cases) verify(simulate({ ...DEFAULT_INPUTS, ...changes }));
  const pure = simulate({ ...DEFAULT_INPUTS, propane: 100, butane: 0, water: 0 });
  assert.equal(pure.phase, 'all-vapor');
  assert.equal(byId(pure, 'condensate').total, 0);
  assert.equal(byId(pure, 'product').available, false);
  const saturation = simulate({ ...DEFAULT_INPUTS, propane: 100, butane: 0, water: 0, pressure: vaporPressure('propane', 25) });
  assert.equal(saturation.phase, 'all-liquid');
  assert.ok(saturation.warnings.some(w => w.includes('saturation')));
});

test('pressure moves the hydrocarbon flash through vapor, mixed, and liquid regions', () => {
  const low = simulate({ ...DEFAULT_INPUTS, pressure: 0.5 });
  const middle = simulate(DEFAULT_INPUTS);
  const high = simulate({ ...DEFAULT_INPUTS, pressure: 30 });
  assert.equal(low.phase, 'all-vapor');
  assert.equal(middle.phase, 'two-phase');
  assert.equal(high.phase, 'all-liquid');
  assert.ok(low.metrics.flashVaporFraction > middle.metrics.flashVaporFraction);
  assert.ok(middle.metrics.flashVaporFraction > high.metrics.flashVaporFraction);
  for (const r of [low, middle, high]) verify(r);
});

test('assumed component recoveries govern tower products; stage count never invents recovery', () => {
  const base = simulate();
  const stages = simulate({ ...DEFAULT_INPUTS, stages: 40 });
  assert.deepEqual(base.metrics, stages.metrics);
  assert.deepEqual(base.streams, stages.streams);
  assert.equal(stages.towerProfile.points.length, 40);
  assert.equal(stages.towerProfile.illustrative, true);
  for (const splits of [{ c3Recovery: 0, c4Carryover: 0 }, { c3Recovery: 100, c4Carryover: 100 }, { c3Recovery: 100, c4Carryover: 0 }, { c3Recovery: 0, c4Carryover: 100 }]) {
    verify(simulate({ ...DEFAULT_INPUTS, ...splits }));
  }
  near(simulate({ ...DEFAULT_INPUTS, c3Recovery: 100, c4Carryover: 0 }).metrics.productPurity, 100);
});

test('rejects invalid input without silently coercing or normalizing material errors', () => {
  for (const input of [null, [], {}, { ...DEFAULT_INPUTS, flow: NaN }, { ...DEFAULT_INPUTS, flow: Infinity },
    { ...DEFAULT_INPUTS, flow: -1 }, { ...DEFAULT_INPUTS, flow: '100' }, { ...DEFAULT_INPUTS, propane: 51 },
    { ...DEFAULT_INPUTS, temperature: 0 }, { ...DEFAULT_INPUTS, pressure: 0 },
    { ...DEFAULT_INPUTS, c3Recovery: 101 }, { ...DEFAULT_INPUTS, stages: 2.5 }]) {
    assert.equal(validateInputs(input).valid, false);
    assert.throws(() => simulate(input), RangeError);
  }
  assert.equal(validateInputs(DEFAULT_INPUTS).valid, true);
});

test('sensitivity is computed, monotonic for pressure vapor fraction, and range checked', () => {
  const sweep = generateSensitivity(DEFAULT_INPUTS, { variable: 'pressure', points: 41 });
  assert.equal(sweep.points.length, 41);
  near(sweep.points[0].value, 0.5);
  near(sweep.points.at(-1).value, 30);
  for (let i = 1; i < sweep.points.length; i++) assert.ok(sweep.points[i].flashVaporFraction <= sweep.points[i - 1].flashVaporFraction + 1e-10);
  assert.equal(generateSensitivity(DEFAULT_INPUTS, { variable: 'temperature' }).unit, '°C');
  assert.throws(() => generateSensitivity(DEFAULT_INPUTS, { min: 8, max: 2 }), RangeError);
  assert.throws(() => generateSensitivity(DEFAULT_INPUTS, { points: 1 }), RangeError);
  assert.throws(() => generateSensitivity(DEFAULT_INPUTS, { variable: 'stages' }), RangeError);
});

test('deterministic domain sample preserves all component balances and finite outputs', () => {
  let state = 123456789;
  const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 500; i++) {
    const propane = 100 * random();
    const butane = (100 - propane) * random();
    verify(simulate({ ...DEFAULT_INPUTS, flow: random() * 1e6, propane, butane, water: 100 - propane - butane,
      temperature: 5 + random() * 80, pressure: 0.5 + random() * 29.5,
      c3Recovery: random() * 100, c4Carryover: random() * 100, stages: 1 + Math.floor(random() * 40) }));
  }
});
