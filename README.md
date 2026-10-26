# Propane Separation Lab

An interactive process engineering teaching website focused on recovering propane from a propane, n-butane, and water feed. Explore how a three-outlet flash separator sends vapor overhead, hydrocarbon condensate to a depropanizer, and a separate aqueous stream out of the vessel bottom.

This is a new implementation inspired by [kconner25/propane-water-flash-repository](https://github.com/kconner25/propane-water-flash-repository) and the supplied project brainstorm. The implementation was written afresh; no source code from the reference repository was copied. It uses plain HTML, CSS, and JavaScript: no build step, packages, CDN libraries, or hosted calculation service are required.

## Process arrangement

```text
                                    ┌─ Top: propane-rich flash vapor
Mixed C3 / C4 / water feed → Flash ──┼─ Middle: hydrocarbon condensate → Depropanizer
                                    │                                  ├─ Propane overhead
                                    │                                  └─ C4-rich bottoms
                                    └─ Bottom: aqueous outlet
```

The three separator outlets represent distinct phases. The middle outlet is liquid hydrocarbon condensate; it feeds the fractionation tower. The flash overhead is a propane-rich vapor stream, not a guarantee of pure propane. A downstream product specification would require further equipment and rigorous modeling.

Adding n-butane gives the tower a meaningful hydrocarbon separation task: propane is the lighter component and n-butane the heavier component. The original project's water stripper is replaced by a depropanizer concept.

## Run locally

Use Python 3 to serve the project directory:

```bash
cd propane-separation-lab
python3 -m http.server 4173
```

Open [http://localhost:4173](http://localhost:4173). Serving the files ensures the browser can load JavaScript modules correctly. Alternatively, `npm run serve` runs the same server. No `npm install` is needed.

Run the numerical checks with Node.js 20 or later:

```bash
npm test
```

## Load a case

Use **Import case** to load JSON or CSV. Start with [`example-case.json`](example-case.json), edit only the numbers, and import the file again. Keep the three feed composition percentages at a total of 100.

```json
{
  "flow": 100,
  "propane": 50,
  "butane": 30,
  "water": 20,
  "temperature": 25,
  "pressure": 6,
  "c3Recovery": 95,
  "c4Carryover": 5,
  "stages": 8
}
```

JSON can be a flat input object as above, or an object with an `inputs` property containing those values. CSV cases use a header row of input keys followed by one row of values:

```csv
flow,propane,butane,water,temperature,pressure,c3Recovery,c4Carryover,stages
100,50,30,20,25,6,95,5,8
```

Use **Export case** to save JSON for a later session. **Download CSV** beside the stream ledger exports calculated outlet results; it is a report, not an input case.

Case files must be smaller than 100 KB. The optional `stages` field defaults to 8 when omitted; the other input fields are required. See [`docs/DATA.md`](docs/DATA.md) for the complete data format.

`flow` is total feed in mol/h. `propane`, `butane`, and `water` are feed molar percentages. `temperature` is in degrees Celsius and `pressure` is absolute pressure in bar. `c3Recovery` is the percentage of propane entering the tower that is assigned to its overhead; `c4Carryover` is the percentage of tower-feed n-butane assigned to the same stream. `stages` is a retained case value for the model's illustrative stage profile. These tower split settings are scenario inputs, not guaranteed outcomes from a rigorous column design.

The teaching range is 5–85 °C, 0.5–30 bar absolute, and 1–40 illustrative stages. Stage count does not change the assumed component recoveries. Tray symbols in the process drawing are schematic.

Only structured case values are supported. A PDF, drawing, photograph, or prose document is not a simulation case. No file is uploaded to a remote calculation service by this static app.

## Publish in a new GitHub repository

Create a repository under your account, such as `AladdinS7/propane-separation-lab`, and push the contents of this folder to its `main` branch. Keep `.github/workflows/pages.yml` in place; dotfolders may be hidden by your file browser.

From the project directory, with GitHub CLI authentication already configured:

```bash
git init -b main
git add .
git commit -m "Build interactive propane separation lab"
gh repo create AladdinS7/propane-separation-lab --public --source=. --remote=origin --push
```

If the repository already exists, set its remote and push the local `main` branch instead of creating another repository. Review the files before pushing. The commands above create a public repository.

In the repository's **Settings → Pages**, select **GitHub Actions** as the source. The included workflow tests the numerical model, packages the static website, and deploys successful changes on `main`. Pull requests run the model checks without deploying. If Pages was enabled after the first push, rerun the workflow from **Actions**, or use its **Run workflow** button.

The intended published address is [https://aladdins7.github.io/propane-separation-lab/](https://aladdins7.github.io/propane-separation-lab/). That address works only after the repository and a successful Pages deployment exist.

## Source layout

| File | Purpose |
| --- | --- |
| `index.html` | Accessible page structure and teaching content |
| `styles.css` | Responsive visual design |
| `app.js` | Inputs, interactive process diagram, charts, and case handling |
| `data.js` | Case parsing and export helpers |
| `diagram.js` | Interactive SVG separator and tower illustration |
| `model.js` | Pure numerical calculations and model assumptions |
| `favicon.svg` | Browser tab icon |
| `tests/*.test.mjs` | Numerical and validation checks |
| `example-case.json` | A reusable example input case |
| `docs/MODEL.md` | Model equations, assumptions, and primary references |
| `docs/DATA.md` | Import/export formats and displayed annual cost calculation |
| `.github/workflows/pages.yml` | Tests and static GitHub Pages deployment |

## Engineering scope

The site is a teaching and scenario exploration model. A three-outlet drawing does not establish that three phases exist at every chosen condition: an outlet can have zero flow. Review the model assumptions alongside each result.

The model routes all feed water to the bottom aqueous outlet. The hydrocarbon flash uses Antoine vapor pressures, `Kᵢ = Pᵢˢᵃᵗ / P`, and the Rachford–Rice equation to split propane and n-butane between vapor and condensate. This free-water idealization is not a rigorous three-phase equilibrium calculation. Dissolved hydrocarbons in water, dissolved water in hydrocarbons, water vapor, nonideal phase behavior, entrainment, and separator residence time are omitted. A real propane/water system needs an appropriate thermodynamic package and validated vapor–liquid–liquid equilibrium calculations. See [`docs/MODEL.md`](docs/MODEL.md) for equations and references.

The tower is a component split teaching model. Recoveries and carryover are user-selected assumptions; stage illustrations are not a tray design, and stage count alone does not predict a physically achievable separation. Reflux, boilup, pressure profile, energy balances, tray efficiency, hydraulics, and condenser/reboiler design require further work.

The Economics view calculates annualized capital plus heating, electricity, and entered fixed operating costs. Each utility expense is the entered power demand multiplied by its energy price and annual operating hours. Capital cost, recovery factor, duties, and prices are explicit user assumptions; no equipment sizing or heat-duty prediction supplies them. The displayed result is an illustrative annual cost, not a profitability or payback prediction. See [`docs/DATA.md`](docs/DATA.md) for its arithmetic and units.

Qualitative operating feedback is not a probability of machinery failure. Failure probabilities cannot be calculated from this model without equipment, reliability, inspection, maintenance, and operating history data. This website is not intended for plant operation, pressure vessel sizing, relief design, or safety certification.

## Attribution

- Original educational website and process-sequencing idea: [kconner25/propane-water-flash-repository](https://github.com/kconner25/propane-water-flash-repository), with its [published demonstration](https://kconner25.github.io/propane-water-flash-repository/).
- Project direction: the user-provided *Brainstorm* document, including value import, feedback, graphs, and teaching concepts.
- Thermodynamic data and any equations used by this implementation are documented with the model and in the website's teaching content.

The new site changes the process from the reference's propane/water flash-and-stripper sequence to a propane/n-butane/water separator and depropanizer teaching sequence. Attribution is not an endorsement by the original author. No license grant is inferred from the reference repository.
