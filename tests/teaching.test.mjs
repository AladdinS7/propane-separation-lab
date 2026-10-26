import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_INPUTS, simulate, validateInputs } from '../model.js';
import { reviewCase, calculateReliability, RELIABILITY_DEFAULTS, RELIABILITY_PARTS, calculateStageStudy, explainInputErrors, CODE_STEPS, extractExcerpt } from '../teaching.js';
import { LESSONS, GLOSSARY } from '../lessons.js';
const near = (a, b, tolerance = 1e-12) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const components = RELIABILITY_PARTS.map(p => ({ ...p, mttf: RELIABILITY_DEFAULTS[p.id] }));

test('review preserves user values, explains phase endpoints, and refuses invalid cases', () => {
  const input = { ...DEFAULT_INPUTS, pressure: 3 };
  const original = structuredClone(input);
  const review = reviewCase(input);
  assert.deepEqual(input, original);
  assert.deepEqual(review.result.inputs, input);
  assert.equal(review.result.phase, 'all-vapor');
  assert.ok(review.notes.some(n => n.includes('idle')));
  assert.equal(reviewCase({ ...input, propane: 75 }).valid, false);
  assert.ok(reviewCase({ ...input, flow: 0 }).notes.some(n => n.includes('Zero feed')));
  assert.ok(reviewCase({ ...DEFAULT_INPUTS, c3Recovery: 5, c4Carryover: 95 }).notes.some(n => n.includes('do not preferentially')));
});

test('suggested pressure yields two flowing HC phases and changes only pressure', () => {
  for (const temperature of [5, 25, 55, 85]) for (const propane of [1, 25, 50, 79]) for (const pressure of [.5, 30]) {
    const input = { ...DEFAULT_INPUTS, temperature, propane, butane: 80 - propane, pressure };
    const review = reviewCase(input);
    const suggestion = review.suggestion.inputs;
    assert.equal(validateInputs(suggestion).valid, true);
    if (review.suggestion.title.startsWith('Try ')) {
      assert.equal(simulate(suggestion).phase, 'two-phase');
      assert.deepEqual({ ...suggestion, pressure }, input);
    }
  }
  for (const changes of [{ flow: 0 }, { propane: 0, butane: 0, water: 100 }, { propane: 100, butane: 0, water: 0 }]) assert.equal(validateInputs(reviewCase({ ...DEFAULT_INPUTS, ...changes }).suggestion.inputs).valid, true);
});

test('failure probabilities reproduce analytical examples and independent series survival', () => {
  near(calculateReliability(1000, [{ id: 'pump', mttf: 40000 }]).probability, 0.024690087971667385);
  const r = calculateReliability(1000, components);
  near(r.probability, 1 - Math.exp(-.0475));
  near(r.survival, r.parts.reduce((product, part) => product * (1 - part.probability), 1));
  near(r.meanTimeToFirstFailure, 1 / (1/40000 + 1/80000 + 1/100000), 1e-8);
  assert.ok(r.probability < r.parts.reduce((sum, part) => sum + part.probability, 0));
  assert.ok(r.probability >= Math.max(...r.parts.map(p => p.probability)));
});

test('reliability handles zero time, small probabilities, saturation, and monotonicity', () => {
  assert.equal(calculateReliability(0, components).probability, 0);
  assert.equal(calculateReliability(0, components).survival, 1);
  const tiny = calculateReliability(1e-9, [{ id: 'a', mttf: 1e9 }]).probability;
  assert.ok(tiny > 0); near(tiny, 1e-18, 1e-30);
  assert.equal(calculateReliability(1e6, [{ id: 'a', mttf: 1 }]).probability, 1);
  let previous = -1;
  for (let t = 0; t <= 100000; t += 1000) {
    const r = calculateReliability(t, components);
    assert.ok(r.probability >= previous && r.probability <= 1);
    near(r.probability + r.survival, 1);
    previous = r.probability;
  }
  assert.ok(calculateReliability(8000, components).probability > calculateReliability(1000, components).probability);
  assert.ok(calculateReliability(1000, components.slice(0, 1)).probability < calculateReliability(1000, components).probability);
});

test('reliability rejects undefined events and invalid durations or lifetimes', () => {
  for (const hours of [-1, 1000001, NaN, Infinity, '1000', null]) assert.throws(() => calculateReliability(hours, components), RangeError);
  for (const parts of [[], null, [null], [{ id: 'p', mttf: 0 }], [{ id: 'p', mttf: -1 }], [{ id: 'p', mttf: NaN }], [{ id: 'p', mttf: Infinity }], [{ id: 'p', mttf: 1e10 }], [{ id: 'p', mttf: '1000' }], [{ id: 'p', mttf: 1000 }, { id: 'p', mttf: 2000 }]]) assert.throws(() => calculateReliability(1000, parts), RangeError);
});

test('editable stages reproduce Fenske and change the ideal limit while preserving specified splits', () => {
  const two = simulate({ ...DEFAULT_INPUTS, stages: 2 }), eight = simulate(DEFAULT_INPUTS);
  const a = calculateStageStudy(two), b = calculateStageStudy(eight);
  assert.ok(a.available && b.available);
  near(a.minimumStages, Math.log(361) / Math.log(a.alpha));
  near(a.limitPurity / (1 - a.limitPurity), a.xB / (1 - a.xB) * a.alpha ** 2, 1e-10);
  assert.ok(b.limitPurity > a.limitPurity);
  assert.equal(a.meetsIdealLimit, false); assert.equal(b.meetsIdealLimit, true);
  assert.deepEqual(two.streams, eight.streams);
  assert.equal(b.points.length, 9);
  for (let n = 1; n <= 40; n++) {
    const study = calculateStageStudy(simulate({ ...DEFAULT_INPUTS, stages: n }));
    assert.equal(study.points.length, n + 1);
    for (let i = 1; i < study.points.length; i++) assert.ok(study.points[i].propaneFraction >= study.points[i - 1].propaneFraction && study.points[i].propaneFraction <= 1);
  }
});

test('stage study explains idle, non-enriching, pure-product and missing-product endpoints', () => {
  for (const changes of [{ flow: 0 }, { pressure: .5 }, { c3Recovery: 0, c4Carryover: 0 }, { c3Recovery: 100, c4Carryover: 100 }, { c3Recovery: 100, c4Carryover: 0 }, { c3Recovery: 10, c4Carryover: 95 }, { propane: 100, butane: 0, water: 0, pressure: 30 }]) {
    const study = calculateStageStudy(simulate({ ...DEFAULT_INPUTS, ...changes }));
    assert.equal(study.available, false);
    assert.ok(study.reason.length > 20);
  }
  assert.throws(() => calculateStageStudy({ inputs: { stages: 2.5 } }), RangeError);
});

test('every invalid process field has a useful explanation and correction', () => {
  assert.deepEqual(explainInputErrors(DEFAULT_INPUTS), []);
  for (const changes of [{ flow: -1 }, { propane: 101 }, { water: 0 }, { temperature: 100 }, { pressure: 0 }, { c3Recovery: -5 }, { c4Carryover: 105 }, { stages: 1.5 }, { flow: NaN }]) {
    const errors = explainInputErrors({ ...DEFAULT_INPUTS, ...changes });
    assert.ok(errors.length > 0);
    for (const error of errors) for (const field of ['rule', 'reason', 'fix']) assert.ok(error.explanation[field].length > 20);
  }
});

test('every code walkthrough excerpt resolves to the actual served source', async () => {
  for (const step of CODE_STEPS) {
    const source = await readFile(new URL(`../${step.file}`, import.meta.url), 'utf8');
    const excerpt = extractExcerpt(source, step);
    assert.ok(excerpt.line > 0 && excerpt.text.length > 100);
    assert.equal(source.split('\n')[excerpt.line - 1], excerpt.text.split('\n')[0]);
    assert.ok(excerpt.text.startsWith(step.start));
  }
  assert.throws(() => extractExcerpt('no source', CODE_STEPS[0]), /unavailable/);
});

test('lesson checks are complete and glossary can be searched without external services', () => {
  assert.equal(LESSONS.length, 8);
  for (const lesson of LESSONS) {
    assert.ok(lesson.answer >= 0 && lesson.answer < lesson.choices.length);
    assert.equal(new Set(lesson.choices).size, lesson.choices.length);
    assert.ok(lesson.feedback.length > 30);
    assert.ok(['baseline','tower','simulation','analysis','code','reliability'].includes(lesson.action));
  }
  assert.equal(new Set(GLOSSARY.map(term => term[0])).size, GLOSSARY.length);
});
