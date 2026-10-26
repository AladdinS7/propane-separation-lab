# What the model calculates

This is an educational separation model with an explicit hydrocarbon mixture. Its feed contains **propane, n-butane, and water**. The n-butane represents a heavier hydrocarbon that gives the condensate tower a meaningful propane-separation task. It is a declared extension of the original propane–water teaching example.

The vessel has three outlets: an upper hydrocarbon vapor outlet, a hydrocarbon condensate outlet connected to the tower, and a bottom water outlet. Phase conditions determine which outlets actually flow. A drawing with three outlets does not guarantee three nonzero streams.

SLB describes three-phase separators as separating gas, hydrocarbon liquid, and water, principally by gravity. Its separator literature also describes liquid retention and interface/outlet arrangements. The diagram uses this physical arrangement, but does not calculate vessel internals, residence time, carryover, or interface control. Sources: [SLB separator definition](https://glossary.slb.com/terms/s/separator), [SLB horizontal separator internals](https://www.slb.com/-/media/files/osf/product-sheet/natco-horizontal-separator-ps.ashx).

## Inputs and units

| Field | Meaning | Allowed input |
|---|---|---|
| `flow` | Total feed flow | 0–1,000,000 mol/h |
| `propane`, `butane`, `water` | Feed component mole percentages | 0–100 each, total 100 |
| `temperature` | Isothermal flash temperature | 5–85 °C |
| `pressure` | Flash absolute pressure | 0.5–30 bar abs |
| `c3Recovery` | Assumed fraction of condensate propane sent to tower overhead | 0–100% |
| `c4Carryover` | Assumed fraction of condensate n-butane sent to tower overhead | 0–100% |
| `stages` | Number of points in an explanatory tower composition trend | Whole number 1–40 |

These bounds define the teaching interface. They are **not equipment operating limits**. No vessel design pressure, material limits, hydraulic capacity, or equipment rating is inferred. Temperatures stay within both selected vapor-pressure correlation ranges. Valid inputs must be numbers; strings, infinity, missing fields, invalid compositions, and fractional stage counts are rejected. Only a composition-sum tolerance of one millionth of a percentage point is normalized.

## Free-water idealization

All water leaves through the bottom water outlet. All hydrocarbons are assigned to the vapor/condensate flash calculation. This assumes no water vapor, no dissolved hydrocarbon in water, no water in hydrocarbon liquid, and no entrainment. Accordingly, this is **a hydrocarbon VLE flash plus an ideal water split**, not a rigorous three-phase vapor–liquid–liquid equilibrium (VLLE) calculation.

This avoids the original model's use of ideal Raoult-law propane–water liquid equilibrium. Propane is only slightly soluble in water: NIST lists a Henry solubility coefficient of 0.0015 mol/(kg·bar) at 298.15 K, corresponding to dilute aqueous mole fractions on the order of 10⁻⁵ at approximately 1 bar propane partial pressure. That cannot justify a bulk aqueous phase with roughly 10 mol% dissolved propane. The new ideal water outlet is a simplifying assumption, not a prediction of zero real solubility. Source: [NIST propane Henry-law data](https://webbook.nist.gov/cgi/cbook.cgi?ID=C74986&Mask=10).

## Hydrocarbon flash

The hydrocarbon flow is `Fh = Fpropane + Fbutane`; hydrocarbon-basis feed fractions are `zi = Fi/Fh`. The calculation uses

```text
log10(Psat_i / bar) = Ai − Bi / (T_K + Ci)
Ki = Psat_i / P
sum_i [zi (Ki − 1) / (1 + beta (Ki − 1))] = 0
xi = zi / (1 + beta (Ki − 1))
yi = Ki xi
Vi = Fh beta yi
Li = Fi − Vi
```

`beta` is the vapor fraction of the **hydrocarbon feed**, excluding water. Bisection solves the Rachford–Rice equation between zero and one when two hydrocarbon phases exist. Bubble/dew endpoint checks otherwise assign all hydrocarbons to liquid or vapor. Material in a zero-flow phase has no physical composition; its stored fractions are zero, and `available` is false. At pure-component saturation, temperature and pressure do not determine the vapor fraction without an additional condition such as enthalpy. The implementation explicitly assigns the liquid endpoint and emits a warning.

| Component | A | B | C | Published temperature range |
|---|---:|---:|---:|---|
| Propane | 4.53678 | 1149.36 | 24.906 | 277.6–360.8 K |
| n-Butane | 4.35576 | 1175.581 | −2.071 | 272.66–425 K |

The NIST correlations yield approximately 9.53 bar propane vapor pressure and 2.43 bar n-butane vapor pressure at 25 °C. Sources: [NIST propane Antoine parameters](https://webbook.nist.gov/cgi/cbook.cgi?ID=C74986&Mask=4&Type=ANTOINE&Plot=on), [NIST n-butane Antoine parameters](https://webbook.nist.gov/cgi/cbook.cgi?ID=C106978&Mask=4&Type=ANTOINE&Plot=on).

The ideal-mixture `Ki` approximation ignores liquid activity effects and vapor fugacity. At elevated pressure, an equation of state and validated interaction parameters are needed for predictive work. The model emits a qualitative approximation warning above 10 bar; that threshold is an interface reminder, not a scientifically sharp validity boundary. There is no energy balance, heat-duty calculation, flashing-valve enthalpy calculation, or transient simulation.

## Condensate tower

The tower receives **only the hydrocarbon condensate**. For each component, a user-assumed split defines overhead and bottoms:

```text
Dpropane = Lpropane × c3Recovery / 100
Dbutane  = Lbutane  × c4Carryover / 100
Bpropane = Lpropane − Dpropane
Bbutane  = Lbutane  − Dbutane
```

The depropanizer concept is grounded in Honeywell UOP's fractionation process: a C3+ feed yields propane overhead and heavier bottoms, with overhead condensation/reflux and a reboiler. Source: [Honeywell UOP fractionation process](https://uop.honeywell.com/content/dam/uop/en-us/documents/equipment-aftermarket/modular/modular-gas-processing/modular-ngl/honeywell-uop-fractionation-datasheet.pdf).

This implementation does **not** solve tray equilibria, reflux, boilup, feed quality, condenser performance, or a rigorous distillation column. Recovery and carryover are assumptions, not predictions of achievable performance. Changing stage count only changes the number of points in a clearly identified illustrative trend; it never changes the calculated component recoveries. That trend is a linear interpolation between the specified product compositions, not an equilibrium-stage profile. If either tower product has zero flow, its composition is unavailable and no physical trend should be inferred.

## Metrics and balances

- **Overall propane recovery:** propane in flash gas plus tower overhead, divided by propane in the original feed.
- **Tower product purity:** propane mole fraction of tower overhead. This is distinct from overall recovery.
- **Flash propane recovery:** propane in the upper flash outlet divided by propane in the original feed.
- **Flash gas purity:** propane mole fraction of that gas. It can contain substantial n-butane.
- **Hydrocarbon vapor fraction:** hydrocarbon vapor divided by total hydrocarbon feed; water is excluded from this denominator.
- **Combined product purity:** propane in flash gas plus tower overhead divided by their combined molar flow, before any real mixing or conditioning.

Ratios with zero denominators are stored as zero for robust display; the accompanying zero-flow state indicates that physical purity or recovery may be undefined. Recovery does not establish a saleable product specification. The final balance includes flash gas, bottom water, tower overhead, and tower bottoms. Condensate is an intermediate stream and is not counted again. Each component is conserved independently.

## Scenario economics and operating feedback

`annualizedCost(assumptions)` in `data.js` accepts all cost and duty assumptions explicitly:

```text
capitalCost, capitalRecoveryFactor, hoursPerYear,
thermalDuty, electricLoad, heatPrice, electricityPrice, fixedOpex
```

All monetary values must use one consistent currency. Annualized capital is entered capital cost multiplied by the capital recovery factor. Annual utility expense is the sum of each entered duty in kW times its price per kWh times annual operating hours. Annual fixed OpEx is added directly. The result is the sum of these entered annual cost categories; revenue, profit, and payback are not calculated. Duties are user assumptions because the separation model has no energy balance. The calculation does not predict equipment costs or account for unspecified expenses. See [data APIs and economics example](DATA.md) for exact units and bounds.

Operating feedback is qualitative. Machinery-failure probabilities require equipment, condition, duty-cycle, and failure-history data with a calibrated reliability model. No such probabilities are invented here.

## Verification

Run `node --test tests/*.test.mjs`. Tests check reference vapor pressures, hydrocarbon equilibrium relations, all final component balances, pure-component and zero-flow endpoints, phase transitions, user-specified tower splits, stage-count independence, validation, pressure sensitivity, 500 deterministic input samples, case imports/exports, and annualized-cost arithmetic. Tests validate the implementation of the stated approximation; they do not validate the approximation against real plant performance.
