import { DEFAULT_INPUTS } from './model.js';
import { FIELD_HELP, INPUT_EXPLANATIONS, explainInputErrors, calculateStageStudy, reviewCase, RELIABILITY_DEFAULTS, RELIABILITY_PARTS, calculateReliability, CODE_STEPS, extractExcerpt } from './teaching.js';
import { LESSONS, GLOSSARY } from './lessons.js';

const $ = id => document.getElementById(id);
const html = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
const percent = value => value > 0 && value < 0.00001 ? '<0.001%' : `${(100 * value).toFixed(3)}%`;
const stream = (result, id) => result.streams.find(s => s.id === id);
const LEARNING_KEY = 'propane-lab-learning-v3';

export function initStudentTools({ getCurrent, getDraft, applyCase, loadDraft, showView, toast }) {
  let lessonIndex = 0, answers = {}, codeIndex = 0, requestId = 0, excerptText = '', pendingCase;
  const sources = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(LEARNING_KEY) || '{}');
    if (Number.isInteger(saved.lessonIndex) && saved.lessonIndex >= 0 && saved.lessonIndex < LESSONS.length) lessonIndex = saved.lessonIndex;
    for (let i = 0; i < LESSONS.length; i++) if (Number.isInteger(saved.answers?.[i]) && saved.answers[i] >= 0 && saved.answers[i] < LESSONS[i].choices.length) answers[i] = saved.answers[i];
  } catch { /* Lessons remain usable without storage. */ }
  function saveLearning() { try { localStorage.setItem(LEARNING_KEY, JSON.stringify({ lessonIndex, answers })); } catch { /* Optional local progress. */ } }

  function workedExample(key) {
    const r = getCurrent(), feed = stream(r, 'feed'), gas = stream(r, 'flashGas'), liquid = stream(r, 'condensate'), water = stream(r, 'water'), product = stream(r, 'product');
    const examples = {
      feed: `${number(feed.total)} mol/h × ${number(r.inputs.propane)}% → ${number(feed.components.propane)} mol/h of feed propane.`,
      routes: `Top gas: ${number(gas.total)} mol/h. Middle condensate: ${number(liquid.total)} mol/h. Bottom water: ${number(water.total)} mol/h.`,
      equilibrium: `At ${number(r.inputs.temperature)} °C and ${number(r.inputs.pressure)} bar absolute: K for propane = ${number(r.K.propane)}; K for n-butane = ${number(r.K.butane)}.`,
      flash: `Hydrocarbon feed = ${number(feed.components.propane + feed.components.butane)} mol/h. ${feed.components.propane + feed.components.butane > 0 ? `β = ${number(r.metrics.flashVaporFraction / 100)}; gas = ${number(gas.total)} mol/h.` : 'No hydrocarbons flow, so a vapor fraction is not meaningful.'}`,
      tower: `${number(liquid.components.propane)} mol/h of tower-feed propane × ${number(r.inputs.c3Recovery)}% → ${number(product.components.propane)} mol/h of overhead propane.`,
      metrics: feed.components.propane > 0 ? `Collected propane = ${number(r.metrics.recoveredPropane)} mol/h; overall recovery = ${number(r.metrics.propaneRecovery)}%. ${product.available ? `Tower overhead purity = ${number(r.metrics.productPurity)}%.` : 'Tower overhead has no flow, so its purity is undefined.'}` : 'No propane enters, so propane recovery has no meaningful denominator.',
      experiment: `Your reference: ${number(r.inputs.temperature)} °C and ${number(r.inputs.pressure)} bar. Tower splits stay at ${number(r.inputs.c3Recovery)}% propane and ${number(r.inputs.c4Carryover)}% butane during a flash sweep.`,
      reliability: 'Separate example: if MTTF = 40,000 h and mission = 1,000 h, P = 1 − exp(−1,000/40,000) = 2.469%. This rate is hypothetical and independent of your process case.',
      stages: `Your chosen count is ${r.inputs.stages} ideal equilibrium stages. The separate stage study uses a constant relative volatility α = ${number(r.K.propane / r.K.butane)} and holds the reference bottoms composition. Stream flows still follow your specified splits.`,
    };
    return examples[key];
  }
  function renderLearning() {
    const completed = LESSONS.filter((lesson, i) => answers[i] === lesson.answer).length;
    $('lesson-progress').textContent = `${completed} of ${LESSONS.length} checks completed${completed === LESSONS.length ? ' · ready to explore independently' : ''}`;
    $('lesson-progress-bar').value = completed;
    $('lesson-nav').innerHTML = LESSONS.map((lesson, i) => `<button data-lesson="${i}" ${i === lessonIndex ? 'aria-current="step"' : ''}><span>${answers[i] === lesson.answer ? '✓' : String(i + 1).padStart(2, '0')}</span>${html(lesson.title)}</button>`).join('');
    const l = LESSONS[lessonIndex], selected = answers[lessonIndex];
    const answered = Number.isInteger(selected), correct = selected === l.answer;
    $('lesson-card').innerHTML = `<div class="lesson-top"><div><span class="eyebrow">LESSON ${lessonIndex + 1} / ${LESSONS.length}</span><p>${html(l.subtitle)}</p></div><span class="lesson-symbol">${l.symbol}</span></div><h3 tabindex="-1" id="lesson-title">${html(l.title)}</h3><p class="lesson-concept">${html(l.concept)}</p><p>${html(l.explanation)}</p><div class="formula">${html(l.formula)}</div><div class="worked-example"><span class="eyebrow">${l.example === 'reliability' ? 'A SEPARATE HYPOTHETICAL EXAMPLE' : 'YOUR LAST CALCULATED CASE'}</span><p>${html(workedExample(l.example))}</p></div><div class="lesson-takeaway"><strong>Remember this</strong><p>${html(l.takeaway)}</p></div><form id="lesson-quiz" class="lesson-quiz"><fieldset><legend>Quick check · ${html(l.question)}</legend>${l.choices.map((choice, i) => `<label><input type="radio" name="lesson-answer" value="${i}" ${selected === i ? 'checked' : ''}>${html(choice)}</label>`).join('')}</fieldset><button type="submit" class="button secondary">Check my answer</button><p id="quiz-feedback" class="quiz-feedback ${correct ? 'correct' : ''}" role="status">${answered ? `${correct ? 'Correct. ' : 'Not quite. Try again. '}${html(l.feedback)}` : 'Choose an answer, then check your understanding.'}</p></form><button class="button primary" data-lesson-action="${l.action}">${html(l.actionLabel)} →</button><div class="lesson-pagination"><button class="button secondary" id="previous-lesson" ${lessonIndex === 0 ? 'disabled' : ''}>← Previous</button><span>${lessonIndex + 1} of ${LESSONS.length}</span><button class="button secondary" id="next-lesson" ${lessonIndex === LESSONS.length - 1 ? 'disabled' : ''}>Next lesson →</button></div>`;
  }
  function changeLesson(index) { lessonIndex = index; saveLearning(); renderLearning(); $('lesson-title').focus({ preventScroll: true }); }
  $('lesson-nav').addEventListener('click', event => { const b = event.target.closest('[data-lesson]'); if (b) changeLesson(Number(b.dataset.lesson)); });
  $('lesson-card').addEventListener('click', event => {
    if (event.target.closest('#previous-lesson') && lessonIndex > 0) changeLesson(lessonIndex - 1);
    if (event.target.closest('#next-lesson') && lessonIndex < LESSONS.length - 1) changeLesson(lessonIndex + 1);
    const action = event.target.closest('[data-lesson-action]')?.dataset.lessonAction;
    if (!action) return;
    if (action === 'baseline' || action === 'tower') { loadDraft(action === 'baseline' ? { ...DEFAULT_INPUTS } : { ...getCurrent().inputs, c3Recovery: 70, c4Carryover: 30 }); toast('Learning example loaded. Review & run to apply these values.'); }
    else { showView(action); window.scrollTo({ top: 0, behavior: 'instant' }); }
  });
  $('lesson-card').addEventListener('submit', event => {
    event.preventDefault();
    const selected = $('lesson-quiz').querySelector('input:checked');
    if (!selected) { $('quiz-feedback').textContent = 'Select an answer first. There is no penalty for trying.'; return; }
    answers[lessonIndex] = Number(selected.value); saveLearning(); renderLearning(); $('quiz-feedback').setAttribute('tabindex', '-1'); $('quiz-feedback').focus({ preventScroll: true });
  });
  $('reset-learning').addEventListener('click', () => { lessonIndex = 0; answers = {}; saveLearning(); renderLearning(); toast('Learning checks reset. Your process case is unchanged.'); });
  function renderGlossary() {
    const search = $('glossary-search').value.trim().toLowerCase();
    const terms = GLOSSARY.filter(term => term.join(' ').toLowerCase().includes(search));
    $('glossary-list').innerHTML = terms.map(([term, description]) => `<div><dt>${html(term)}</dt><dd>${html(description)}</dd></div>`).join('');
    $('glossary-count').textContent = terms.length ? `${terms.length} terms${search ? ' match your search' : ' to explore'}.` : 'No matching terms. Try a shorter word or clear your search.';
  }
  $('glossary-search').addEventListener('input', renderGlossary);

  async function renderCode() {
    const thisRequest = ++requestId, step = CODE_STEPS[codeIndex];
    excerptText = ''; $('copy-code').disabled = true;
    $('code-nav').innerHTML = CODE_STEPS.map((item, i) => `<button data-code-step="${i}" ${i === codeIndex ? 'aria-current="step"' : ''}>${html(item.title)}</button>`).join('');
    $('code-explanation').innerHTML = `<h3>${html(step.title)}</h3><p>${html(step.explanation)}</p><dl class="code-io"><div><dt>INPUT</dt><dd>${html(step.input)}</dd></div><div><dt>OUTPUT</dt><dd>${html(step.output)}</dd></div></dl><div class="worked-example"><span class="eyebrow">CONNECT IT TO THE NUMBERS</span><p>${html(workedExample(['feed', 'equilibrium', 'flash', 'tower', 'metrics', 'experiment', 'reliability', 'stages'][codeIndex]))}</p></div>`;
    $('source-file').href = step.file; $('download-code').href = step.file;
    $('code-location').textContent = step.file; $('code-status').textContent = ''; $('code-source').textContent = 'Loading actual source…';
    try {
      if (!sources.has(step.file)) {
        const response = await fetch(step.file);
        if (!response.ok) throw new Error(`Source request returned ${response.status}.`);
        sources.set(step.file, await response.text());
      }
      if (thisRequest !== requestId) return;
      const excerpt = extractExcerpt(sources.get(step.file), step);
      excerptText = excerpt.text;
      $('code-location').textContent = `${step.file} · lines ${excerpt.line}–${excerpt.line + excerpt.text.split('\n').length - 1}`;
      $('code-source').textContent = excerptText; $('copy-code').disabled = false;
    } catch (error) {
      if (thisRequest !== requestId) return;
      $('code-source').textContent = 'The excerpt could not be loaded. Use “Open full file” or the repository link to inspect the source.';
      $('code-status').textContent = error.message;
    }
  }
  $('code-nav').addEventListener('click', event => { const b = event.target.closest('[data-code-step]'); if (b) { codeIndex = Number(b.dataset.codeStep); renderCode(); $('code-nav').querySelector('[aria-current]').focus({ preventScroll: true }); } });
  $('copy-code').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(excerptText); $('code-status').textContent = 'Excerpt copied to your clipboard.'; }
    catch { $('code-status').textContent = 'Clipboard access is unavailable. Select the excerpt to copy it, or use Download file.'; }
  });

  function openReview(inputs, name = 'Custom case') {
    const review = reviewCase(inputs);
    if (!review.valid) { toast(review.errors.map(e => e.message).join(' ')); return; }
    pendingCase = { inputs: { ...inputs }, name, suggestion: review.suggestion };
    const r = review.result;
    const units = { flow: 'mol/h', propane: 'mol %', butane: 'mol %', water: 'mol %', temperature: '°C', pressure: 'bar abs', c3Recovery: '% of tower C₃', c4Carryover: '% of tower C₄', stages: 'ideal stages (separate study)' };
    const labels = { flow: 'Total feed', propane: 'Propane', butane: 'n-Butane', water: 'Water', temperature: 'Temperature', pressure: 'Pressure', c3Recovery: 'C₃ to overhead', c4Carryover: 'C₄ to overhead', stages: 'Equilibrium stages' };
    $('review-content').innerHTML = `<div class="review-phase"><span class="eyebrow">PREVIEW OF YOUR VALUES</span><strong>${html(review.phase)}</strong><p>Condensate to tower: ${number(stream(r, 'condensate').total)} mol/h · Overall propane recovery: ${stream(r, 'feed').components.propane > 0 ? number(r.metrics.propaneRecovery) + '%' : 'undefined (no propane feed)'}</p></div><details class="review-values"><summary>Your entered conditions</summary><dl>${Object.keys(labels).map(key => `<div><dt>${labels[key]}</dt><dd>${number(inputs[key])} ${units[key]}</dd></div>`).join('')}</dl></details><h3>What to expect</h3><ul class="review-notes">${review.notes.map(note => `<li>${html(note)}</li>`).join('')}</ul><div class="suggestion-card"><span class="eyebrow">OPTIONAL LEARNING COMPARISON</span><h3>${html(review.suggestion.title)}</h3><p>${html(review.suggestion.reason)}</p><button class="button secondary" id="load-suggestion">Load suggested values for review</button></div><p class="small-copy">Valid model inputs do not establish equipment safety or real product specifications. The equations use ideal equilibrium, perfect free-water separation, and assumed tower splits.</p>`;
    if (!$('review-dialog').open) $('review-dialog').showModal();
  }
  $('continue-case').addEventListener('click', () => { if (!pendingCase) return; const saved = pendingCase; $('review-dialog').close(); applyCase(saved.inputs, saved.name); showView('simulation'); });
  ['close-review', 'edit-case'].forEach(id => $(id).addEventListener('click', () => $('review-dialog').close()));
  $('review-dialog').addEventListener('close', () => { pendingCase = undefined; });
  $('review-content').addEventListener('click', event => {
    if (event.target.closest('#load-suggestion') && pendingCase) { const proposed = pendingCase.suggestion.inputs; $('review-dialog').close(); loadDraft(proposed); toast('Suggested values loaded as a draft. Review & run to calculate them.'); }
  });
  $('example-button').addEventListener('click', () => { loadDraft({ ...DEFAULT_INPUTS }); toast('Teaching example loaded. Review & run when ready.'); });
  $('case-form').addEventListener('focusin', event => {
    const help = FIELD_HELP[event.target.id];
    if (help) { $('field-coach').innerHTML = `<strong>${html(help[0])}</strong><p>${html(help[1])}</p>`; event.target.setAttribute('aria-describedby', 'field-coach'); }
  });

  function renderStages() {
    const study = calculateStageStudy(getCurrent());
    if (!study.available) { $('stage-study').innerHTML = `<div class="note-block">${html(study.reason)}</div>`; return; }
    const x = n => 47 + n / study.stages * 510, y = f => 200 - f * 165;
    const curve = study.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.stage).toFixed(2)} ${y(p.propaneFraction).toFixed(2)}`).join(' ');
    const limit = study.limitPurity > 0.99999 ? '≈100% (rounded)' : `${number(study.limitPurity * 100)}%`;
    $('stage-study').innerHTML = `<div class="stage-stats"><div><span>Your stage count</span><strong>${study.stages}</strong><small>ideal equilibrium stages</small></div><div><span>Minimum for split-case target</span><strong>${number(study.minimumStages)}</strong><small>round up to ${study.roundedMinimum} at total reflux</small></div><div><span>Ideal overhead limit at N</span><strong>${limit}</strong><small>with reference bottoms held fixed</small></div></div><svg viewBox="0 0 600 245" role="img" aria-labelledby="stage-title"><title id="stage-title">Ideal total-reflux propane composition increases with stage count. Your count is ${study.stages}; the reference target needs at least ${study.roundedMinimum} whole ideal stages.</title>${[0, .5, 1].map(p => `<line x1="47" x2="557" y1="${y(p)}" y2="${y(p)}" stroke="#e1e8e9"/><text x="38" y="${y(p) + 4}" text-anchor="end" font-size="12" fill="#6c858d">${p * 100}%</text>`).join('')}<line x1="47" x2="557" y1="${y(study.xD)}" y2="${y(study.xD)}" stroke="#d89640" stroke-dasharray="5 5"/><path d="${curve}" fill="none" stroke="#2d9475" stroke-width="3"/>${study.points.map(p => `<circle cx="${x(p.stage)}" cy="${y(p.propaneFraction)}" r="3" fill="#2d9475"/>`).join('')}${[...new Set([0, Math.ceil(study.stages / 2), study.stages])].map(n => `<text x="${x(n)}" y="222" text-anchor="middle" font-size="12" fill="#6c858d">${n}</text>`).join('')}<text x="300" y="243" text-anchor="middle" font-size="12" fill="#6c858d">Ideal equilibrium stages from the reference bottoms</text></svg><p class="stage-caption"><span class="dot propane"></span> Ideal composition limit · <span class="dot butane"></span> Dashed: ${number(study.xD * 100)}% split-case target. ${study.meetsIdealLimit ? 'Your count meets this ideal lower bound; finite-reflux feasibility is not established.' : 'Your count is below the ideal minimum for the split-case target.'}</p>`;
  }
  $('edit-stages').addEventListener('click', () => { $('stages').scrollIntoView({ block: 'center', behavior: 'smooth' }); $('stages').focus({ preventScroll: true }); });
  function renderDiagnostics(inputs = getDraft()) {
    const errors = explainInputErrors(inputs);
    $('input-diagnostics').innerHTML = errors.length ? errors.map(error => `<article class="input-error-card"><strong>${html(error.message)}</strong><p>${html(error.explanation.reason)}</p><p><b>Try this:</b> ${html(error.explanation.fix)}</p></article>`).join('') : '<div class="input-valid-card"><strong>All current values are inside the model’s accepted range.</strong><p>You can use Review & run. The preview may still flag an idle outlet, poor separation, or a model limitation; these are explanations, not automatically rejected cases.</p></div>';
  }
  $('help-topic').innerHTML = Object.entries(INPUT_EXPLANATIONS).map(([key, item]) => `<option value="${key}">${html(item.title)}</option>`).join('');
  function renderHelpTopic() {
    const item = INPUT_EXPLANATIONS[$('help-topic').value];
    $('help-answer').innerHTML = `<h3>${html(item.title)}</h3><div class="formula">${html(item.rule)}</div><h4>Why the rule exists</h4><p>${html(item.reason)}</p><h4>What to do next</h4><p>${html(item.fix)}</p>`;
  }
  $('help-topic').addEventListener('change', renderHelpTopic);

  $('reliability-inputs').innerHTML = RELIABILITY_PARTS.map(part => `<div class="reliability-part"><label class="part-toggle"><input type="checkbox" id="include-${part.id}" checked>${part.label}</label><label for="mttf-${part.id}">Assumed MTTF <span>hours</span></label><input type="number" id="mttf-${part.id}" value="${RELIABILITY_DEFAULTS[part.id]}" min="1" max="1000000000" step="any" required></div>`).join('');
  function clearReliability(message, error = false) {
    $('reliability-error').textContent = message; $('reliability-error').classList.toggle('error', error);
    $('failure-probability').textContent = '—'; $('failure-caption').textContent = message;
    $('failure-table').innerHTML = ''; $('reliability-chart').innerHTML = ''; $('failure-interpretation').textContent = '';
  }
  function renderReliability() {
    const value = id => $(id).value.trim() === '' ? NaN : Number($(id).value);
    try {
      const result = calculateReliability(value('mission-hours'), RELIABILITY_PARTS.filter(part => $(`include-${part.id}`).checked).map(part => ({ ...part, mttf: value(`mttf-${part.id}`) })));
      $('reliability-error').textContent = 'Calculated from the selected example assumptions.'; $('reliability-error').classList.remove('error');
      $('failure-probability').textContent = percent(result.probability);
      $('failure-caption').textContent = `Over ${number(result.hours)} hours · ${result.parts.length} independent component${result.parts.length === 1 ? '' : 's'} · assumed constant rates`;
      $('failure-table').innerHTML = result.parts.map(part => `<tr><td>${part.label}</td><td>${number(part.mttf)} h</td><td>${percent(part.probability)}</td></tr>`).join('');
      $('failure-interpretation').textContent = `Probability of no listed first failure: ${percent(result.survival)}. Combined mean time to first listed failure: ${number(result.meanTimeToFirstFailure)} h. This mean is not a guaranteed lifetime.`;
      const maxTime = result.hours || 1, x = t => 48 + t / maxTime * 470, y = p => 180 - p * 140;
      const points = Array.from({ length: 81 }, (_, i) => { const t = i / 80 * maxTime; return `${i ? 'L' : 'M'}${x(t).toFixed(2)} ${y(-Math.expm1(-t * result.totalRate)).toFixed(2)}`; }).join(' ');
      $('reliability-chart').innerHTML = `<svg viewBox="0 0 560 225" role="img" aria-labelledby="reliability-chart-title"><title id="reliability-chart-title">Probability of any listed first failure rises from zero to ${percent(-Math.expm1(-maxTime * result.totalRate))} over ${number(maxTime)} hours under your assumptions.</title>${[0, 0.5, 1].map(p => `<line x1="48" x2="518" y1="${y(p)}" y2="${y(p)}" stroke="#345059"/><text x="39" y="${y(p) + 4}" text-anchor="end" fill="#b5cbd0" font-size="12">${p * 100}%</text>`).join('')}<path d="${points}" stroke="#65d9b0" fill="none" stroke-width="3"/><circle cx="${x(result.hours)}" cy="${y(result.probability)}" r="5" fill="#f6be65"/><text x="48" y="205" fill="#b5cbd0" font-size="12">0 h</text><text x="518" y="205" text-anchor="end" fill="#b5cbd0" font-size="12">${number(maxTime)} h</text></svg>`;
    } catch (error) { clearReliability(error.message, true); }
  }
  $('reliability-form').addEventListener('submit', event => { event.preventDefault(); renderReliability(); });
  $('reliability-form').addEventListener('input', () => {
    RELIABILITY_PARTS.forEach(part => { $(`mttf-${part.id}`).disabled = !$(`include-${part.id}`).checked; });
    clearReliability('Assumptions changed. Calculate to update the probabilities.');
  });
  $('reset-reliability').addEventListener('click', () => {
    $('mission-hours').value = RELIABILITY_DEFAULTS.hours;
    RELIABILITY_PARTS.forEach(part => { $(`include-${part.id}`).checked = true; $(`mttf-${part.id}`).disabled = false; $(`mttf-${part.id}`).value = RELIABILITY_DEFAULTS[part.id]; });
    renderReliability();
  });
  renderLearning(); renderGlossary(); renderCode(); renderReliability(); renderStages(); renderDiagnostics(); renderHelpTopic();
  return { openReview, draftChanged: renderDiagnostics, refresh() { renderLearning(); renderCode(); renderStages(); } };
}
