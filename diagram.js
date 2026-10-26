/** A three-phase flash and propane-recovery column, drawn as accessible SVG. */
let diagramSequence = 0;

const COLORS = {
  ink: '#e8f1f4', muted: '#93a8b3', steel: '#49616e',
  gas: '#65d9b0', liquid: '#f6be65', water: '#6db8ff',
};

function number(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(Number(value));
}

function amount(stream) {
  if (stream?.total >= 10000) {
    return `${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(stream.total)} mol/h`;
  }
  return `${number(stream?.total, 1)} mol/h`;
}

function purity(stream) {
  if (stream && !stream.available) return 'No flow';
  const value = stream?.fractions?.propane;
  return value === undefined || !Number.isFinite(Number(value))
    ? 'Propane fraction unavailable'
    : `${number(Number(value) * 100, 1)}% propane`;
}

/**
 * Render the process diagram from the model's molar stream results.
 * Click / keyboard activation is handled by the parent via [data-unit].
 */
export function renderDiagram(result, selected = 'flash') {
  const id = `propane-flow-${++diagramSequence}`;
  const streams = Object.fromEntries((result?.streams || []).map(stream => [stream.id, stream]));
  const inputs = result?.inputs || {};
  const selectedClass = unit => selected === unit ? ' is-selected' : '';
  const unitAttributes = (unit, label) => `class="process-unit${selectedClass(unit)}" data-unit="${unit}" role="button" tabindex="0" aria-label="${label}" aria-pressed="${selected === unit}"`;
  const path = (d, color, stream, arrow = true) => `
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" opacity=".3" />
    <path class="flow-line${stream?.available ? '' : ' is-idle'}" d="${d}" fill="none" stroke="${color}" stroke-width="2.2"${arrow ? ` marker-end="url(#${id}-${color.slice(1)})"` : ''} />`;
  const trays = [181, 207, 233, 259, 285, 311, 337].map((y, index) => `
    <path d="M${index % 2 ? 685 : 678} ${y} H${index % 2 ? 737 : 730} ${index % 2 ? 'v-7' : 'v7'}" fill="none" stroke="#91a7ae" stroke-width="1.5" opacity=".75"/>
    <circle cx="${index % 2 ? 696 : 719}" cy="${y - 7}" r="2" fill="${COLORS.liquid}" opacity=".65"/>`).join('');

  return `<svg class="propane-flowsheet" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 440" role="group" aria-labelledby="${id}-title ${id}-description">
  <title id="${id}-title">Propane separation process: three-phase flash and recovery column</title>
  <desc id="${id}-description">Feed enters a flash vessel with three separate outlets: propane-rich gas from the top, hydrocarbon condensate from the middle to a distillation column, and water from the bottom. The column recovers additional propane overhead and a heavier hydrocarbon bottoms stream. Select feed, flash vessel, column, or water outlet to inspect the process. Flow values are in moles per hour. This is a simplified process illustration.</desc>
  <defs>
    ${[COLORS.gas, COLORS.liquid, COLORS.water, COLORS.muted].map(color => `<marker id="${id}-${color.slice(1)}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L7 3.5 L0 7 Z" fill="${color}"/></marker>`).join('')}
    <clipPath id="${id}-vessel"><path d="M240 160 C240 136 375 136 375 160 V337 C375 361 240 361 240 337 Z"/></clipPath>
    <filter id="${id}-selection" x="-30%" y="-25%" width="160%" height="150%"><feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#8eb9ca" flood-opacity=".18"/></filter>
  </defs>
  <style>
    .propane-flowsheet { display: block; width: 100%; font-family: Arial, Helvetica, sans-serif; }
    .propane-flowsheet text { pointer-events: none; }
    .propane-flowsheet .flow-line { stroke-dasharray: 7 10; stroke-linecap: round; stroke-linejoin: round; animation: propane-flow 1.4s linear infinite; }
    .propane-flowsheet .flow-line.is-idle { animation: none; opacity: .2; }
    .motion-paused .propane-flowsheet .flow-line,
    .propane-flowsheet.motion-paused .flow-line { animation-play-state: paused; }
    .propane-flowsheet .process-unit { cursor: pointer; outline: none; }
    .propane-flowsheet .unit-outline { transition: stroke .18s, stroke-width .18s; }
    .propane-flowsheet .process-unit:hover .unit-outline,
    .propane-flowsheet .process-unit:focus-visible .unit-outline { stroke: #e8f1f4; stroke-width: 2.5; }
    .propane-flowsheet .is-selected .unit-outline { stroke: #b0cfda; stroke-width: 2; filter: url(#${id}-selection); }
    .propane-flowsheet .eyebrow { font-size: 9px; font-weight: 700; letter-spacing: 1.5px; }
    .propane-flowsheet .unit-name { font-size: 13px; font-weight: 700; letter-spacing: .1px; }
    .propane-flowsheet .value { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .propane-flowsheet .detail { font-size: 10px; font-variant-numeric: tabular-nums; }
    @keyframes propane-flow { to { stroke-dashoffset: -34; } }
    @media (prefers-reduced-motion: reduce) { .propane-flowsheet .flow-line { animation: none; } }
  </style>

  <!-- Process piping is below equipment and labels for clear junctions. -->
  ${path('M147 235 H240', COLORS.muted, streams.feed)}
  ${path('M307.5 145 V78 Q307.5 66 319.5 66 H520', COLORS.gas, streams.flashGas)}
  ${path('M375 260 H670', COLORS.liquid, streams.condensate)}
  ${path('M307.5 354 V385 Q307.5 397 319.5 397 H515', COLORS.water, streams.water)}
  ${path('M707.5 150 V127 Q707.5 115 719.5 115 H875', COLORS.gas, streams.product)}
  ${path('M707.5 360 V375 Q707.5 385 719.5 385 H875', COLORS.liquid, streams.bottoms)}

  <text x="402" y="51" text-anchor="middle" fill="${COLORS.gas}" class="eyebrow">TOP · GAS</text>
  <text x="518" y="240" text-anchor="middle" fill="${COLORS.liquid}" class="eyebrow">MIDDLE · CONDENSATE</text>
  <text x="518" y="282" text-anchor="middle" fill="${COLORS.ink}" class="detail">${amount(streams.condensate)}</text>
  <text x="402" y="382" text-anchor="middle" fill="${COLORS.water}" class="eyebrow">BOTTOM · WATER</text>

  <g ${unitAttributes('feed', 'Inspect feed composition and operating conditions')}>
    <rect class="unit-outline" x="32" y="205" width="115" height="64" rx="10" fill="#14232e" stroke="${COLORS.steel}"/>
    <circle cx="49" cy="223" r="3" fill="${COLORS.muted}"/>
    <text x="61" y="227" fill="${COLORS.muted}" class="eyebrow">FEED</text>
    <text x="48" y="250" fill="${COLORS.ink}" class="value">${amount(streams.feed)}</text>
    <text x="89" y="291" text-anchor="middle" fill="${COLORS.muted}" class="detail">${number(inputs.temperature, 1)} °C · ${number(inputs.pressure, 1)} bar</text>
  </g>

  <g ${unitAttributes('flash', 'Inspect three-phase flash separation')}>
    <text x="236" y="112" text-anchor="end" fill="${COLORS.ink}" class="unit-name">Three-phase flash</text>
    <text x="236" y="127" text-anchor="end" fill="${COLORS.muted}" class="eyebrow">V-101</text>
    <g clip-path="url(#${id}-vessel)">
      <rect x="240" y="140" width="135" height="81" fill="#193632"/>
      <rect x="240" y="221" width="135" height="74" fill="#3d3323"/>
      <rect x="240" y="295" width="135" height="68" fill="#19354c"/>
      <ellipse cx="307.5" cy="221" rx="67.5" ry="8" fill="none" stroke="${COLORS.liquid}" stroke-opacity=".55" stroke-dasharray="4 5"/>
      <ellipse cx="307.5" cy="295" rx="67.5" ry="8" fill="none" stroke="${COLORS.water}" stroke-opacity=".65" stroke-dasharray="4 5"/>
      <path d="M253 170 V333" stroke="#fff" stroke-opacity=".07" stroke-width="2"/>
    </g>
    <path class="unit-outline" d="M240 160 C240 136 375 136 375 160 V337 C375 361 240 361 240 337 Z" fill="none" stroke="${COLORS.steel}" stroke-width="1.5"/>
    <path d="M240 160 C240 184 375 184 375 160" fill="none" stroke="#8eaaa7" stroke-opacity=".3"/>
    <text x="307.5" y="195" text-anchor="middle" fill="${COLORS.gas}" class="eyebrow">VAPOR</text>
    <text x="307.5" y="257" text-anchor="middle" fill="${COLORS.liquid}" class="eyebrow">HYDROCARBON</text>
    <text x="307.5" y="272" text-anchor="middle" fill="${COLORS.liquid}" class="detail">liquid phase</text>
    <text x="307.5" y="327" text-anchor="middle" fill="${COLORS.water}" class="eyebrow">AQUEOUS</text>
    <circle cx="307.5" cy="145" r="4" fill="${COLORS.gas}"/>
    <circle cx="375" cy="260" r="4" fill="${COLORS.liquid}"/>
    <circle cx="307.5" cy="354" r="4" fill="${COLORS.water}"/>
  </g>

  <g aria-label="Propane-rich flash gas outlet">
    <rect x="520" y="33" width="143" height="72" rx="10" fill="#142d29" stroke="${COLORS.gas}" stroke-opacity=".45"/>
    <text x="536" y="54" fill="${COLORS.gas}" class="eyebrow">FLASH GAS</text>
    <text x="536" y="76" fill="${COLORS.ink}" class="value">${amount(streams.flashGas)}</text>
    <text x="536" y="93" fill="${COLORS.gas}" class="detail">${purity(streams.flashGas)}</text>
  </g>

  <!-- The reflux and reboiler loops suggest column operation schematically. -->
  <path d="M818 115 V173 Q818 185 806 185 H745" fill="none" stroke="${COLORS.gas}" stroke-width="1.5" opacity=".6" marker-end="url(#${id}-${COLORS.gas.slice(1)})"/>
  <circle cx="778" cy="115" r="13" fill="#11252d" stroke="${COLORS.gas}" stroke-width="1.5"/>
  <path d="M770 120 L786 110 M774 123 L782 107" stroke="${COLORS.gas}" stroke-width="1.3" opacity=".8"/>
  <text x="778" y="91" text-anchor="middle" fill="${COLORS.muted}" class="eyebrow" style="font-size:8px">CONDENSER</text>
  <text x="807" y="168" text-anchor="end" fill="${COLORS.muted}" class="detail">reflux</text>
  <path d="M745 305 H776 Q788 305 788 317 M788 343 V345 H745" fill="none" stroke="${COLORS.liquid}" stroke-width="1.5" opacity=".65" marker-end="url(#${id}-${COLORS.liquid.slice(1)})"/>
  <circle cx="788" cy="330" r="13" fill="#2b2924" stroke="${COLORS.liquid}" stroke-width="1.5"/>
  <path d="M780 333 L784 327 L788 333 L792 327 L796 333" fill="none" stroke="${COLORS.liquid}" stroke-width="1.1"/>
  <text x="811" y="334" fill="${COLORS.muted}" class="detail">reboiler</text>

  <g ${unitAttributes('tower', 'Inspect propane recovery distillation column')}>
    <text x="707.5" y="52" text-anchor="middle" fill="${COLORS.ink}" class="unit-name">Recovery</text>
    <text x="707.5" y="68" text-anchor="middle" fill="${COLORS.ink}" class="unit-name">column</text>
    <rect class="unit-outline" x="670" y="150" width="75" height="210" rx="24" fill="#1d2b2e" stroke="${COLORS.steel}" stroke-width="1.5"/>
    <path d="M670 174 Q707.5 189 745 174 M670 336 Q707.5 351 745 336" fill="none" stroke="#7b969c" stroke-opacity=".25"/>
    ${trays}
    <text x="760" y="425" text-anchor="middle" fill="${COLORS.muted}" class="eyebrow">T-101 · SCHEMATIC</text>
    <circle cx="670" cy="260" r="4" fill="${COLORS.liquid}"/>
  </g>

  <g aria-label="Column propane product">
    <rect x="875" y="84" width="112" height="73" rx="10" fill="#142d29" stroke="${COLORS.gas}" stroke-opacity=".45"/>
    <text x="888" y="105" fill="${COLORS.gas}" class="eyebrow">PROPANE</text>
    <text x="888" y="127" fill="${COLORS.ink}" class="value" style="font-size:13px">${amount(streams.product)}</text>
    <text x="888" y="144" fill="${COLORS.gas}" class="detail">${purity(streams.product)}</text>
  </g>

  <g ${unitAttributes('water', 'Inspect separated aqueous outlet')}>
    <rect class="unit-outline" x="515" y="367" width="145" height="60" rx="10" fill="#142b3c" stroke="${COLORS.water}" stroke-opacity=".5"/>
    <text x="532" y="388" fill="${COLORS.water}" class="eyebrow">WATER OUTLET</text>
    <text x="532" y="411" fill="${COLORS.ink}" class="value">${amount(streams.water)}</text>
  </g>

  <g aria-label="Heavier hydrocarbon column bottoms">
    <rect x="875" y="353" width="112" height="65" rx="10" fill="#2c2a24" stroke="${COLORS.liquid}" stroke-opacity=".4"/>
    <text x="888" y="373" fill="${COLORS.liquid}" class="eyebrow">HEAVIER HC</text>
    <text x="888" y="397" fill="${COLORS.ink}" class="value" style="font-size:13px">${amount(streams.bottoms)}</text>
  </g>
</svg>`;
}
