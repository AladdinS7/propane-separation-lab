import { DEFAULT_INPUTS, simulate, validateInputs, generateSensitivity } from './model.js';
import { renderDiagram } from './diagram.js';
import { parseCase, encodeCase, streamsCsv, annualizedCost } from './data.js';

const $ = id => document.getElementById(id);
const fields = Object.keys(DEFAULT_INPUTS);
const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const fmt = value => formatter.format(value);
const short = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const byId = (r, id) => r.streams.find(s => s.id === id);
const PRESETS = {
  baseline: { label: 'Balanced separation', inputs: { ...DEFAULT_INPUTS } },
  gas: { label: 'Gas-rich flash', inputs: { ...DEFAULT_INPUTS, pressure: 3 } },
  liquid: { label: 'Condensate-rich flash', inputs: { ...DEFAULT_INPUTS, pressure: 12 } },
  binary: { label: 'Propane + water only', inputs: { ...DEFAULT_INPUTS, propane: 30, butane: 0, water: 70, pressure: 1 } },
};
const COST_DEFAULTS = { capitalCost: 250000, capitalRecoveryFactor: 0.15, hoursPerYear: 8000, thermalDuty: 20, electricLoad: 2, heatPrice: 0.04, electricityPrice: 0.12, fixedOpex: 10000 };
const STORAGE_KEY = 'propane-lab-case-v2';
let current = simulate(DEFAULT_INPUTS);
let currentName = 'Balanced separation';
let selectedUnit = 'flash';
let motionPaused = false;
let sweepVariable = 'pressure';
let toastTimer;
let dirty = false;

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5200);
}

function readInputs() {
  return Object.fromEntries(fields.map(key => [key, $(key).value.trim() === '' ? NaN : Number($(key).value)]));
}
function populateInputs(inputs) {
  fields.forEach(key => { $(key).value = inputs[key]; });
}
function updateDraft() {
  const inputs = readInputs();
  const validation = validateInputs(inputs);
  const total = inputs.propane + inputs.butane + inputs.water;
  $('composition-total').textContent = Number.isFinite(total) ? `Composition total: ${short(total)}%${Math.abs(total - 100) <= 1e-6 ? ' ✓' : ' · must equal 100%'}` : 'Enter all three mole percentages.';
  ['propane', 'butane', 'water'].forEach(key => { $(`comp-${key}`).style.width = `${Number.isFinite(inputs[key]) ? Math.max(0, Math.min(100, inputs[key])) : 0}%`; });
  fields.forEach(key => { $(key).setAttribute('aria-invalid', String(validation.errors.some(error => error.field === key || error.field === 'composition' && ['propane', 'butane', 'water'].includes(key)))); });
  dirty = fields.some(key => inputs[key] !== current.inputs[key]);
  $('case-state').textContent = dirty ? 'UNAPPLIED CHANGES' : 'CALCULATED';
  $('case-state').classList.toggle('pending', dirty);
  $('case-feedback').className = `case-feedback${!validation.valid ? ' error' : dirty ? ' pending' : ''}`;
  if (!validation.valid) {
    $('case-feedback').textContent = validation.errors.map(error => error.message).join(' ');
  } else if (dirty) {
    const draft = simulate(inputs);
    const note = draft.warnings[0];
    $('case-feedback').textContent = note ? `${note} Run to apply these conditions.` : 'Inputs look good. Run separation to update all results.';
  } else {
    $('case-feedback').textContent = 'Case calculated. All displayed results use these conditions.';
  }
  $('case-form').querySelector('[type=submit]').disabled = !validation.valid;
  return validation;
}

function applyCase(inputs, name = 'Custom case', announce = true) {
  const next = simulate(inputs);
  current = next;
  currentName = name;
  populateInputs(inputs);
  dirty = false;
  const preset = Object.entries(PRESETS).find(([, value]) => fields.every(key => value.inputs[key] === inputs[key]));
  $('preset').value = preset ? preset[0] : 'custom';
  updateDraft();
  renderResults();
  renderAnalysis();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ inputs, name })); } catch { /* Storage can be unavailable in private browsing. */ }
  if (announce) toast(`${name} calculated. Material balance ${next.balances.closed ? 'closed' : 'needs review'}.`);
}

function metric(id, value, available = true) {
  $(id).innerHTML = available ? `${fmt(value)}<small>%</small>` : '—';
  $(id).setAttribute('aria-label', available ? `${fmt(value)} percent` : 'Not available: no stream or no feed propane');
}
function renderResults() {
  $('case-name').textContent = currentName;
  const feedPropane = byId(current, 'feed').components.propane;
  metric('metric-recovery', current.metrics.propaneRecovery, feedPropane > 0);
  metric('metric-gas-purity', current.metrics.flashGasPurity, byId(current, 'flashGas').available);
  metric('metric-product-purity', current.metrics.productPurity, byId(current, 'product').available);
  $('recovery-bar').style.width = `${current.metrics.propaneRecovery}%`;
  $('metric-balance').textContent = current.balances.closed ? '✓ Closed' : 'Review';
  $('balance-caption').textContent = `Max error: ${current.balances.maxAbsoluteError.toExponential(1)} mol/h`;
  renderProcess();
  const labels = ['Mixed feed', 'Flash gas', 'Condensate → tower', 'Water outlet', 'Tower overhead', 'Tower bottoms'];
  const colors = ['#9cabb2', '#65d9b0', '#f6be65', '#6db8ff', '#65d9b0', '#dca458'];
  $('stream-table').innerHTML = current.streams.map((s, index) => `<tr class="${s.id === 'condensate' ? 'internal-row' : ''}"><td><span class="stream-number">0${index + 1}</span><i class="dot" style="background:${colors[index]}"></i>${labels[index]}</td><td>${fmt(s.total)}</td>${['propane', 'butane', 'water'].map(c => `<td>${s.available ? fmt(s.fractions[c] * 100) : '—'}</td>`).join('')}</tr>`).join('');
  const gas = feedPropane > 0 ? byId(current, 'flashGas').components.propane / feedPropane * 100 : 0;
  const tower = feedPropane > 0 ? byId(current, 'product').components.propane / feedPropane * 100 : 0;
  const remainder = feedPropane > 0 ? Math.max(0, 100 - gas - tower) : 0;
  const split = [{ name: 'Flash gas', value: gas, color: '#65d9b0' }, { name: 'Tower overhead', value: tower, color: '#f6be65' }, { name: 'Tower bottoms', value: remainder, color: '#b0bec5' }];
  $('propane-split').innerHTML = `<div class="split-donut" role="img" aria-label="Propane distribution: ${split.map(item => `${item.name} ${fmt(item.value)} percent`).join(', ')}" style="background:${feedPropane > 0 ? `conic-gradient(#65d9b0 0 ${gas}%, #f6be65 ${gas}% ${gas + tower}%, #b0bec5 ${gas + tower}% 100%)` : '#e9edef'}"><strong>${feedPropane > 0 ? short(current.metrics.propaneRecovery) + '%' : '—'}<small>${feedPropane > 0 ? 'recovered' : 'no propane'}</small></strong></div>${split.map(item => `<div class="split-row"><span><i class="dot" style="background:${item.color}"></i>${item.name}</span><strong>${feedPropane > 0 ? fmt(item.value) + '%' : '—'}</strong></div>`).join('')}`;
  $('operating-notes').innerHTML = current.warnings.map(note => `<p class="operating-note">${escapeHtml(note.replaceAll('displayed as zero', 'shown as a dash when undefined'))}</p>`).join('');
}
function renderProcess() {
  $('process-diagram').innerHTML = renderDiagram(current, selectedUnit);
  $('process-diagram').classList.toggle('motion-paused', motionPaused);
  const details = {
    feed: { title: 'F-101 · Every component is accounted for.', copy: `${fmt(current.inputs.flow)} mol/h enters: ${short(current.inputs.propane)}% propane, ${short(current.inputs.butane)}% n-butane, and ${short(current.inputs.water)}% water. Percentages are on a molar basis.`, label: 'FEED BASIS' },
    flash: { title: 'V-101 · Three outlets, three distinct routes.', copy: `At ${short(current.inputs.temperature)} °C and ${short(current.inputs.pressure)} bar abs, ${fmt(current.metrics.flashVaporFraction)}% of the hydrocarbon feed leaves as vapor. Condensate goes directly to the tower; free water leaves separately. Vessel levels are schematic.`, label: phaseLabel(current.phase) },
    tower: { title: 'T-101 · Recover the propane left in the condensate.', copy: `${fmt(byId(current, 'condensate').total)} mol/h enters from the middle outlet. Your assumptions send ${short(current.inputs.c3Recovery)}% of that propane and ${short(current.inputs.c4Carryover)}% of that n-butane to the overhead. Reflux and reboiler symbols are schematic.`, label: 'ASSUMED SPLITS' },
    water: { title: 'Bottom outlet · Keep the aqueous stream separate.', copy: `${fmt(byId(current, 'water').total)} mol/h of water bypasses the recovery tower. All water is assigned to this outlet under the ideal free-water assumption. Dissolved propane and entrainment are not calculated.`, label: 'IDEAL DECANTER' },
  };
  const d = details[selectedUnit];
  $('unit-detail').innerHTML = `<span class="insight-icon">${selectedUnit === 'tower' ? '↥' : selectedUnit === 'water' ? '↓' : '⊞'}</span><div><h3>${d.title}</h3><p>${d.copy}</p></div><span class="insight-label">${d.label}</span>`;
}
function phaseLabel(phase) {
  return ({ 'two-phase': 'VAPOR + LIQUID HC', 'all-liquid': 'LIQUID HC ONLY', 'all-vapor': 'VAPOR HC ONLY', 'no-hydrocarbons': 'NO HYDROCARBONS' })[phase];
}

function renderAnalysis() {
  const sweep = generateSensitivity(current.inputs, { variable: sweepVariable });
  const W = 800, H = 360, left = 57, right = 24, top = 25, bottom = 48;
  const min = sweep.points[0].value, max = sweep.points.at(-1).value;
  const x = value => left + (value - min) / (max - min) * (W - left - right);
  const y = value => H - bottom - value / 100 * (H - top - bottom);
  const path = key => sweep.points.map((point, index) => `${index ? 'L' : 'M'}${x(point.value).toFixed(2)} ${y(point[key]).toFixed(2)}`).join(' ');
  const lineX = x(current.inputs[sweepVariable]);
  let grid = '';
  for (let tick = 0; tick <= 100; tick += 25) grid += `<line x1="${left}" y1="${y(tick)}" x2="${W - right}" y2="${y(tick)}" stroke="#e9edef"/><text x="${left - 12}" y="${y(tick) + 4}" text-anchor="end" fill="#9aa6ac" font-size="11">${tick}%</text>`;
  for (let tick = 0; tick <= 6; tick++) { const value = min + tick / 6 * (max - min); grid += `<text x="${x(value)}" y="${H - 23}" text-anchor="middle" fill="#9aa6ac" font-size="11">${short(value)}</text>`; }
  const unitTitle = sweepVariable === 'pressure' ? 'Flash pressure (bar abs)' : 'Flash temperature (°C)';
  $('sweep-title').textContent = `Propane recovery vs. flash ${sweepVariable}`;
  const hasPropane = byId(current, 'feed').components.propane > 0;
  $('sensitivity-chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="chart-title chart-desc"><title id="chart-title">Propane recovery sensitivity to ${sweepVariable}</title><desc id="chart-desc">${hasPropane ? `Overall recovery ranges from ${fmt(Math.min(...sweep.points.map(p => p.propaneRecovery)))} to ${fmt(Math.max(...sweep.points.map(p => p.propaneRecovery)))} percent. Flash-gas recovery varies with ${sweepVariable}. Tower component splits are fixed.` : 'No propane in feed. Recovery curves are undefined; enter a feed containing propane.'}</desc>${grid}${hasPropane ? `<path d="${path('propaneRecovery')} L${x(max)} ${y(0)} L${x(min)} ${y(0)} Z" fill="#65d9b0" opacity=".06"/><path d="${path('propaneRecovery')}" stroke="#3ba985" stroke-width="3" fill="none"/><path d="${path('propaneFlashRecovery')}" stroke="#e0ad58" stroke-width="2.5" fill="none"/><line x1="${lineX}" y1="${top}" x2="${lineX}" y2="${H - bottom}" stroke="#9aaab2" stroke-dasharray="4 5"/><circle cx="${lineX}" cy="${y(current.metrics.propaneRecovery)}" r="5" fill="#3ba985" stroke="white" stroke-width="2"/>` : `<text x="400" y="170" text-anchor="middle" fill="#899ba3" font-size="14">No propane in feed — recovery is undefined</text>`}<text x="${W / 2}" y="${H - 2}" text-anchor="middle" fill="#83949d" font-size="11">${unitTitle}</text></svg>`;
  $('analysis-summary').innerHTML = `<div class="summary-stat"><span>Current ${sweepVariable}</span><strong>${short(current.inputs[sweepVariable])} ${sweep.unit}</strong></div><div class="summary-stat"><span>Hydrocarbon vapor fraction</span><strong>${short(current.metrics.flashVaporFraction)}%</strong></div><div class="summary-stat"><span>Condensate to tower</span><strong>${fmt(byId(current, 'condensate').total)} mol/h</strong></div>`;
  $('comparison-cards').innerHTML = [{ pressure: 3, label: 'Low pressure · 3 bar' }, { pressure: 6, label: 'Balanced pressure · 6 bar' }, { pressure: 12, label: 'High pressure · 12 bar' }].map(caseInfo => {
    const r = simulate({ ...current.inputs, pressure: caseInfo.pressure });
    return `<article class="compare-card"><h4>${caseInfo.label}</h4><dl><dt>Overall C₃ recovery</dt><dd>${hasPropane ? fmt(r.metrics.propaneRecovery) + '%' : '—'}</dd><dt>Condensate flow</dt><dd>${fmt(byId(r, 'condensate').total)} mol/h</dd><dt>Flash gas purity</dt><dd>${byId(r, 'flashGas').available ? fmt(r.metrics.flashGasPurity) + '%' : 'No flow'}</dd></dl><button class="text-button" data-apply-pressure="${caseInfo.pressure}">Use this pressure →</button></article>`;
  }).join('');

}

function renderEconomics() {
  const form = $('economics-form');
  const a = Object.fromEntries(Object.keys(COST_DEFAULTS).map(key => [key, form.elements[key].value.trim() === '' ? NaN : Number(form.elements[key].value)]));
  try {
    const cost = annualizedCost(a);
    $('economics-error').textContent = '';
    const money = number => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(number);
    $('annual-cost').textContent = money(cost.total);
    const components = [{ name: 'Annualized capital', value: cost.annualCapital, color: '#65d9b0' }, { name: 'Heating + electricity', value: cost.annualHeat + cost.annualElectricity, color: '#f6be65' }, { name: 'Fixed operating costs', value: cost.annualFixed, color: '#6db8ff' }];
    $('cost-bars').innerHTML = components.map(c => `<div class="cost-row"><span>${c.name}</span><strong>${money(c.value)}</strong><div><span style="width:${cost.total > 0 ? c.value / cost.total * 100 : 0}%;background:${c.color}"></span></div></div>`).join('');
  } catch (error) {
    $('economics-error').textContent = error.message;
    $('annual-cost').textContent = '—';
    $('cost-bars').textContent = 'Correct the assumptions to calculate annual costs.';
  }
}

function showView(view, updateHash = true) {
  if (!['simulation', 'analysis', 'economics', 'learn'].includes(view)) view = 'simulation';
  document.querySelectorAll('.view').forEach(panel => { panel.hidden = panel.id !== `view-${view}`; });
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  if (updateHash) history.replaceState(null, '', `#${view}`);
}
function download(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('case-form').addEventListener('input', () => { $('preset').value = 'custom'; updateDraft(); });
$('case-form').addEventListener('submit', event => { event.preventDefault(); if (updateDraft().valid) applyCase(readInputs(), $('preset').value === 'custom' ? 'Custom case' : PRESETS[$('preset').value].label); });
$('preset').addEventListener('change', event => {
  const preset = PRESETS[event.target.value];
  if (!preset) return;
  populateInputs(preset.inputs); updateDraft();
  $('case-feedback').textContent = `Loaded ${preset.label.toLowerCase()}. Review the conditions, then run separation.`;
});
$('reset-button').addEventListener('click', () => applyCase(DEFAULT_INPUTS, 'Balanced separation'));
$('motion-button').addEventListener('click', () => {
  motionPaused = !motionPaused;
  $('process-diagram').classList.toggle('motion-paused', motionPaused);
  $('motion-button').setAttribute('aria-pressed', String(motionPaused));
  $('motion-button').textContent = motionPaused ? '▷ Play flow' : 'Ⅱ Pause flow';
});
function selectUnit(event) {
  const unit = event.target.closest('[data-unit]');
  if (!unit) return;
  selectedUnit = unit.dataset.unit;
  renderProcess();
  if (event.type === 'keydown') $('process-diagram').querySelector(`[data-unit="${selectedUnit}"]`).focus();
}
$('process-diagram').addEventListener('click', selectUnit);
$('process-diagram').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectUnit(event); } });
document.addEventListener('click', event => {
  const navigation = event.target.closest('[data-view], [data-go]');
  if (navigation) { showView(navigation.dataset.view || navigation.dataset.go); window.scrollTo({ top: 0, behavior: 'instant' }); }
  const comparison = event.target.closest('[data-apply-pressure]');
  if (comparison) { applyCase({ ...current.inputs, pressure: Number(comparison.dataset.applyPressure) }, `Pressure comparison · ${comparison.dataset.applyPressure} bar`); showView('simulation'); window.scrollTo({ top: 0, behavior: 'instant' }); }
});
window.addEventListener('hashchange', () => showView(location.hash.slice(1), false));
document.querySelectorAll('[data-sweep]').forEach(button => button.addEventListener('click', () => {
  sweepVariable = button.dataset.sweep;
  document.querySelectorAll('[data-sweep]').forEach(other => { const active = other === button; other.classList.toggle('active', active); other.setAttribute('aria-pressed', String(active)); });
  renderAnalysis();
}));
$('export-button').addEventListener('click', () => {
  download(encodeCase(current.inputs), 'propane-lab-case.json', 'application/json');
  toast(dirty ? 'Exported the last calculated case. Run separation first to export your pending edits.' : 'Calculated case exported as JSON.');
});
$('csv-button').addEventListener('click', () => { download(streamsCsv(current), 'propane-lab-streams.csv', 'text/csv;charset=utf-8'); toast('Stream ledger exported as CSV.'); });
$('import-button').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 100000) throw new Error('Use a JSON or CSV case file smaller than 100 KB.');
    const inputs = parseCase(await file.text(), file.name);
    populateInputs(inputs); $('preset').value = 'custom';
    updateDraft(); showView('simulation');
    $('case-feedback').textContent = 'Case imported. Review the values, then run separation to update results.';
    toast('Case values imported locally. Review and run separation.');
    $('flow').focus();
  } catch (error) { toast(`Import failed: ${error.message}`); }
  event.target.value = '';
});
$('economics-form').addEventListener('submit', event => { event.preventDefault(); renderEconomics(); });
$('economics-form').addEventListener('input', () => { $('economics-error').textContent = 'Assumptions changed. Recalculate to update the annual cost.'; });
$('reset-economics').addEventListener('click', () => { Object.entries(COST_DEFAULTS).forEach(([key, value]) => { $('economics-form').elements[key].value = value; }); renderEconomics(); });

let restored = false;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved?.inputs && validateInputs(saved.inputs).valid) { applyCase(saved.inputs, typeof saved.name === 'string' && saved.name.length < 80 ? saved.name : 'Saved case', false); restored = true; }
} catch { /* A corrupt or unavailable local cache never prevents startup. */ }
if (!restored) applyCase(DEFAULT_INPUTS, 'Balanced separation', false);
renderEconomics();
showView(location.hash.slice(1) || 'simulation', false);
