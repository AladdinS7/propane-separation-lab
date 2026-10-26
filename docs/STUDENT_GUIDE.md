# Propane Lab: a student guide

Start in **Learn** for eight short lessons and check-your-understanding questions. No background in separation processes is required. Progress is saved only in your browser; Reset progress clears it. The glossary searches both terms and explanations.

## A first experiment

1. Load the teaching example: 100 mol/h, 50% propane, 30% n-butane, 20% water; 25 °C and 6 bar absolute.
2. Click a field to see its meaning, units, and a useful starting point.
3. Choose **Review & run**. Read the phase preview and recommendations.
4. Choose **Continue with my values** to calculate exactly that case, **Back to edit**, or **Load suggested values for review**. Suggestions are drafts; they never silently replace calculated results.
5. Click the feed, flash, tower, or water outlet in the process diagram. Keyboard users can focus a unit and press Enter or Space.
6. Compare the stream ledger and the recovery/purity metrics. The condensate is an internal stream, so do not add it again in an overall balance.
7. In Analysis, compare 3, 6, and 12 bar. Keep other inputs fixed. A pressure choice opens the same review step.

Top gas is one recovered-propane route. Middle hydrocarbon condensate goes to the tower for more propane recovery. Bottom free water bypasses the tower. An outlet can have zero flow even though it appears in the drawing.

## What happens when an input is rejected?

Open **Input help**. The study assistant explains the current draft's errors, why each rule exists, and how to correct them. It is built-in, rule-based guidance, not a connected generative AI service. It uses no API key and sends no case values to a server.

- Feed fractions must be 0–100 mol % and sum to 100%. The app does not silently normalize a materially incorrect mixture.
- Temperature is limited to 5–85 °C to stay inside both selected Antoine correlation ranges.
- Pressure is 0.5–30 bar absolute. Zero pressure would divide by zero in K = Psat/P. These are model bounds, not vessel ratings.
- Total flow is 0–1,000,000 mol/h. Zero is a valid idle case; a negative inlet flow is outside the app's defined flow direction.
- Each tower split is 0–100% of the named component entering the tower, not a product-purity specification.
- Equilibrium stages are whole numbers from 1 to 40. Forty is an interface limit, not a universal tower limit.

Idle outlets, no water, or poor enrichment are valid cases with explanatory feedback. Warnings do not automatically block a valid learning experiment.

## Editable equilibrium stages

The tower section contains a visible **Equilibrium stages** input. Review and run after changing it. The stage study below the stream ledger shows the total-reflux limit from the Fenske equation:

`Nmin = ln[(xD/(1-xD)) / (xB/(1-xB))] / ln(alpha)`

Here xD and xB are the reference propane mole fractions from your specified-split tower case. Alpha is Kpropane/Kbutane at the flash temperature, held constant as a teaching approximation. At N ideal stages, the overhead-to-butane odds equal the reference bottoms odds times alpha^N.

An equilibrium reboiler counts as a stage; a total condenser does not. The minimum may be fractional, but an actual chosen count is rounded upward. A finite-reflux design generally needs more stages.

**Total reflux has no feed or product withdrawal.** The stage curve is a limiting composition study, not an operating-column calculation. It does not overwrite the flowing stream ledger or claim that the chosen splits are physically achievable. Idle, pure-product, and non-enriching endpoint cases display an explanation instead of an invalid stage estimate.

Source: [ETH Zürich, Fenske equation](https://www.hyper-tvt.ethz.ch/distillation-multicomponent-fenske.html).

## Failure probabilities

Reliability is a separate educational calculator. Default MTTFs—40,000 h for the condensate pump, 80,000 h for the valve, and 100,000 h for the instrument—are **invented teaching assumptions**, not equipment data.

For a constant failure rate, `lambda = 1/MTTF` and `P(first failure by t) = 1-exp(-lambda*t)`.

For independent selected components, `P(any listed first failure) = 1-exp(-t*sum(lambda))`. Do not simply add the individual percentages. The units start functioning at time zero; the calculation concerns first failure and excludes repairs. A series-system failure interpretation applies only if the first failure of any listed part stops the system.

Change the mission hours, select components, edit lifetimes, and calculate. Changed assumptions clear the displayed estimate until recalculated. Zero mission time is permitted; zero lifetime and an empty component selection are not. The chart includes only the selected parts.

The result is not an accident, leak, fire, explosion, injury, or equipment-safety probability. The flash conditions do not determine these rates. Real estimates need relevant data, uncertainties, defined failure modes, common-cause treatment, aging, maintenance, and redundancy as appropriate.

Sources: [NIST exponential model](https://www.itl.nist.gov/div898/handbook/apr/section1/apr161.htm), [NIST series model](https://www.itl.nist.gov/div898/handbook/apr/section1/apr182.htm).

## Code and data

**Code explained** loads actual source excerpts with line numbers, inputs, outputs, and worked examples. Copy an excerpt or open/download the complete file. Source-fetch and clipboard failures have explicit fallback messages.

Export case saves the last calculated case, including stage count. Draft edits do not silently replace it. Import accepts numeric JSON or a one-row CSV, validates it, and loads it for review. Stream CSV exports the calculated stream ledger; absent-phase compositions are blank. Costs are independent annualized assumptions, not flash-derived duties.

For full equations and limitations see [MODEL.md](MODEL.md); for import/export formats see [DATA.md](DATA.md).
