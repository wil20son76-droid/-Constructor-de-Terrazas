# Terrassdesigner

A professional web app for designing wooden decks (träterrasser) and
automatically calculating materials, cut lists, labour and costs for the
Swedish market. Built for construction companies: metric units (mm/cm/m/m²),
SEK pricing, Swedish material names, moms (VAT) and ROT-avdrag support.

This is the MVP milestone described in the project brief: a fully working
visual designer + material/cost calculator, built on a real, tested
calculation engine — not a static mockup.

## Stack

React + TypeScript + Vite + Tailwind CSS v4. Deck geometry is rendered with
SVG. State lives in a small Zustand store with undo/redo and LocalStorage
persistence.

## Getting started

```bash
npm install
npm run dev       # start the dev server
npm run test      # run the calculation-engine unit tests (Vitest)
npm run build     # type-check + production build
```

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
  deck/          Deck-board (trall) layout engine (orientation, gap, clipping)
  structural/    Reglar/bärlinor/plintar/stolpar/kortlingar layout + stairs
  materials/     BOM assembly, cut-length optimisation (bin packing),
                 fastener counting
  pricing/       Cost summary: material + labour + margin + moms + ROT
  labour/        Configurable productivity → hours → cost
  quotation/     Offert assembly (client-supplied materials excluded from
                 price but still listed in quantities)
  validation/    Non-normative sanity checks + the required disclaimer
  export/        CSV / JSON / print (PDF via browser print)
  data/          Seed material library, suppliers, default project
  store/         Zustand project store (undo/redo, LocalStorage)
  hooks/         useLevelCalculations — wires a DeckLevel through every
                 engine above and memoises the result for the UI
  components/    Three-panel UI: tools (left), interactive SVG plan
                 (centre), properties/materials/costs (right)
```

### Why this split matters

- **geometry** never rotates/scales for pixels — the SVG plan view is the
  only place mm gets converted to screen space, and only for drawing.
- **deck** and **structural** share one scanline primitive
  (`structural/memberLayout.ts`) that clips parallel, evenly-spaced lines
  (boards, joists, or beams) against a polygon with holes — used for
  rectangles, L-shapes, U-shapes and free polygons alike.
- **materials** turns geometry into a priced bill of materials. Long runs
  (e.g. a 14 m board row with only 5.4 m boards in stock) are split into
  physically buildable spliced segments *before* cut optimisation, so the
  BOM reflects what a crew would actually buy and cut — not one impossibly
  long "board".
- **pricing/labour/validation** are all driven by user-editable
  configuration (productivity rates, margin, VAT, ROT percent/cap,
  recommended joist spacing per board). Nothing is hard-coded as
  "structurally correct" — the app surfaces warnings, never certification.

## What's implemented

- Rectangle / L-shape / U-shape deck polygons, with click-to-edit
  dimension labels directly on the plan (typing a new length resizes the
  shape; rectangles stay clean rectangles, general polygons use a
  documented edge-length-edit rule).
- Board orientation (horizontal/vertical/diagonal 45°/custom), trallspalt,
  CC-avstånd for reglar, bärlinor with max span, plintar with max spacing
  and P1/P2/... numbering, stolpar height derived from build-up height,
  kortlingar estimate.
- Full material library (trall, regel, bärlina, stolpe, plint, skruv,
  beslag, kantbräda, ventilationsprofil) with Swedish names, editable
  prices, supplier, SKU and per-material waste %; Swedish supplier list.
- Cut-length optimisation (first-fit-decreasing bin packing) with reusable
  offcut reporting, run-splitting for long runs.
- Fastener calculation from actual board/joist intersections (configurable
  screws-per-intersection), plus vinkelbeslag/plintskruv/konstruktionsskruv.
- Stair (trappa) material take-off engine (riser height, stringer length via
  Pythagoras, tread boards, screws).
- Cost engine: material (excluding client-supplied lines) + labour +
  machines + transport + excavation + waste removal + other → margin →
  moms → optional ROT-avdrag (labour-only, user-configured rate and cap).
- Configurable labour productivity (hours/m², hours/unit) — no built-in
  "universal" rate.
- Client-supplied material toggle: appears in quantities, excluded from
  price, everywhere from the BOM through to cost totals.
- Validation warnings (CC vs. board recommendation, plint/bärlina spacing,
  runs longer than available stock, missing bärlina/regel) with the
  mandatory disclaimer — never a "this is code-compliant" claim.
- New/Save/Open (LocalStorage) project, Undo/Redo, four view modes
  (terrass/struktur/material/kostnad), CSV/JSON export, browser print.
- 42 unit tests covering geometry, board/joist/beam layout, cut
  optimisation, fasteners, pricing and labour.

## Known limitations / next steps

- Free-form polygon drawing (arbitrary vertex add/remove) is implemented in
  the geometry engine (`insertVertex`/`removeVertex`) but not yet wired to
  a plan-view drawing tool — today's shape tools are Rectangle/L/U presets
  plus per-edge length editing.
- Multiple deck levels and "add a zone around a house" are supported by the
  data model (`Project.levels`) and the store (`addLevel`/`removeLevel`)
  but the UI only exposes a single active level so far.
- Stair placement is calculated but not yet drawn on the plan or editable
  from a dedicated "Lägg till trappa" tool.
- Openings (holes) are supported end-to-end in the geometry/board/joist
  engines but have no UI to draw one yet.
- PDF export currently uses the browser print dialog (with print-specific
  CSS) rather than a generated PDF file.
- Persistence is LocalStorage only, by design — `store/projectStore.ts`
  isolates load/save behind small functions so swapping in a backend later
  doesn't touch the rest of the app.
