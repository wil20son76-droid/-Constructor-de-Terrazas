# Terrassdesigner

A professional web app for designing wooden decks (träterrasser) and
automatically calculating materials, cut lists, labour and costs for the
Swedish market. Built for construction companies: metric units (mm/cm/m/m²),
SEK pricing, Swedish material names, moms (VAT) and ROT-avdrag support.

A fully working visual designer + material/cost calculator, built on a
real, tested calculation engine — not a static mockup. Every formula has
been audited by hand; see [`CALCULATION_AUDIT.md`](./CALCULATION_AUDIT.md)
for the worked derivations behind every number the app produces.

**Live app:** https://wil20son76-droid.github.io/-Constructor-de-Terrazas/

> **⚠️ This application is a calculation and planning aid. Structural
> dimensions must be verified against applicable Swedish requirements and
> supplier documentation.**
>
> **Applikationen är ett projekterings- och kalkylhjälpmedel. Dimensionering
> ska kontrolleras mot gällande svenska krav och leverantörens
> anvisningar.**

## Stack

React + TypeScript + Vite + Tailwind CSS v4. Deck geometry is rendered with
SVG. State lives in a small Zustand store with undo/redo and LocalStorage
persistence. Tests run on Vitest. Node 22 LTS (see `.nvmrc`).

## Getting started

```bash
npm install
npm run dev         # start the dev server (http://localhost:5173, base "/")
```

## Running tests

```bash
npm test            # runs the full Vitest suite once (114 tests)
npm run test:watch  # watch mode
```

The suite includes hand-derived integration tests
(`src/integration-14x7.test.ts`, `src/integration-lshape.test.ts`,
`src/integration-ushape.test.ts`) whose expected values are computed by
hand in code comments — see `CALCULATION_AUDIT.md` for the full derivations
and the bugs this audit found and fixed.

## Type-checking, linting, building

```bash
npm run lint         # oxlint
npm run typecheck    # tsc -b --noEmit
npm run build        # tsc -b && vite build -> dist/
npm run preview      # serve the production build locally
```

All four (plus `npm test`) must pass before any deploy — see
`.github/workflows/ci.yml`, which runs on every push and pull request, and
`.github/workflows/deploy-pages.yml`, which runs the same checks and only
deploys if they all succeed.

## Deploying

Deployment is fully automated via GitHub Actions — **nothing is ever
pushed to `dist/` manually**. `.github/workflows/deploy-pages.yml`:

1. Triggers on every push to `main` (and can be run manually via
   **Actions → Deploy to GitHub Pages → Run workflow** against any branch).
2. Installs dependencies with `npm ci`, then runs lint, typecheck, test and
   build — the deploy step only runs if all of those succeed.
3. Uploads `dist/` as a Pages artifact and deploys it with the official
   `actions/deploy-pages` action.

The production build's asset base path (`/‑Constructor‑de‑Terrazas/`) is
derived automatically from the `GITHUB_REPOSITORY` environment variable
GitHub Actions sets (see `vite.config.ts`) — it is never hard-coded, so a
repository rename or fork still builds correct asset URLs. Local
development (`npm run dev`) always uses base `/`, since that env var isn't
set outside CI.

**One-time repository setting required:** GitHub Pages must be configured
to deploy via GitHub Actions (this cannot be done from a workflow file):
**Settings → Pages → Build and deployment → Source → GitHub Actions.**

## Architecture

All geometry and quantity calculations are pure, framework-free TypeScript
functions that work exclusively in **millimetres**. React components only
call into these modules and render their output — no formula lives inside a
component. This is what makes the numbers deterministic, reproducible and
unit-testable independently of the UI.

```
src/
  types/         Domain model (Project, DeckLevel, Material, BomLine, ...)
  geometry/      Polygon math: area/perimeter, shape builders, snapping,
                 point-in-polygon, edge-length editing
  deck/          Deck-board (trall) layout engine (orientation, gap, clipping),
                 edge classification (external/wall/stair/open), debug inspector
  structural/    Reglar/bärlinor/plintar/stolpar/kortlingar layout + stairs;
                 uniform CC-spacing engine (memberLayout.ts)
  materials/     BOM assembly, cut-length optimisation (mixed-stock bin
                 packing with lookahead), fastener counting
  pricing/       Cost summary: material + labour + påslag (markup) + moms + ROT
  labour/        Configurable productivity → hours → cost
  quotation/     Offert assembly (client-supplied materials excluded from
                 price but still listed in quantities)
  validation/    Non-normative sanity checks + the required disclaimer
  export/        CSV / JSON / print (PDF via browser print)
  data/          Seed material library, suppliers, default project
  store/         Zustand project store (undo/redo, LocalStorage)
  hooks/         useLevelCalculations — wires a DeckLevel through every
                 engine above and memoises the result for the UI
  components/    Three-panel UI: tools (left), interactive SVG plan with an
                 INSPECT/DEBUG mode (centre), properties/materials/costs (right)
```

### Why this split matters

- **geometry** never rotates/scales for pixels — the SVG plan view is the
  only place mm gets converted to screen space, and only for drawing.
- **deck** and **structural** share one scanline primitive
  (`structural/memberLayout.ts`) that clips parallel, evenly-spaced lines
  (boards, joists, or beams) against a polygon with holes — used for
  rectangles, L-shapes, U-shapes and free polygons alike. A concave notch
  correctly splits a single row into multiple disjoint segments (verified
  in `integration-ushape.test.ts`).
- **materials** turns geometry into a priced bill of materials, keeping
  **technical quantity** (what the design needs, for the plan) strictly
  separate from **purchase quantity** (what must actually be bought and
  cut, for cost). Long runs (e.g. a 14 m board row with only 5.4 m boards
  in stock) are split into physically buildable spliced segments *before*
  cut optimisation, which itself compares combinations of commercial
  lengths rather than forcing one uniform stock length for an entire job.
- **pricing/labour/validation** are all driven by user-editable
  configuration (productivity rates, påslag %, VAT, ROT percent/cap/
  eligibility-per-cost-category, recommended joist spacing per board).
  Nothing is hard-coded as "structurally correct" — the app surfaces
  warnings, never certification.
- An **INSPECT/DEBUG mode** (top bar) lets you click any board, joist,
  beam or footing on the plan and see its full technical record — real
  start/end coordinates, length, dimension, and (for lumber) exactly which
  purchased stock board and offcut it was cut from — so every number in
  the BOM can be traced back to the geometry that produced it.

## What's implemented

- Rectangle / L-shape / U-shape deck polygons, with click-to-edit
  dimension labels directly on the plan (typing a new length resizes the
  shape; rectangles stay clean rectangles, general polygons use a
  documented edge-length-edit rule).
- Board orientation (horizontal/vertical/diagonal 45°/custom), trallspalt,
  uniform CC-avstånd for reglar (real CC is mathematically guaranteed to
  never exceed the configured max — see CALCULATION_AUDIT.md), bärlinor
  with max span, plintar with max spacing and P1/P2/... numbering, stolpar
  height derived from build-up height, kortlingar estimate.
- Full material library (trall, regel, bärlina, stolpe, plint, skruv,
  beslag, kantbräda, ventilationsprofil) with Swedish names, editable
  prices, supplier, SKU and per-material waste %; Swedish supplier list.
- Cut-length optimisation (mixed-stock-length best-fit with lookahead) with
  reusable offcut reporting and per-row/segment splice tracking.
- Fastener calculation from actual board/joist segment intersections
  (configurable screws-per-intersection, inclusive of board ends landing
  exactly on an edge joist), correct on L/U-shaped decks where a naive
  boards×joists shortcut would overcount. Step-Clip/T-clip stay independent
  and configurable.
- Kantbräda/sargbräda/ventilationsprofil only price on edges classified
  "external" — never a wall edge, a stair edge, or one marked "open".
- Stair (trappa) material take-off engine (riser height, stringer length via
  Pythagoras, tread boards, screws).
- Cost engine: material (purchase quantity, excluding client-supplied
  lines) + labour + machines + transport + excavation + waste removal +
  other → påslag (markup on cost, not a margin) → moms → optional
  ROT-avdrag with per-cost-category eligibility (material/labour/machines/
  transport), defaulting to labour-only.
- Configurable labour productivity (hours/m², hours/unit) — no built-in
  "universal" rate; crew size affects estimated duration, never cost.
- Client-supplied material toggle: appears in the BOM and quantities,
  excluded from price, everywhere from the BOM through to cost totals.
- Validation warnings (CC vs. board recommendation, plint/bärlina spacing,
  runs longer than available stock needing a splice, missing bärlina/
  regel) with the mandatory disclaimer — never a "this is code-compliant"
  claim.
- New/Save/Open (LocalStorage) project, Undo/Redo, four view modes
  (terrass/struktur/material/kostnad), an INSPECT/DEBUG element inspector,
  CSV/JSON export, browser print.
- 114 unit + integration tests covering geometry, board/joist/beam layout,
  footings, cut optimisation, fasteners, BOM, pricing, labour, stairs,
  quotation, and three full end-to-end worked examples (a 14×7 m
  rectangle, an L-shape, and a U-shape) with hand-derived expected values.

## Known limitations / next steps

- Free-form polygon drawing (arbitrary vertex add/remove) is implemented in
  the geometry engine (`insertVertex`/`removeVertex`) but not yet wired to
  a plan-view drawing tool — today's shape tools are Rectangle/L/U presets
  plus per-edge length editing.
- Multiple deck levels and "add a zone around a house" are supported by the
  data model (`Project.levels`) and the store (`addLevel`/`removeLevel`)
  but the UI only exposes a single active level so far.
- Stair placement is calculated but not yet drawn on the plan or editable
  from a dedicated "Lägg till trappa" tool. Wall/open edge classification
  for kantbräda is a data-model field (`DeckLevel.wallEdgeIndices` /
  `openEdgeIndices`) without a dedicated UI control yet.
- Openings (holes) are supported end-to-end in the geometry/board/joist
  engines but have no UI to draw one yet.
- PDF export currently uses the browser print dialog (with print-specific
  CSS) rather than a generated PDF file.
- Persistence is LocalStorage only, by design — `store/projectStore.ts`
  isolates load/save behind small functions so swapping in a backend later
  doesn't touch the rest of the app.
