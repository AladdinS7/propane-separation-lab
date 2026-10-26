import { DEFAULT_INPUTS, simulate, validateInputs, vaporPressure } from './model.js';

export const FIELD_HELP = {
  flow: ['How much enters?', 'Moles count molecules. A flow of 100 mol/h means 100 moles of mixture arrive each hour. Start at 100: the percentage of each component then equals its mol/h. Flow scales the streams; it does not change the ideal phase split.'],
  propane: ['Propane · the component we want', 'C₃H₈ is the lighter hydrocarbon. Enter its share of all feed molecules, including water. Try 50 mol %. All three feed percentages must add to 100.'],
  butane: ['n-Butane · the heavier companion', 'C₄H₁₀ is less volatile than propane: it prefers the liquid more strongly. Including both hydrocarbons makes the flash and recovery tower useful to explore. Try 30 mol %.'],
  water: ['Water · a separate liquid route', 'Try 20 mol %. The ideal model sends all water to the bottom outlet. Real systems can have dissolved hydrocarbons, water vapor, and droplets carried into other streams. Those effects are omitted here.'],
  temperature: ['Temperature · how warm is the flash?', 'Use 5–85 °C, the teaching model’s range. At fixed pressure, warming generally increases vapor formation. Start at 25 °C. This is a chosen vessel temperature; the model does not calculate heating or cooling duty.'],
  pressure: ['Pressure · how strongly is the fluid compressed?', 'Use 0.5–30 bar absolute. Absolute pressure is measured from vacuum; gauge pressure is measured from the surrounding atmosphere. Enter absolute pressure here. At 25 °C, try 3, 6, and 12 bar to compare routes. These are model limits, not equipment ratings.'],
  c3Recovery: ['How much tower propane goes overhead?', '95% means 95 of every 100 moles of propane entering the tower leave in its overhead. It does not mean the product is 95% pure. This is an assumed split, not a predicted column performance.'],
  c4Carryover: ['How much butane follows the propane?', 'Try 5%. Lower butane carryover usually makes the overhead richer in propane. Propane recovery must exceed butane carryover to enrich a mixed condensate. The model does not calculate how many trays or how much energy achieves either split.'],
  stages: ['Equilibrium stages · an ideal separation study', 'Enter a whole number from 1 to 40. One ideal stage brings leaving vapor and liquid into equilibrium. The separate Fenske study shows how stage count changes the total-reflux separation limit. It does not override the specified stream splits. Count an equilibrium reboiler as a stage; a total condenser is not counted.'],
};

export const INPUT_EXPLANATIONS = {
  flow: { title: 'Why can’t I enter a negative or enormous flow?', rule: '0 to 1,000,000 mol/h; a finite number is required.', reason: 'The inlet flow is defined as material entering in a fixed direction. A negative value would reverse that definition. The upper bound is an interface and numerical limit for this teaching app, not a known plant capacity. Zero is allowed and means an idle process.', fix: 'Check mol/h versus kmol/h: 1 kmol/h = 1,000 mol/h. Use a supported molar basis. Do not interpret the upper limit as an equipment rating.' },
  composition: { title: 'Why must the feed add to exactly 100%?', rule: 'Each component must be 0–100 mol %, with a combined total of 100%.', reason: 'Mole percentages describe parts of one whole feed. Totals below 100% leave some material unidentified; totals above 100% count more than the whole. The app does not silently rescale an incorrect mixture.', fix: 'Choose two percentages and set the third to 100 minus their sum. Example: 50% propane + 30% n-butane + 20% water. A tiny rounding tolerance of 0.000001 percentage points is accepted.' },
  temperature: { title: 'Why only 5–85 °C?', rule: 'The model accepts temperatures from 5 to 85 °C.', reason: 'The selected NIST Antoine correlations have fitted temperature ranges. The app uses a shared, conservative interval inside those ranges. Outside it, extrapolating the same equations could give misleading vapor pressures.', fix: 'Check that you entered °C, not kelvin or °F. To study a real condition outside this range, use appropriate property data and a validated model; do not simply change a real process temperature to satisfy the website.' },
  pressure: { title: 'Why is zero or negative pressure rejected?', rule: '0.5–30 bar absolute; not gauge pressure.', reason: 'Absolute pressure starts at vacuum. Negative absolute pressure is invalid for this gas model, and zero would cause division by zero in K = Psat/P. The 0.5–30 bar range is the app’s exploration range. It does not certify safe pressure or accurate real-fluid behavior across that range.', fix: 'Convert gauge pressure by adding the local atmospheric pressure in the same units. Do not assume bar gauge and bar absolute are interchangeable. Above 10 bar, the app flags the ideal-equilibrium approximation.' },
  tower: { title: 'Why can’t recovery or carryover exceed 100%?', rule: 'Both tower component splits must be 0–100%.', reason: 'A split is the share of that component sent to one outlet. More than 100% would create material; a negative split would produce a negative component flow. Any percentage within the range is accepted, even if it gives poor separation.', fix: '95% C₃ recovery means 95% of tower-feed propane goes overhead; it does not prescribe 95% product purity. C₃ recovery should exceed C₄ carryover to enrich a mixed condensate, but you can run other valid splits to learn why they perform poorly.' },
  stages: { title: 'Why are stages whole numbers from 1 to 40?', rule: 'The stage-count control accepts integers 1–40.', reason: 'This control represents a chosen count of ideal equilibrium contacts, so the app uses whole stages. Fenske’s calculated minimum may be fractional; round it up when choosing a count. Forty is an interface limit, not a universal maximum for real towers.', fix: 'Use 1, 2, 3, …, 40. Compare the ideal stage-study curve after running. An equilibrium reboiler counts as one stage; a total condenser does not. Real tray efficiency and finite reflux require additional design calculations.' },
  number: { title: 'Why must every field contain a number?', rule: 'No blanks, text, infinity, or undefined numeric values.', reason: 'The equations need complete inputs. Treating a blank as zero would silently change the scenario. Invalid imported data are rejected before being applied.', fix: 'Enter a number in every required field. Put only the number in the field; units are already displayed beside it. Imported JSON values must be numeric rather than quoted text.' },
  reliability: { title: 'Why can’t I enter zero lifetime or select no components?', rule: 'Mission: 0–1,000,000 h. Selected MTTF: 1–1,000,000,000 h. Select at least one component.', reason: 'The failure rate is 1/MTTF; zero would divide by zero, and a negative lifetime has no meaning. No selection defines no modeled failure events, so the app asks for a selection instead of presenting a misleading zero-risk result. These bounds are software limits.', fix: 'Use a positive MTTF and label its evidence or assumption. A zero-hour mission is allowed and has zero first-failure probability at the starting instant under the model.' },
};

export function explainInputErrors(inputs) {
  return validateInputs(inputs).errors.map(error => {
    const key = error.field === 'composition' || ['propane', 'butane', 'water'].includes(error.field) ? 'composition' : ['c3Recovery', 'c4Carryover'].includes(error.field) ? 'tower' : error.field;
    const explanation = /finite number|complete input/.test(error.message) ? INPUT_EXPLANATIONS.number : INPUT_EXPLANATIONS[key] || INPUT_EXPLANATIONS.number;
    return { ...error, explanation };
  });
}

/** Fenske total-reflux limit, kept separate from flowing material-balance products. */
export function calculateStageStudy(result) {
  const stages = result?.inputs?.stages;
  if (!Number.isInteger(stages) || stages < 1 || stages > 40) throw new RangeError('Choose 1–40 whole equilibrium stages.');
  const product = result.streams.find(s => s.id === 'product'), bottoms = result.streams.find(s => s.id === 'bottoms');
  const alpha = result.K.propane / result.K.butane;
  const xD = product.fractions.propane, xB = bottoms.fractions.propane;
  if (!product.available || !bottoms.available || !(xB > 0 && xB < 1 && xD > xB && xD < 1) || !(alpha > 1)) {
    return { available: false, stages, reason: 'The study needs two flowing tower products, each containing both hydrocarbons, and an overhead richer in propane than the bottoms. Try the baseline 95/5 splits with a flowing condensate.' };
  }
  const logOdds = x => Math.log(x) - Math.log1p(-x);
  const minimumStages = (logOdds(xD) - logOdds(xB)) / Math.log(alpha);
  const points = Array.from({ length: stages + 1 }, (_, stage) => ({ stage, propaneFraction: 1 / (1 + Math.exp(-(logOdds(xB) + stage * Math.log(alpha)))) }));
  return { available: true, stages, alpha, xD, xB, minimumStages, roundedMinimum: Math.ceil(minimumStages), limitPurity: points.at(-1).propaneFraction, points, meetsIdealLimit: stages >= minimumStages };
}

/** Advise without silently altering a valid user case. */
export function reviewCase(inputs) {
  const validation = validateInputs(inputs);
  if (!validation.valid) return { valid: false, errors: validation.errors };
  const result = simulate(inputs);
  const phase = { 'two-phase': 'Hydrocarbon vapor + liquid', 'all-vapor': 'All hydrocarbons are vapor', 'all-liquid': 'All hydrocarbons are liquid', 'no-hydrocarbons': 'No flowing hydrocarbons' }[result.phase];
  const notes = [];
  if (inputs.flow === 0) notes.push('Zero feed means zero outlet flow. Try a positive flow to see separation.');
  else if (result.phase === 'all-vapor') notes.push('The top gas carries all hydrocarbons. The condensate and tower are idle. Increase pressure or reduce temperature to explore liquid formation.');
  else if (result.phase === 'all-liquid') notes.push('The top gas has zero flow. All hydrocarbons go to the tower. Reduce pressure or increase temperature to explore vapor formation.');
  else if (result.phase === 'no-hydrocarbons') notes.push('This is a water-only case. Add propane and n-butane to explore hydrocarbon separation.');
  else notes.push('Both hydrocarbon phases flow. Compare the top gas with the liquid entering the tower.');
  if (inputs.propane === 0) notes.push('There is no feed propane, so propane recovery is undefined.');
  if (inputs.water === 0) notes.push('The bottom water outlet will be idle because the feed contains no water.');
  if (inputs.c3Recovery <= inputs.c4Carryover) notes.push('These tower splits do not preferentially recover propane from a mixed condensate. For a teaching example, compare 95% propane recovery with 5% butane carryover.');
  notes.push('Recovery measures how much feed propane you collect. Purity measures how much of a particular product is propane. Check both; a high recovery alone is not a product specification.');
  if (inputs.pressure > 10) notes.push('Above 10 bar, ideal equilibrium can differ substantially from real behavior. This feedback is about model accuracy, not a mechanical pressure rating.');
  let suggestion = { inputs: { ...DEFAULT_INPUTS }, title: 'Start with the teaching example', reason: 'Loads the complete 100 mol/h, 50/30/20 mol %, 25 °C, 6 bar example with 95/5 tower splits.' };
  if (inputs.flow > 0 && inputs.propane > 0 && inputs.butane > 0 && result.phase !== 'two-phase') {
    const z = inputs.propane / (inputs.propane + inputs.butane);
    const p3 = vaporPressure('propane', inputs.temperature), p4 = vaporPressure('butane', inputs.temperature);
    const dew = 1 / (z / p3 + (1 - z) / p4), bubble = z * p3 + (1 - z) * p4;
    const low = Math.max(0.5, dew), high = Math.min(30, bubble);
    if (high > low) {
      const pressure = (low + high) / 2;
      const proposed = { ...inputs, pressure };
      if (simulate(proposed).phase === 'two-phase') suggestion = { inputs: proposed, title: `Try ${pressure.toFixed(3)} bar for two flowing HC phases`, reason: 'Changes only pressure to the midpoint of the ideal two-phase pressure interval within this model’s range. This is a learning comparison, not an optimum or an equipment recommendation.' };
    }
  }
  return { valid: true, result, phase, notes, suggestion };
}

export const RELIABILITY_DEFAULTS = Object.freeze({ hours: 1000, pump: 40000, valve: 80000, sensor: 100000 });
export const RELIABILITY_PARTS = Object.freeze([
  { id: 'pump', label: 'Condensate pump' }, { id: 'valve', label: 'Level-control valve' }, { id: 'sensor', label: 'Pressure instrument' },
]);

/** Constant-hazard, independent first failures. Values are teaching assumptions. */
export function calculateReliability(hours, components) {
  if (!Number.isFinite(hours) || hours < 0 || hours > 1e6) throw new RangeError('Mission time must be between 0 and 1,000,000 hours.');
  if (!Array.isArray(components) || components.length === 0) throw new RangeError('Select at least one component to estimate a first-failure probability.');
  if (new Set(components.map(c => c?.id)).size !== components.length) throw new RangeError('Select each component only once.');
  const parts = components.map(component => {
    if (!component || typeof component.id !== 'string' || !component.id || !Number.isFinite(component.mttf) || component.mttf < 1 || component.mttf > 1e9) throw new RangeError('Each selected mean time to first failure must be between 1 and 1,000,000,000 hours.');
    const rate = 1 / component.mttf;
    return { ...component, rate, probability: -Math.expm1(-hours * rate) };
  });
  const totalRate = parts.reduce((sum, part) => sum + part.rate, 0);
  return { hours, parts, totalRate, probability: -Math.expm1(-hours * totalRate), survival: Math.exp(-hours * totalRate), meanTimeToFirstFailure: 1 / totalRate };
}

export const CODE_STEPS = [
  { title: '1. Check the inputs', file: 'model.js', start: 'export function validateInputs', end: '\nfunction requireValid', explanation: 'Every input must be a finite number inside its range, and the three feed percentages must add to 100. Validation returns useful errors before any calculation runs.', input: 'The numbers in the operating-case form', output: 'A valid flag and a list of field errors' },
  { title: '2. Estimate vapor pressure', file: 'model.js', start: 'export function vaporPressure', end: '\nfunction hydrocarbonFlash', explanation: 'Convert Celsius to kelvin and evaluate the Antoine correlation. The flash divides each saturation pressure by vessel pressure to obtain K. A larger K means stronger preference for vapor.', input: 'A component name and temperature in °C', output: 'Saturation pressure in bar' },
  { title: '3. Solve the flash', file: 'model.js', start: 'function hydrocarbonFlash', end: '\nexport function simulate', explanation: 'Check for no hydrocarbons and single-phase endpoints first. When both phases exist, bisection narrows the Rachford–Rice root between zero and one. Each liquid amount is its feed amount minus the vapor amount.', input: 'Hydrocarbon molar flows and K-values', output: 'Vapor fraction, phase label, gas and liquid flows' },
  { title: '4. Split the tower feed', file: 'model.js', start: "  const product = stream('product'", end: '\n  const streams =', explanation: 'Multiply each condensate component by its chosen overhead fraction. Subtract overhead from condensate to get bottoms. This code applies your tower assumptions; it does not solve distillation stages.', input: 'Condensate flows and the two assumed percentages', output: 'Tower overhead and bottoms component flows' },
  { title: '5. Check the balance', file: 'model.js', start: '  const terminalStreams =', end: '\n  const recoveredPropane =', explanation: 'Add the four final outlets: gas, water, tower overhead, and tower bottoms. Compare each component and the total against the feed. Condensate is internal, so adding it again would double-count material.', input: 'Feed and final outlet streams', output: 'Signed errors, maximum absolute error, and a closed flag' },
  { title: '6. Recalculate a sweep', file: 'model.js', start: 'export function generateSensitivity', explanation: 'Create evenly spaced pressure or temperature values and solve the entire model at each value. These are calculated cases, not a curve drawn between three guessed outcomes.', input: 'The current case, variable, range, and point count', output: 'An array of results for the analysis chart' },
  { title: '7. Estimate first failures', file: 'teaching.js', start: 'export function calculateReliability', end: '\nexport const CODE_STEPS', explanation: 'Turn each assumed mean time to first failure into a constant rate. Add independent rates and evaluate 1 − exp(−rate × time). Math.expm1 preserves precision for very small probabilities.', input: 'Mission hours and selected components’ assumed MTTFs', output: 'Component probabilities and probability of any listed first failure' },
  { title: '8. Explore ideal stages', file: 'teaching.js', start: 'export function calculateStageStudy', end: '\n/** Advise', explanation: 'Fenske relates the change in propane-to-butane odds to relative volatility raised to the number of ideal stages. We compare your selected count with the total-reflux minimum, keeping this limiting study separate from flowing stream balances.', input: 'Chosen stage count, reference product compositions, and constant relative volatility', output: 'Minimum stages and an ideal limiting composition curve' },
];

/** Select a documented excerpt from the same source served to the browser. */
export function extractExcerpt(source, step) {
  const start = source.indexOf(step.start);
  const end = step.end ? source.indexOf(step.end, start + step.start.length) : source.length;
  if (start < 0 || end < 0) throw new Error('Source excerpt unavailable. Open the complete source file instead.');
  const text = source.slice(start, end).trimEnd();
  return { text, line: source.slice(0, start).split('\n').length };
}
