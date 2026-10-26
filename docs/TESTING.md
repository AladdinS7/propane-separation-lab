# Verification report — Student Studio v3

Verified on 2026-10-26 against the public GitHub Pages deployment.

## Automated checks

`node --test tests/*.test.mjs`: **25 passed, 0 failed**.

Coverage includes reference Antoine vapor pressures; flash equilibrium; component and overall balances across 500 deterministic operating cases; single-phase, pure-component and zero-flow endpoints; specified tower splits; invalid inputs; sensitivity curves; JSON and CSV parsing, malformed input and roundtrips; annualized costs; non-mutating case advice; pressure recommendations across temperatures and feed ratios; analytical reliability references, independence, monotonicity, zero time and small probabilities; Fenske reference equations and 1–40 stages; unavailable stage-study endpoints; input-error explanations; and all actual-source excerpt boundaries.

HTML checks confirm unique static IDs, existing local linked files, and valid navigation targets. JavaScript syntax checks passed.

## Live browser verification

**95 recorded checks passed.** Tested desktop and 390 × 844 mobile viewports, using real controls and downloads. No captured JavaScript errors. All seven mobile views stayed within the page width; wide diagrams and source excerpts scroll within their own containers. The review dialog remains usable at mobile size.

Additional observations: the copy-source action reported successful copying; JSON and CSV downloads were read and checked; imported JSON returned to a reviewable draft. No live AI backend or external API key is used.

- invalid pressure blocks run
- input assistant explains rejected pressure
- help topic flow
- help topic composition
- help topic temperature
- help topic pressure
- help topic tower
- help topic stages
- help topic number
- help topic reliability
- review explains idle tower
- cancel preserves calculated results
- suggestion is a draft
- suggestion does not silently calculate
- suggested case runs after review
- continue retains user pressure and recovers all HC gas
- zero-flow product purity is undefined
- fractional stage rejected
- stage count changes ideal study
- stage study does not overwrite specified stream splits
- Escape closes review
- preset gas balance
- preset liquid balance
- preset binary balance
- preset baseline balance
- diagram feed details
- diagram flash details
- diagram tower details
- diagram water details
- diagram keyboard activation
- pause flow
- resume flow
- sweep temperature
- sweep pressure
- comparison 3 review and apply
- comparison 6 review and apply
- comparison 12 review and apply
- zero feed has undefined recovery
- quiz handles no answer
- quiz explains incorrect answer
- lesson 1 check
- lesson 2 check
- lesson 3 check
- lesson 4 check
- lesson 5 check
- lesson 6 check
- lesson 7 check
- lesson 8 check
- all lesson progress
- last lesson next disabled
- previous lesson
- progress persists after reload
- glossary search
- glossary empty state
- code excerpt 1
- code excerpt 2
- code excerpt 3
- code excerpt 4
- code excerpt 5
- code excerpt 6
- code excerpt 7
- code excerpt 8
- default reliability probability
- reliability edits clear stale estimate
- 8000 hour probability
- zero mission probability
- empty component selection explained
- zero MTTF rejected
- single pump estimate
- reliability reset
- default annual cost
- economics recalculation
- case download contains calculated values and stages
- stream CSV download has all streams
- export preserves calculated case during edits
- JSON import loads reviewable values
- lesson 1 try-it action
- lesson 2 try-it action
- lesson 3 try-it action
- lesson 4 try-it action
- lesson 5 try-it action
- lesson 6 try-it action
- lesson 7 try-it action
- lesson 8 try-it action
- teaching example loads
- edit stages focuses count
- mobile no page overflow simulation
- mobile no page overflow analysis
- mobile no page overflow economics
- mobile no page overflow learn
- mobile no page overflow code
- mobile no page overflow reliability
- mobile no page overflow help
- mobile continue action
- 40-stage endpoint displayed honestly

## Scope and limits

These checks verify the implementation of the stated teaching approximations. They do not validate real equipment, plant safety, or a finite-reflux column design. Reliability rates are hypothetical. The input assistant is deterministic guidance. Browser checks were performed through the interactive browser and are recorded here; they are not presented as an automated Playwright test suite in the repository.

The local sandbox did not permit binding a preview HTTP server, so browser verification used the deployed website after the automated tests passed.
