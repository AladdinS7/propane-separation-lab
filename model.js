/** Educational ideal hydrocarbon flash + free-water split. See docs/MODEL.md. */
export const DEFAULT_INPUTS = Object.freeze({
  flow: 100, propane: 50, butane: 30, water: 20,
  temperature: 25, pressure: 6, c3Recovery: 95, c4Carryover: 5, stages: 8,
});

export const INPUT_LIMITS = Object.freeze({
  flow: [0, 1e6], propane: [0, 100], butane: [0, 100], water: [0, 100],
  temperature: [5, 85], pressure: [0.5, 30], c3Recovery: [0, 100],
  c4Carryover: [0, 100], stages: [1, 40],
});

const COMPONENTS = ['propane', 'butane', 'water'];
// NIST Chemistry WebBook. log10(Psat/bar) = A - B/(T/K + C).
const ANTOINE = {
  propane: [4.53678, 1149.36, 24.906], // 277.6–360.8 K
  butane: [4.35576, 1175.581, -2.071], // 272.66–425 K
};

export function validateInputs(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: [{ field: 'inputs', message: 'Provide a complete input object.' }] };
  }
  for (const [field, [min, max]] of Object.entries(INPUT_LIMITS)) {
    const value = input[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push({ field, message: `${field} must be a finite number.` });
    } else if (value < min || value > max) {
      errors.push({ field, message: `${field} must be between ${min} and ${max}.` });
    }
  }
  if (Number.isFinite(input.stages) && !Number.isInteger(input.stages)) {
    errors.push({ field: 'stages', message: 'Stage count must be a whole number.' });
  }
  if (COMPONENTS.every(c => typeof input[c] === 'number' && Number.isFinite(input[c]))) {
    const sum = input.propane + input.butane + input.water;
    if (Math.abs(sum - 100) > 1e-6) {
      errors.push({ field: 'composition', message: `Feed composition totals ${sum.toFixed(3)}%; it must total 100%.` });
    }
  }
  return { valid: errors.length === 0, errors };
}

function requireValid(input) {
  const result = validateInputs(input);
  if (!result.valid) {
    const error = new RangeError(result.errors.map(e => e.message).join(' '));
    error.errors = result.errors;
    throw error;
  }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const percent = (part, total) => total > 0 ? clamp(100 * part / total, 0, 100) : 0;

function stream(id, label, propane = 0, butane = 0, water = 0) {
  const components = { propane, butane, water };
  const total = propane + butane + water;
  return {
    id, label, total, components, available: total > 0,
    fractions: Object.fromEntries(COMPONENTS.map(c => [c, total > 0 ? components[c] / total : 0])),
  };
}

export function vaporPressure(component, temperatureC) {
  if (!(component in ANTOINE)) throw new RangeError('Vapor pressure is available for propane and n-butane only.');
  if (!Number.isFinite(temperatureC) || temperatureC < 5 || temperatureC > 85) {
    throw new RangeError('Use a temperature between 5 and 85 °C.');
  }
  const [A, B, C] = ANTOINE[component];
  return 10 ** (A - B / (temperatureC + 273.15 + C));
}

function hydrocarbonFlash(propane, butane, K) {
  const total = propane + butane;
  if (total === 0) return { beta: 0, phase: 'no-hydrocarbons', gas: [0, 0], liquid: [0, 0] };
  const feed = [propane, butane];
  const z = feed.map(value => value / total);
  const k = [K.propane, K.butane];
  if (z.some((zi, i) => zi === 1 && Math.abs(k[i] - 1) < 1e-9)) {
    return { beta: 0, phase: 'all-liquid', gas: [0, 0], liquid: feed };
  }
  const residual = beta => z.reduce((sum, zi, i) => sum + zi * (k[i] - 1) / (1 + beta * (k[i] - 1)), 0);
  if (residual(0) <= 0) return { beta: 0, phase: 'all-liquid', gas: [0, 0], liquid: feed };
  if (residual(1) >= 0) return { beta: 1, phase: 'all-vapor', gas: feed, liquid: [0, 0] };
  let low = 0;
  let high = 1;
  for (let i = 0; i < 100; i++) {
    const middle = (low + high) / 2;
    if (residual(middle) > 0) low = middle;
    else high = middle;
  }
  const beta = (low + high) / 2;
  const gas = feed.map((amount, i) => clamp(amount * beta * k[i] / (1 + beta * (k[i] - 1)), 0, amount));
  const liquid = feed.map((amount, i) => amount - gas[i]);
  return { beta, phase: 'two-phase', gas, liquid };
}

export function simulate(input = DEFAULT_INPUTS) {
  requireValid(input);
  const inputs = Object.fromEntries(Object.keys(DEFAULT_INPUTS).map(key => [key, input[key]]));
  // Normalize only the accepted floating-point tolerance, never a materially wrong composition.
  const compositionSum = inputs.propane + inputs.butane + inputs.water;
  const feed = stream('feed', 'Mixed feed', ...COMPONENTS.map(c => inputs.flow * inputs[c] / compositionSum));
  const K = {
    propane: vaporPressure('propane', inputs.temperature) / inputs.pressure,
    butane: vaporPressure('butane', inputs.temperature) / inputs.pressure,
  };
  const flash = hydrocarbonFlash(feed.components.propane, feed.components.butane, K);
  const gas = stream('flashGas', 'Propane-rich flash gas', ...flash.gas);
  const condensate = stream('condensate', 'Hydrocarbon condensate to tower', ...flash.liquid);
  const water = stream('water', 'Separated water', 0, 0, feed.components.water);
  const product = stream('product', 'Tower overhead product',
    condensate.components.propane * inputs.c3Recovery / 100,
    condensate.components.butane * inputs.c4Carryover / 100);
  const bottoms = stream('bottoms', 'Tower bottoms',
    condensate.components.propane - product.components.propane,
    condensate.components.butane - product.components.butane);
  const streams = [feed, gas, condensate, water, product, bottoms];
  const terminalStreams = [gas, water, product, bottoms];
  const componentErrors = Object.fromEntries(COMPONENTS.map(c => [c,
    feed.components[c] - terminalStreams.reduce((sum, outlet) => sum + outlet.components[c], 0),
  ]));
  const totalError = feed.total - terminalStreams.reduce((sum, outlet) => sum + outlet.total, 0);
  const maxAbsoluteError = Math.max(Math.abs(totalError), ...Object.values(componentErrors).map(Math.abs));
  const balances = {
    feed: feed.total, outlets: terminalStreams.reduce((sum, outlet) => sum + outlet.total, 0),
    totalError, components: componentErrors, maxAbsoluteError,
    closed: maxAbsoluteError <= 1e-9 * Math.max(1, feed.total),
  };
  const recoveredPropane = gas.components.propane + product.components.propane;
  const metrics = {
    propaneRecovery: percent(recoveredPropane, feed.components.propane),
    productPurity: percent(product.components.propane, product.total),
    flashVaporFraction: flash.beta * 100,
    flashGasPurity: percent(gas.components.propane, gas.total),
    propaneFlashRecovery: percent(gas.components.propane, feed.components.propane),
    towerPropaneRecovery: percent(product.components.propane, condensate.components.propane),
    recoveredPropane, recoveredPropaneKgPerHour: recoveredPropane * 44.0956 / 1000,
    combinedProductPurity: percent(recoveredPropane, gas.total + product.total),
  };
  const warnings = [];
  if (feed.total === 0) warnings.push('Feed flow is zero. The separator and tower are idle.');
  else if (flash.phase === 'no-hydrocarbons') warnings.push('This feed contains only water. There is no propane to recover.');
  else if (flash.phase === 'all-liquid') warnings.push('All hydrocarbons remain liquid at these model conditions. The upper gas outlet has zero flow.');
  else if (flash.phase === 'all-vapor') warnings.push('All hydrocarbons leave in the flash gas. No condensate enters the tower; the tower is idle.');
  if (feed.components.water === 0 && feed.total > 0) warnings.push('There is no water in the feed, so the bottom water outlet has zero flow.');
  if (feed.components.propane === 0 && feed.total > 0 && flash.phase !== 'no-hydrocarbons') warnings.push('The feed contains no propane. Propane recovery and purity are displayed as zero.');
  if (inputs.pressure > 10) warnings.push('At this pressure, ideal K-values may differ substantially from real hydrocarbon equilibrium. Use an equation of state for design.');
  if (inputs.c3Recovery <= inputs.c4Carryover && condensate.total > 0) warnings.push('The assumed tower splits do not enrich propane: propane recovery must exceed butane carryover to increase its concentration.');
  if (product.total === 0 && condensate.total > 0) warnings.push('The assumed splits send no material to the tower overhead. Product purity is unavailable and displayed as zero.');
  if (gas.total > 0 && gas.fractions.propane < 0.5) warnings.push('The flash gas contains more butane than propane. A gas outlet is not automatically a propane product.');
  for (const component of ['propane', 'butane']) {
    if (feed.components[component] > 0 && feed.components[component === 'propane' ? 'butane' : 'propane'] === 0 && Math.abs(K[component] - 1) < 1e-9) {
      warnings.push('At pure-component saturation, temperature and pressure alone cannot determine the vapor fraction. This teaching model assigns the liquid endpoint.');
    }
  }
  const towerProfile = {
    illustrative: true,
    caption: 'Illustrative composition trend only. Stage count does not calculate recovery; overhead and bottoms follow your assumed component splits.',
    points: Array.from({ length: inputs.stages }, (_, index) => ({
      stage: index + 1,
      propaneFraction: condensate.total > 0 ? product.fractions.propane +
        (bottoms.fractions.propane - product.fractions.propane) * (inputs.stages === 1 ? 0 : index / (inputs.stages - 1)) : 0,
    })),
  };
  return { inputs, streams, metrics, balances, warnings, K, phase: flash.phase, towerProfile };
}

/** A re-solve at each value; changing pressure/T does not change assumed tower splits. */
export function generateSensitivity(input = DEFAULT_INPUTS, options = {}) {
  requireValid(input);
  const { variable = 'pressure', points = 31 } = options;
  if (!['pressure', 'temperature'].includes(variable)) throw new RangeError('Sensitivity variable must be pressure or temperature.');
  if (!Number.isInteger(points) || points < 2 || points > 201) throw new RangeError('Sensitivity point count must be a whole number from 2 to 201.');
  const [limitMin, limitMax] = INPUT_LIMITS[variable];
  const min = options.min ?? limitMin;
  const max = options.max ?? limitMax;
  if (![min, max].every(Number.isFinite) || min < limitMin || max > limitMax || min >= max) {
    throw new RangeError(`Sensitivity range must be increasing and within ${limitMin}–${limitMax}.`);
  }
  return {
    variable, unit: variable === 'pressure' ? 'bar abs' : '°C',
    points: Array.from({ length: points }, (_, i) => {
      const value = i === points - 1 ? max : min + (max - min) * i / (points - 1);
      const result = simulate({ ...input, [variable]: value });
      return { value, ...result.metrics, condensateFlow: result.streams.find(s => s.id === 'condensate').total, phase: result.phase };
    }),
  };
}
